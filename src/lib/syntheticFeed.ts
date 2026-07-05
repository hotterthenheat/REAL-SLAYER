/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SYNTHETIC FEED — client-side mock-data driver for the Slayer terminal.
 *
 * When the app runs with NO backend (frontend-only dev / preview), there is no SSE
 * stream, so every page that reads `serverState` would render an empty skeleton.
 * This module produces complete, live-looking `ServerStatePayload` frames entirely
 * in the browser, using the SAME deterministic math engines the server uses. Each
 * frame is pushed through the real `updateFromSSE` reducer, so it is built to pass
 * that reducer's race + integrity guards (see store.ts / dataIntegrity.ts):
 *   • contract's first token === selected ticker
 *   • optionStrike === the strike we priced
 *   • provenance.inputs.option_type / underlying_price present and consistent
 *   • spot > 0, trade_health an integer 0..100, candles well-formed & ascending
 *
 * It is BROWSER-SAFE: it imports only from ../types, ../data and the pure ./lib
 * math engines — never from src/server, a provider, ../db, or any node-only module.
 * All data is honestly labelled SANDBOX_SYNTHETIC / DETERMINISTIC_MODEL and whale
 * detection uses placeholders (never fabricated dollar notionals).
 */
import type {
  AssetInfo,
  TimeframeVal,
  ServerStatePayload,
  Candle,
  GexStrikeDetail,
  FlowFeedItem,
} from '../types';
import {
  ASSET_LIST,
  TIMEFRAMES,
  generateInitialCandles,
  calculateFVGs,
  calculateLiquidityEvents,
  optionDteDays,
  optionExpiryLabel,
  optionExpiryDate,
  hoursToSessionClose,
  synthesizeExpirySlices,
} from '../data';
import {
  generateMockOptionsChain,
  calculateSystemScoreFromCandles,
  calculateV11Metrics,
  computeBlackScholesPrice,
  type ChainContract,
} from './v11Math';
import { computeStrikeGravity } from './strikeGravity';
import { computeDealerDynamics, type DealerSnapshot } from './dealerDynamics';
import { compute0DTE } from './zeroDte';
import { buildTradePlan } from './tradePlan';
import { computeAssetEdge, computeContractEdge, type EdgeHistory } from './quantEdge';
import { buildGexSummary } from './gexSummary';
import { analyzeMarketStructure, computeVolatilityEngine, detectDisplacementZones } from './displacementEngine';
import { computeTechnicalRead } from './technicalEngine';
import {
  snapshotFromMarket,
  scoreContract,
  rankContractStrengths,
  computeEmaLadder,
  buildTargetStack,
  projectTargetPremiums,
  detectSwings,
  emaStructureScore,
  computeMasterScore,
  type ContractSnapshot,
  type ScoredContract,
} from './skyVisionEngine';

// ── Public API (pinned — App.tsx wiring depends on this) ─────────────────────
export interface SyntheticSelection {
  asset: AssetInfo;        // the store's selectedAsset
  timeframe: TimeframeVal; // selectedTimeframe
  isCall: boolean;         // selectedOptionType === 'C'
  strike: number | null;   // selectedStrike (null = not locked)
  positionOpen: boolean;   // isPositionOpen
}

export interface SyntheticFeed {
  /** Build the next live-looking full payload for the current selection. Call ~1/sec. */
  nextFrame(sel: SyntheticSelection): ServerStatePayload;
}

const RISK_FREE = 0.05;
const CANDLE_CAP = 220;      // rolling window kept per (ticker, timeframe)
const SKY_HISTORY_CAP = 30;  // per-contract snapshot history for Sky Vision

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Option-chain strike step, matching generateMockOptionsChain so the ATM strike is a real chain strike. */
function stepFor(spot: number): number {
  return spot > 1000 ? 50 : spot > 150 ? 5 : 1;
}

// ── Internal rolling state ───────────────────────────────────────────────────
interface DriverState {
  candles: Map<string, Candle[]>;       // `${ticker}-${timeframe}` → rolling OHLC
  rets: Map<string, number>;            // last AR(1) return per candle series
  dealerHist: Map<string, DealerSnapshot[]>; // per-ticker dealer-dynamics history
  edgeHist: Map<string, EdgeHistory>;   // per-ticker quant-edge rolling percentiles
  skyHist: Map<string, ContractSnapshot[]>;  // per-contract Sky Vision snapshot history
  skyPrevSpot: Map<string, number>;     // per-ticker prior spot (Sky Vision momentum)
  flowFeed: FlowFeedItem[];             // rolling institutional flow tape
  spots: Map<string, number>;           // last spot per ticker (for liveSpotPrices)
  tick: number;
}

// ── Candle generation ────────────────────────────────────────────────────────
/** Append one AR(1)-ish random-walk bar to a series, keeping OHLC well-formed. */
function nextCandle(prev: Candle, asset: AssetInfo, minMult: number, prevRet: number): { candle: Candle; ret: number } {
  const vol = asset.volatility;
  const eps = (Math.random() - 0.5) * 0.003 * (0.5 + vol);
  let ret = 0.6 * prevRet + eps;                 // AR(1) with phi = 0.6
  ret = clamp(ret, -0.02, 0.02);
  const open = prev.close;
  const close = Math.max(0.01, open * (1 + ret));
  const wickUp = Math.random() * 0.0015 * (0.5 + vol) * open;
  const wickDown = Math.random() * 0.0015 * (0.5 + vol) * open;
  const high = Math.max(open, close) + wickUp;
  const low = Math.max(0.0001, Math.min(open, close) - wickDown);
  const baseVol = 100000 * (asset.decimals === 5 ? 0.01 : 1);
  const volume = Math.max(1, Math.floor(baseVol * (0.6 + Math.random() * 1.2)));
  const typical = (high + low + close) / 3;
  const candle: Candle = {
    timestamp: prev.timestamp + minMult * 60000,
    open, high, low, close, volume,
    vwap: typical,
    isDisplacement: false,
    displacementType: null,
    relativeVolume: Number((volume / baseVol).toFixed(2)),
  };
  return { candle, ret };
}

/** Seed on first use, else roll one bar. Returns the current rolling candle array. */
function advanceCandles(state: DriverState, asset: AssetInfo, timeframe: TimeframeVal): Candle[] {
  const key = `${asset.ticker}-${timeframe}`;
  const minMult = TIMEFRAMES.find((t) => t.val === timeframe)?.minMultiplier ?? 5;
  let arr = state.candles.get(key);
  if (!arr || arr.length === 0) {
    arr = generateInitialCandles(asset, timeframe);
    state.candles.set(key, arr);
    state.rets.set(key, 0);
    return arr;
  }
  const prev = arr[arr.length - 1];
  const { candle, ret } = nextCandle(prev, asset, minMult, state.rets.get(key) ?? 0);
  arr.push(candle);
  if (arr.length > CANDLE_CAP) arr = arr.slice(-CANDLE_CAP);
  state.candles.set(key, arr);
  state.rets.set(key, ret);
  return arr;
}

// ── GEX profile per-strike aggregation (mirrors marketEngine) ────────────────
function buildGexStrikes(chain: ChainContract[], spot: number): GexStrikeDetail[] {
  const map = new Map<number, GexStrikeDetail>();
  for (const c of chain) {
    const stk = c.strike;
    let row = map.get(stk);
    if (!row) {
      row = {
        strike: stk,
        callGex: 0, putGex: 0, netGex: 0,
        callDex: 0, putDex: 0, netDex: 0,
        callVex: 0, putVex: 0, netVex: 0,
        callOi: 0, putOi: 0, callVolume: 0, putVolume: 0,
        charmEx: 0, callPrem: 0, putPrem: 0, netPrem: 0,
      };
      map.set(stk, row);
    }
    const isCallType = c.type === 'call';
    const sign = isCallType ? 1 : -1;
    const oi = c.openInterest || 0;
    const volu = c.volume || 0;
    const mid = c.bid > 0 && c.ask > 0 ? (c.bid + c.ask) / 2 : Math.max(c.bid, c.ask, 0);
    const gexAmt = c.gamma * oi * 100 * (spot * spot) * 0.01 * sign;
    const dexAmt = c.delta * oi * 100 * spot * sign;
    const vexAmt = c.vega * oi * 100 * sign;
    const charmAmt = c.charm * oi * 100 * sign;
    const premAmt = mid * volu * 100;
    if (isCallType) {
      row.callGex! += gexAmt; row.callDex! += dexAmt; row.callVex! += vexAmt;
      row.callOi += oi; row.callVolume += volu; row.callPrem! += premAmt;
    } else {
      row.putGex! += gexAmt; row.putDex! += dexAmt; row.putVex! += vexAmt;
      row.putOi += oi; row.putVolume += volu; row.putPrem! += premAmt;
    }
    row.netGex += gexAmt; row.netDex! += dexAmt; row.netVex! += vexAmt; row.charmEx! += charmAmt;
    row.netPrem = (row.callPrem || 0) - (row.putPrem || 0);
  }
  return Array.from(map.values()).sort((a, b) => a.strike - b.strike);
}

// ── Sky Vision (replicates skyVisionService.computeForAsset MODEL path) ───────
function trendScore(hist: ContractSnapshot[], pick: (s: ContractSnapshot) => number): number {
  if (hist.length < 2) return 50;
  const a = pick(hist[0]);
  const b = pick(hist[hist.length - 1]);
  const rel = (b - a) / (Math.abs(a) + 1e-9);
  return Math.round(clamp(50 + 50 * Math.tanh(3 * rel), 0, 100));
}

function buildSkyVision(state: DriverState, asset: AssetInfo, spot: number, candles: Candle[], step: number) {
  const ticker = asset.ticker;
  const ps = state.skyPrevSpot.get(ticker) ?? spot;
  const momentum = spot - ps;
  state.skyPrevSpot.set(ticker, spot);

  const closes = candles.map((c) => c.close);
  const emas = computeEmaLadder(closes.length >= 2 ? closes : [spot, spot]);
  const atm = Math.round(spot / step) * step;
  const iv0 = asset.volatility;
  const dte = optionDteDays(asset);
  const emPts = spot * iv0 * Math.sqrt(dte / 365);
  const STRIKES_EACH_SIDE = 3;

  const specs: { strike: number; isCall: boolean }[] = [];
  for (let i = 0; i <= STRIKES_EACH_SIDE; i++) specs.push({ strike: atm + i * step, isCall: true });
  for (let i = 0; i <= STRIKES_EACH_SIDE; i++) specs.push({ strike: atm - i * step, isCall: false });

  const scored: ScoredContract[] = [];
  const meta = new Map<string, { snap: ContractSnapshot; volume: number; oi: number; iv: number }>();

  for (const { strike, isCall } of specs) {
    const key = `${ticker} ${strike}${isCall ? 'C' : 'P'}`;
    const prevHist = state.skyHist.get(key) || [];
    const moneyness = (strike - spot) / (spot || 1);
    const iv = clamp(iv0 + (isCall ? -0.15 : 0.25) * moneyness + 0.02 * Math.abs(moneyness), 0.05, 1.5);
    const nearness = Math.max(0, 1 - Math.abs(strike - spot) / (4 * step));
    const dirFlow = isCall ? Math.max(0, momentum) : Math.max(0, -momentum);
    const prevVol = prevHist.length ? prevHist[prevHist.length - 1].volume : 250 + nearness * 400;
    const prevOi = prevHist.length ? prevHist[prevHist.length - 1].oi : 1200 + nearness * 1500;
    const volume = Math.max(20, Math.round(prevVol * 0.6 + (250 + nearness * 600 + dirFlow * 220 * nearness) * 0.4));
    const oi = Math.max(50, Math.round(prevOi + nearness * 30 + dirFlow * 25 * nearness));
    const snap = snapshotFromMarket({ t: state.tick, spot, strike, dteDays: dte, iv, isCall, volume, oi, r: RISK_FREE });
    const hist = prevHist.concat(snap).slice(-SKY_HISTORY_CAP);
    state.skyHist.set(key, hist);
    meta.set(key, { snap, volume, oi, iv });
    scored.push({ key, strike, isCall, strength: scoreContract(hist, isCall) });
  }

  const ranked = rankContractStrengths(scored);
  const contracts = ranked.map((r) => {
    const m = meta.get(r.key)!;
    return {
      key: r.key,
      strike: r.strike,
      isCall: r.isCall,
      premium: m.snap.premium,
      delta: m.snap.delta,
      gamma: m.snap.gamma,
      theta: m.snap.theta,
      vega: m.snap.vega,
      iv: Number(m.iv.toFixed(2)),
      volume: m.volume,
      oi: m.oi,
      strength: r.strength.score,
      trend: r.strength.trend as string,
      confidence: r.strength.confidence,
      label: r.strength.label,
      rank: r.rank,
      strongest: r.strongest,
    };
  });

  const bestCall = contracts.filter((c) => c.isCall).sort((a, b) => b.strength - a.strength)[0] || null;
  const bestPut = contracts.filter((c) => !c.isCall).sort((a, b) => b.strength - a.strength)[0] || null;
  const callS = bestCall?.strength ?? 0;
  const putS = bestPut?.strength ?? 0;
  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = callS - putS > 8 ? 'BULLISH' : putS - callS > 8 ? 'BEARISH' : 'NEUTRAL';
  const leadIsCall = direction !== 'BEARISH';
  const lead = leadIsCall ? bestCall : bestPut;

  const callsAbove = contracts.filter((c) => c.isCall && c.strike >= spot);
  const putsBelow = contracts.filter((c) => !c.isCall && c.strike <= spot);
  const callWall = callsAbove.sort((a, b) => b.oi - a.oi)[0]?.strike ?? atm + step;
  const putWall = putsBelow.sort((a, b) => b.oi - a.oi)[0]?.strike ?? atm - step;
  const walls = { gamma: leadIsCall ? callWall : putWall, call: callWall, put: putWall };

  const leadStrike = lead?.strike ?? atm;
  const leadIv = lead ? lead.iv : iv0;
  const stack = buildTargetStack({
    spot, isCall: leadIsCall, emas,
    walls: { gamma: walls.gamma, call: callWall, put: putWall },
    emHigh: spot + emPts, emLow: spot - emPts,
  });
  const targetStack = projectTargetPremiums(stack, {
    spot, strike: leadStrike, dteDays: dte, iv: leadIv, isCall: leadIsCall, entryPremium: lead?.premium,
  });

  const leadKey = lead?.key ?? `${ticker} ${atm}${leadIsCall ? 'C' : 'P'}`;
  const leadHist = state.skyHist.get(leadKey) || [];
  const dealerAligned = leadIsCall ? spot < callWall : spot > putWall;
  const swing = detectSwings({ isCall: leadIsCall, emas, history: leadHist, dealerAligned });

  const flowStrength = lead ? trendScore(leadHist, (s) => s.volume) : 50;
  const volumeProfile = flowStrength;
  const ivStructure = lead ? trendScore(leadHist, (s) => s.iv) : 50;
  const emaStruct = emaStructureScore(spot, emas, leadIsCall);
  const dealerPositioning = Math.round(clamp(50 + (dealerAligned ? 20 : -10) + (emaStruct - 50) * 0.3, 0, 100));
  const swingEngine = Math.max(swing.shortTerm.strength, swing.longTerm.strength);

  const master = computeMasterScore({
    contractStrength: lead?.strength ?? 50,
    flowStrength, dealerPositioning, emaStructure: emaStruct, volumeProfile, ivStructure, swingEngine,
    direction,
    bestContract: leadKey,
    swingType: swing.shortTerm.detected
      ? `Short-term (${swing.shortTerm.expectedDuration})`
      : swing.longTerm.detected ? `Long-term (${swing.longTerm.expectedDuration})` : 'No active swing',
    target: targetStack[0] ? `${targetStack[0].label} ${targetStack[0].underlying}` : '—',
  });

  const source = 'MODEL' as const;
  return {
    ticker,
    spot: Number(spot.toFixed(2)),
    direction,
    emaLadder: emas,
    walls,
    bestCall,
    bestPut,
    contracts,
    targetStack,
    leadContract: leadKey,
    swing,
    master,
    source,
    isLive: false,
    updatedAt: Date.now(),
  };
}

// ── Factory ──────────────────────────────────────────────────────────────────
export function createSyntheticFeed(): SyntheticFeed {
  const state: DriverState = {
    candles: new Map(),
    rets: new Map(),
    dealerHist: new Map(),
    edgeHist: new Map(),
    skyHist: new Map(),
    skyPrevSpot: new Map(),
    flowFeed: [],
    spots: new Map(),
    tick: 0,
  };

  function nextFrame(sel: SyntheticSelection): ServerStatePayload {
    state.tick++;
    const { asset, timeframe, isCall, positionOpen } = sel;
    const ticker = asset.ticker;
    const dir = isCall ? 1 : -1;

    // 1. Candles + spot.
    const candles = advanceCandles(state, asset, timeframe);
    const spot = Math.max(0.01, candles[candles.length - 1].close);
    state.spots.set(ticker, spot);

    // 2. Strike: echo the locked strike exactly, else the ATM grid strike.
    const step = stepFor(spot);
    const atmStrike = Math.round(spot / step) * step;
    const optionStrike = sel.strike != null ? sel.strike : atmStrike;

    // 3. Core engines.
    const dteDays = optionDteDays(asset);
    const hoursToClose = hoursToSessionClose();
    const expiryLabel = optionExpiryLabel(asset);
    const chain = generateMockOptionsChain(spot, asset.volatility);
    const systemScore = calculateSystemScoreFromCandles(candles, dir, asset.volatility);
    const optionPremiumFloat = Number(
      Math.max(0.05, computeBlackScholesPrice(spot, optionStrike, dteDays, asset.volatility, isCall)).toFixed(2),
    );
    // Undefined chain ⇒ calculateV11Metrics builds its own model chain from the same
    // (spot, volatility), mirroring the server's sandbox path.
    const metricsV11 = calculateV11Metrics(asset, isCall, systemScore, optionPremiumFloat, optionStrike, undefined, spot, dteDays);

    const netGex = metricsV11.dealer.netGex;
    const netCharm = metricsV11.dealer.netCharm;
    const netVanna = metricsV11.dealer.netVex;
    const callWall = metricsV11.dealer.callWall;
    const putWall = metricsV11.dealer.putWall;
    const gammaFlip = Number(metricsV11.dealer.gammaFlipPrice.toFixed(2));

    // 4. GEX profile.
    const gexStrikes = buildGexStrikes(chain, spot);
    const totalCallOi = chain.filter((c) => c.type === 'call').reduce((a, c) => a + (c.openInterest || 0), 0);
    const totalPutOi = chain.filter((c) => c.type === 'put').reduce((a, c) => a + (c.openInterest || 0), 0);
    const callPutOiRatio = totalPutOi > 0 ? `${(totalCallOi / totalPutOi).toFixed(2)} : 1` : '1.00 : 1';
    const totalOi = totalCallOi + totalPutOi;
    const magnet = gexStrikes.length
      ? gexStrikes.reduce((mx, s) => (Math.abs(s.netGex) > Math.abs(mx.netGex) ? s : mx), gexStrikes[0]).strike
      : optionStrike;
    const expiries = synthesizeExpirySlices(
      gexStrikes.map((s) => ({
        strike: s.strike, netGex: s.netGex, callGex: s.callGex, putGex: s.putGex,
        vol: (s.callVolume || 0) + (s.putVolume || 0) || (s.callOi || 0) + (s.putOi || 0),
      })),
      asset,
    );
    const gex_profile = {
      spot,
      netGex,
      netDex: metricsV11.dealer.netDex,
      netVex: netVanna,
      callWall,
      putWall,
      gammaFlip,
      magnet,
      totalCallOi,
      totalPutOi,
      callPutOiRatio,
      expectedMovePct: metricsV11.surface.expectedMovePct,
      gammaFlipConfident: metricsV11.dealer.gammaFlipConfident,
      wallsConfident: metricsV11.dealer.wallsConfident,
      feed: 'DETERMINISTIC_MODEL',
      expiryLabel,
      expiryDate: optionExpiryDate(asset),
      strikes: gexStrikes,
      ...(expiries.length ? { expiries } : {}),
    };

    // 5. Strike gravity.
    const strike_gravity = computeStrikeGravity(gexStrikes, spot, 10);

    // 6. Dealer dynamics (rolling per-ticker history).
    let dealerHistory = state.dealerHist.get(ticker);
    if (!dealerHistory) { dealerHistory = []; state.dealerHist.set(ticker, dealerHistory); }
    const dealer_dynamics = computeDealerDynamics(chain, spot, { netGex, netVanna, netCharm }, dealerHistory);

    // 7. 0DTE probability engine.
    const atmIv = asset.volatility;
    const zerodte = compute0DTE({
      spot, atmIv, hoursToClose, netGex, magnet,
      strikes: gexStrikes.map((s) => ({ strike: s.strike, netGex: s.netGex })),
    });

    // 8. Quant edge (asset block + contract Kelly/scenario).
    let edgeHistory = state.edgeHist.get(ticker);
    if (!edgeHistory) { edgeHistory = { rr: [], bf: [] }; state.edgeHist.set(ticker, edgeHistory); }
    const assetEdge = computeAssetEdge({
      chain, candles, spot, rndDteDays: 5, netCharm, netVanna, history: edgeHistory, ticker, flow: [],
    });
    const contractEdge = computeContractEdge({
      spot, strike: optionStrike, dteDays, iv: assetEdge.skew?.atmIv ?? asset.volatility, isCall,
      entryPrice: optionPremiumFloat, winPct: metricsV11.posteriorWinRate / 100, riskReward: metricsV11.riskRewardRatio,
    });
    const quant_edge = { ...assetEdge, ...contractEdge };

    // 9. GEX plain-English summary.
    const gex_summary = {
      text: buildGexSummary({
        ticker, spot, decimals: asset.decimals, netGex, callWall, putWall, gammaFlip, magnet, expiryLabel,
        dynamics: dealer_dynamics,
      }),
      generatedAt: Date.now(),
      nextRefreshAt: Date.now() + 30 * 60 * 1000,
    };

    // 10. Displacement (structure / volatility / zones / fvgs / sweeps).
    const structureRead = analyzeMarketStructure(candles);
    const volRead = computeVolatilityEngine(candles);
    const displacement = {
      volatility: {
        energy: volRead.energy,
        atrPercentile: volRead.atrPercentile,
        atrSlope: volRead.atrSlope,
        regime: volRead.regime,
        squeeze: volRead.squeeze,
      },
      structure: {
        trend: structureRead.trend,
        pricePosition: structureRead.pricePosition ?? undefined,
        events: structureRead.events,
      },
      zones: detectDisplacementZones(candles).zones,
      fvgs: calculateFVGs(candles),
      sweeps: calculateLiquidityEvents(candles),
    };

    // 11. Technical read + trade plan.
    const technicalRead = computeTechnicalRead({
      candles1m: candles, candles5m: candles, candles15m: candles,
      spot, systemScoreTotal: systemScore.total, structureTrend: structureRead.trend,
    });
    const emEodPts = zerodte.expectedMove.find((b) => b.horizon === 'EOD')?.movePts || spot * atmIv * 0.02;
    const trade_plan = buildTradePlan({
      ticker, spot, step, emPts: emEodPts, hoursToClose,
      regimeState: assetEdge.regime?.state || 'BALANCED',
      technical: technicalRead,
      dealer: { netGex, gammaFlip: metricsV11.dealer.gammaFlipPrice, callWall, putWall },
      contractScore: Math.round(clamp(metricsV11.opportunityQuality, 0, 100)),
      winRate: metricsV11.posteriorWinRate,
      loadedStrike: strike_gravity.primary?.strike ?? null,
      liquidityHigh: structureRead.rangeHigh,
      liquidityLow: structureRead.rangeLow,
    });

    // 12. Sky Vision.
    const sky_vision = buildSkyVision(state, asset, spot, candles, step);

    // 13. Dealer flow.
    const dealerBias = netGex >= 0 ? 'LONG GAMMA' : 'SHORT GAMMA';
    const pressureVal = Math.round((metricsV11.dealer.dealerPressureIndex / 10 - 0.5) * 200);
    const dealer_flow = {
      bias: dealerBias,
      pressure: pressureVal,
      headline: netGex >= 0
        ? `Dealers hold net positive gamma (${(netGex / 1e9).toFixed(2)}B) above the ${gammaFlip.toFixed(asset.decimals)} flip — a stabilizing, mean-reverting corridor.`
        : `Dealers hold net negative gamma (${(netGex / 1e9).toFixed(2)}B) below the ${gammaFlip.toFixed(asset.decimals)} flip — hedging amplifies moves.`,
      components: [
        { name: 'GEX ALIGNMENT', detail: 'Dealer Gamma Exposure Direction', value: Math.tanh(netGex / 2e9), weight: 0.5 },
        { name: 'DEX HEDGE', detail: 'Delta Hedging Re-alignment Force', value: Math.tanh(metricsV11.dealer.netDex / 5e9), weight: 0.3 },
        { name: 'VEX VOLATILITY', detail: 'Vega/Vanna Hedge Adjustment Rate', value: Math.tanh(netVanna / 1e7), weight: 0.2 },
      ],
    };

    // 14. Deep intelligence (honest whale placeholders; no fabricated notionals).
    const impactRanked = chain.map((c) => {
      const gDelta = Math.abs(c.delta || 0.5);
      const gGamma = Math.abs(c.gamma || 0.05);
      const proximity = Math.exp(-Math.abs(c.strike - spot) / (spot * 0.05));
      const hedgeImpact = (c.openInterest * gDelta * 100 * spot + c.openInterest * gGamma * 100 * spot * spot * 0.01) * proximity;
      return {
        contract: `${ticker} ${c.strike}${c.type === 'call' ? 'C' : 'P'}`,
        oi: c.openInterest,
        volume: c.volume || 0,
        deltaNotional: `$${((c.openInterest * spot * gDelta * 100) / 1e9).toFixed(2)}B`,
        gammaContribution: `${((c.openInterest / (totalOi || 1)) * 100).toFixed(1)}%`,
        hedgeImpact,
      };
    }).sort((a, b) => b.hedgeImpact - a.hedgeImpact).slice(0, 3);
    const impact_contracts = impactRanked.map((it, i) => ({
      rank: i + 1, contract: it.contract, expiration: expiryLabel,
      oi: it.oi, volume: it.volume, deltaNotional: it.deltaNotional, gammaContribution: it.gammaContribution,
    }));

    // Roll the institutional flow tape (labelled model output).
    const flowType = dir >= 0 ? 'CALL SWEEP' : 'PUT SWEEP';
    state.flowFeed.unshift({
      id: `flow-${state.tick}`,
      type: flowType,
      contract: `${ticker} ${optionStrike}${isCall ? 'C' : 'P'}`,
      desc: `Model-derived ${flowType.toLowerCase()} near ${optionStrike} (${expiryLabel}).`,
    });
    if (state.flowFeed.length > 12) state.flowFeed.length = 12;

    const netGexVal = netGex / 1e9;
    const deep_intelligence = {
      dealer_metrics: {
        bias: dealerBias,
        volState: metricsV11.surface.ivPercentile < 50 ? 'COMPRESSED' : 'EXPANDED',
        magnetStrike: magnet,
        flipLevel: gammaFlip,
        callWall, putWall,
        dealerScore: Math.min(100, Math.max(12, Math.round(metricsV11.dealer.dealerPressureIndex * 10))),
      },
      strike_metrics: {
        totalOi,
        netExposure: `${netGexVal >= 0 ? '+' : ''}${netGexVal.toFixed(2)}B`,
        callPutRatio: callPutOiRatio,
        hedgeSensitivity: Math.abs(netGexVal) > 5 ? 'EXTREME' : Math.abs(netGexVal) > 2 ? 'HIGH' : 'MODERATE',
        dealerExposure: dealerBias === 'LONG GAMMA' ? 'SHORT GAMMA' : 'LONG GAMMA',
        gammaContribution: `${(((gexStrikes.find((s) => s.strike === optionStrike)?.callOi ?? 0) + (gexStrikes.find((s) => s.strike === optionStrike)?.putOi ?? 0)) / (totalOi || 1) * 100).toFixed(1)}%`,
        deltaContribution: `${(100 / Math.max(1, gexStrikes.length)).toFixed(1)}%`,
      },
      commentary: [
        netGex >= 0
          ? `Dealers remain net LONG GAMMA above the ${gammaFlip.toFixed(asset.decimals)} flip; hedging dampens realized volatility.`
          : `Dealers hold NET NEGATIVE gamma below the ${gammaFlip.toFixed(asset.decimals)} flip; hedging accelerates momentum.`,
        `Overhead call wall at ${callWall.toFixed(asset.decimals)}, downside put wall at ${putWall.toFixed(asset.decimals)}.`,
        `Magnet strike ${magnet.toFixed(asset.decimals)} carries the heaviest gamma concentration into ${expiryLabel}.`,
        metricsV11.surface.ivPercentile < 50
          ? `IV rank compressed at ${metricsV11.surface.ivRank}% — options are structurally cheap.`
          : `IV rank expanded to ${metricsV11.surface.ivRank}% — premium-selling environment.`,
      ],
      impact_contracts,
      whale_detection: {
        bullish: { contract: 'N/A (MODEL)', size: '—' },
        bearish: { contract: 'N/A (MODEL)', size: '—' },
        largestCall: 'N/A (MODEL)',
        largestPut: 'N/A (MODEL)',
      },
      flow_feed: state.flowFeed.slice(),
    };

    // 15. Literal / derived blocks.
    const position_management = {
      momentum: systemScore.momentumAcceleration >= 7 ? 'ACCELERATING' : 'DEGRADED',
      dealer_support: metricsV11.dealer.dealerPressureIndex >= 6 ? 'IMPROVING' : 'WEAK',
      liquidity: metricsV11.liquidity.liquidityScore >= 70 ? 'STRONG' : 'MODERATE',
      risk: metricsV11.tailRisk.tailRiskScore <= 0.45 ? 'FALLING' : 'ELEVATED',
      decision_reason: metricsV11.decisionReason,
      feed: 'DETERMINISTIC_MODEL',
    };

    const hud_metrics = {
      reflexivity_vector: netGex >= 0 ? 'Dampened — dealers fade extremes' : 'Amplified — dealers chase breakouts',
      systemic_fragility: `${Math.round(clamp(metricsV11.tailRisk.tailRiskScore * 100, 0, 100))}/100 tail-risk load`,
      campaign_state: sky_vision.direction === 'NEUTRAL' ? 'Range / accumulation' : `${sky_vision.direction} campaign engaged`,
      propagation_path: `${putWall.toFixed(asset.decimals)} → ${magnet.toFixed(asset.decimals)} → ${callWall.toFixed(asset.decimals)}`,
    };

    const liveSpotPrices: Record<string, number> = {};
    for (const a of ASSET_LIST) liveSpotPrices[a.ticker] = state.spots.get(a.ticker) ?? a.defaultPrice;
    liveSpotPrices[ticker] = spot;

    const emPct = metricsV11.surface.expectedMovePct;
    const expected_move = {
      pct: `${(emPct * 100).toFixed(1)}%`,
      range: `±${(spot * emPct).toFixed(1)} pts`,
      ivRank: metricsV11.surface.ivRank,
      ivPercentile: metricsV11.surface.ivPercentile,
      feed: 'DETERMINISTIC_MODEL',
    };

    const pinpoint_map = { spot_price: spot, step };

    const targets = metricsV11.targets.map((t) => ({
      label: t.label,
      price: Number(t.price.toFixed(asset.decimals)),
      optionValue: Number(t.optionValue.toFixed(2)),
      probability: t.probability,
      historicalHitRate: t.historicalHitRate,
      riskReward: t.riskReward,
      confidenceInterval: t.confidenceInterval,
      feed: 'DETERMINISTIC_MODEL',
    }));

    const provenance = {
      inputs: {
        underlying_price: spot,
        volatility: asset.volatility,
        timeframe,
        option_type: (isCall ? 'C' : 'P') as 'C' | 'P',
        strike: optionStrike,
      },
      formula: 'SkyVision Core Intelligence Score (Offline Sandbox Simulation)',
      timestamp: new Date().toISOString(),
      confidence: metricsV11.posteriorWinRate >= 80 ? 'HIGH' : metricsV11.posteriorWinRate >= 65 ? 'MODERATE' : 'STRETCH',
      sample_size: metricsV11.sampleSize,
      version: '11.3 (Sandbox Synthetic)',
      audit_id: `sbx-${ticker}-${state.tick}`,
      feed: 'DETERMINISTIC_MODEL',
    };

    // Recommendation: map the decision gate to the four allowed states.
    let recommendation: 'ENTER' | 'HOLD' | 'REDUCE' | 'EXIT';
    if (positionOpen) {
      recommendation = metricsV11.decision === 'EXIT' ? 'EXIT' : metricsV11.decision === 'REDUCE' ? 'REDUCE' : 'HOLD';
    } else {
      recommendation = metricsV11.decision === 'BUY' ? 'ENTER' : 'HOLD';
    }

    const trade_health = clamp(Math.round(metricsV11.posteriorWinRate), 0, 100);

    const payload: ServerStatePayload = {
      contract: `${ticker} ${optionStrike}${isCall ? 'C' : 'P'}`,
      recommendation,
      trade_health,
      optionPremiumFloat,
      optionStrike,
      data_source: 'SANDBOX_SYNTHETIC',
      api_status_message: 'Offline Sandbox Simulation',
      chain_live: false,
      candle_feed: 'DETERMINISTIC_MODEL',
      candles,
      liveSpotPrices,
      option_chain: chain,
      gex_profile,
      strike_gravity,
      dealer_dynamics,
      gex_summary,
      zerodte,
      trade_plan,
      sky_vision,
      quant_edge,
      dealer_flow,
      displacement,
      deep_intelligence,
      position_management,
      hud_metrics,
      expected_move,
      pinpoint_map,
      provenance,
      targets,
      trade_archive: [],
      system_score: { ...systemScore, feed: 'DETERMINISTIC_MODEL' },
      metricsV11,
      active_greeks: (() => {
        const a = chain.find((c) => c.strike === optionStrike && (c.type === 'call') === isCall);
        return a
          ? { delta: a.delta, gamma: a.gamma, theta: a.theta, vega: a.vega }
          : { delta: isCall ? 0.5 : -0.5, gamma: 0.02, theta: -0.12, vega: 0.05 };
      })(),
    };

    return payload;
  }

  return { nextFrame };
}
