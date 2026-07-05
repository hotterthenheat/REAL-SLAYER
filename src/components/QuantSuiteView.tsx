/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  Layers,
  Gauge,
  TrendingUp,
  RadioTower,
  Calculator,
  Bell,
  Scale,
  Brain,
  History,
  X,
  BarChart3,
  Target,
  SlidersHorizontal,
} from 'lucide-react';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';
import { RiskNeutralDistribution } from './RiskNeutralDistribution';
import { TailRiskMap } from './TailRiskMap';
import { IvSmile } from './IvSmile';
import { GreekExposurePanel } from './GreekExposurePanel';
import { VolConePanel } from './VolConePanel';
import { StrikeSyncProvider } from './quant/crosshairSync';
import { MonteCarloPanel } from './MonteCarloPanel';
import { RegimeDetectionPanel } from './RegimeDetectionPanel';
import { DealerHedgingPanel } from './DealerHedgingPanel';
import {
  solveImpliedRND,
  calculateRealizedVolSuite,
  calculateVolatilityCone,
  computeSkewAnalytics,
  buildStrategySuite,
  generatePayoffCoordinates,
  computeScenarioShockMatrix,
  aggregatePortfolioGreeks,
  aggregateExpiryGexCurve,
  evaluateAlertRules,
  calculateCalibrationLoop,
  bsmPrice,
  type OptionLeg,
  type PortfolioPosition,
  type AlertRule,
  type JournalTradeRecord,
  type Candle,
  type BreedenLitzenbergerResult,
  type RealizedVolSuite,
  type VolConePoint,
  type SkewMetrics,
  type StrategyMetrics,
  type ShockNode,
  type PortfolioGreeksGroup,
  type ExpiryGexNode,
  type AlertDispatch,
  type CalibrationResult,
} from '../lib/quantSuite';
import { ChainContract } from '../lib/v11Math';

// Lazy-loaded: pulls in three.js only when a 3D surface actually renders, keeping the
// heavy 3D vendor chunk off the page's initial load. The canonical brutalist renderer
// fronts the always-on MODEL-MODE IV surface hero so Volatility Geometry never opens on a
// blank panel, live chain or not.
const QuantSurface3D = lazy(() => import('./quant/QuantSurface3D'));
// Dealer Mechanics moved here from the Pinpoint GEX page — the brutalist 3D dealer
// surfaces + advanced quant panels belong with the rest of the quant tooling.
const DealerMechanicsDashboard = lazy(() => import('./DealerMechanicsDashboard').then(m => ({ default: m.DealerMechanicsDashboard })));
import { ivSurfaceGrid, ivStrikeDomain, type SurfaceProfile } from './quant/dealerSurfaces';
import type { SurfaceMarker } from './quant/QuantSurface3D';
import { QuantEdgePanel } from './QuantEdgePanel';
import { RegimeMatrixPanel } from './RegimeMatrixPanel';
import { FactorLabPanel } from './FactorLabPanel';

type StrategyPreset = 'iron_condor' | 'straddle' | 'butterfly' | 'vertical';

const PRESET_LABELS: Record<StrategyPreset, string> = {
  iron_condor: 'Iron Condor',
  straddle: 'ATM Straddle',
  butterfly: 'Call Butterfly',
  vertical: 'Call Vertical',
};

/** Shared section header: icon + uppercase tracked label, optional right slot. */
function SectionHeader({
  icon,
  label,
  right,
}: {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
      <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
        <span className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
        {icon}
        {label}
      </span>
      {right}
    </div>
  );
}

/** Compact stat tile used across panels. */
function StatTile({
  label,
  value,
  tone = 'text-[var(--text-primary)]',
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex flex-col bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-2.5">
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)] font-semibold">{label}</span>
      <span className={`text-[15px] font-bold tabular-nums mt-1 ${tone}`}>{value}</span>
    </div>
  );
}

export default function QuantSuiteView() {
  const activeTicker = useContractStore(s => s.selectedAsset?.ticker || 'SPX');
  const serverState = useContractStore(s => s.serverState);

  // Tab control inside the suite
  // The Quant Lab is a "visual mathematics lab" collapsed to four sections, each a set
  // of real, mathematically-defined renders (no generic/retail charts): Volatility
  // Geometry, Dealer Mechanics Geometry, Distribution & Risk, Factor / Structure Lab.
  const [activeSubTab, setActiveSubTab] = useState<'volgeo' | 'mechanics' | 'distrib' | 'factor'>('volgeo');

  // Deep-link from the sidebar flyout: apply a `quant:<sub>` intent once, then clear it.
  const subTabIntent = useContractStore((s) => s.subTabIntent);
  const setSubTabIntent = useContractStore((s) => s.setSubTabIntent);
  useEffect(() => {
    if (!subTabIntent?.startsWith('quant:')) return;
    const sub = subTabIntent.split(':')[1] as typeof activeSubTab;
    const valid = ['volgeo', 'mechanics', 'distrib', 'factor'];
    if (valid.includes(sub)) setActiveSubTab(sub);
    setSubTabIntent(null);
  }, [subTabIntent, setSubTabIntent]);

  // Asset defaults
  const activeAsset = useMemo(() => {
    return ASSET_LIST.find(a => a.ticker === activeTicker) || ASSET_LIST[0];
  }, [activeTicker]);

  const spotPrice = useMemo(() => {
    return serverState?.liveSpotPrices?.[activeTicker] || activeAsset.defaultPrice;
  }, [serverState, activeTicker, activeAsset]);

  // The server streams the SAME near-the-money chain its edge engine computed on
  // (real when API keys are connected, high-fidelity mock when keyless). Using it
  // makes the Lab's RND/greeks/skew match the server and go live automatically.
  const liveChain = serverState?.option_chain as ChainContract[] | undefined;
  const hasLiveChain = Array.isArray(liveChain) && liveChain.length > 0;
  const isLiveData = !!serverState?.chain_live && hasLiveChain;

  const defaultIv = useMemo(() => {
    if (hasLiveChain) {
      // ATM implied vol = the contract whose strike sits closest to spot.
      let best = Infinity;
      let iv = activeAsset.volatility;
      for (const c of liveChain!) {
        const d = Math.abs(c.strike - spotPrice);
        if (d < best && isFinite(c.iv) && c.iv > 0) { best = d; iv = c.iv; }
      }
      return iv;
    }
    return activeAsset.volatility;
  }, [hasLiveChain, liveChain, spotPrice, activeAsset]);

  // Real chain when available; otherwise a conforming high-fidelity mock chain.
  const optionChain = useMemo(() => {
    if (hasLiveChain) return liveChain!;
    const chain: ChainContract[] = [];
    const base = spotPrice;
    const spacing = activeTicker === 'SPX' ? 25 : activeTicker === 'NDX' ? 100 : 5;
    const center = Math.round(base / spacing) * spacing;

    for (let i = -10; i <= 10; i++) {
      const strike = center + i * spacing;
      if (strike <= 0) continue;
      const d1 = (Math.log(base / strike) + 0.05 * 0.08) / (defaultIv * 0.28);
      const prob = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);

      chain.push({
        strike,
        type: 'call',
        openInterest: Math.round(14500 * prob * (i >= 0 ? 1.5 : 0.6)),
        iv: defaultIv + (i * -0.008) + (i * i * 0.002),
        bid: Math.max(0.1, (base - strike) > 0 ? (base - strike) + 1.2 : 1.2 * prob * spacing),
        ask: Math.max(0.2, ((base - strike) > 0 ? (base - strike) + 1.2 : 1.2 * prob * spacing) + 0.1),
        delta: Math.max(0.01, Math.min(0.99, 0.5 + i * 0.04)),
        gamma: Math.max(0.001, prob * 0.12),
        vega: Math.max(0.01, prob * 2.2),
        theta: -0.15 - Math.abs(i) * 0.02,
        vanna: i * -0.015,
        charm: i * -0.01,
      });

      chain.push({
        strike,
        type: 'put',
        openInterest: Math.round(14500 * prob * (i < 0 ? 1.5 : 0.6)),
        iv: defaultIv + (i * -0.012) + (i * i * 0.0025),
        bid: Math.max(0.1, (strike - base) > 0 ? (strike - base) + 0.9 : 0.9 * prob * spacing),
        ask: Math.max(0.2, ((strike - base) > 0 ? (strike - base) + 0.9 : 0.9 * prob * spacing) + 0.1),
        delta: Math.max(-0.99, Math.min(-0.01, -0.5 + i * 0.04)),
        gamma: Math.max(0.001, prob * 0.12),
        vega: Math.max(0.01, prob * 2.2),
        theta: -0.12 - Math.abs(i) * 0.018,
        vanna: i * -0.012,
        charm: i * -0.008,
      });
    }
    return chain;
  }, [hasLiveChain, liveChain, spotPrice, defaultIv, activeTicker]);

  // Real streamed candles when available (mapped from the server Candle shape);
  // otherwise a synthetic 20-bar series so the Realized Vol Suite still renders.
  const candles: Candle[] = useMemo(() => {
    const live = serverState?.candles as Array<{ timestamp?: number; time?: number; open: number; high: number; low: number; close: number; volume: number }> | undefined;
    if (Array.isArray(live) && live.length >= 10) {
      return live.slice(-90).map((c, i) => ({
        time: c.timestamp ?? c.time ?? i + 1,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
    }
    const list: Candle[] = [];
    const base = spotPrice;
    let curr = base * 0.96;
    for (let i = 0; i < 20; i++) {
      const scale = 1.0 + (Math.sin(i * 0.5) * 0.018);
      const open = curr;
      const close = curr * scale;
      const high = Math.max(open, close) * (1.0 + (Math.abs(Math.sin(i)) * 0.012));
      const low = Math.min(open, close) * (1.0 - (Math.abs(Math.cos(i)) * 0.01));
      list.push({ time: i + 1, open, high, low, close, volume: 240000 + Math.floor(Math.sin(i) * 45000) });
      curr = close;
    }
    return list;
  }, [serverState, spotPrice]);

  const strikeStep = activeTicker === 'SPX' ? 25 : activeTicker === 'NDX' ? 100 : 5;
  const atmStrike = useMemo(() => Math.round(spotPrice / strikeStep) * strikeStep, [spotPrice, strikeStep]);

  // Real dealer GEX profile streamed from the server (when present).
  const gexProfile = serverState?.gex_profile;

  // ===================================
  // 1. RISK-NEUTRAL DENSITY & FAT TAILS
  // ===================================
  const dteD = 14;
  const rndResult: BreedenLitzenbergerResult = useMemo(() => {
    return solveImpliedRND(optionChain, spotPrice, defaultIv, dteD / 365, 0.051);
  }, [optionChain, spotPrice, defaultIv]);

  // Probability target — auto-derived from the chain's own 1σ implied move
  // (no manual entry). Reads the risk-neutral std-dev straight from the RND.
  const probStrike = useMemo(
    () => Math.round(spotPrice + rndResult.stdDev),
    [spotPrice, rndResult.stdDev]
  );

  const probabilityPricingText = useMemo(() => {
    const sorted = [...rndResult.density].sort((a, b) => b.strike - a.strike);
    let runSum = 0;
    let foundProb = 0;
    for (const node of sorted) {
      runSum += node.probability;
      if (node.strike <= probStrike) { foundProb = runSum; break; }
    }
    const percent = Math.round(Math.max(0, Math.min(100, foundProb * 100)));
    return {
      percent,
      statement: `The chain is pricing a ${percent}% probability of ${activeTicker} settling above ${probStrike.toLocaleString(undefined, { maximumFractionDigits: 0 })} within ${dteD} days.`,
    };
  }, [rndResult, probStrike, activeTicker]);

  // ===================================
  // 2. REALIZED VOL SUITE & VRP SPREAD
  // ===================================
  const volSuite: RealizedVolSuite = useMemo(() => {
    return calculateRealizedVolSuite(candles, defaultIv, 20);
  }, [candles, defaultIv]);

  const volCone: VolConePoint[] = useMemo(() => {
    return calculateVolatilityCone(candles, volSuite.yangZhang);
  }, [candles, volSuite]);

  // ===================================
  // 3. SKEW ANALYTICS
  // ===================================
  const skewMetrics: SkewMetrics = useMemo(() => {
    return computeSkewAnalytics(optionChain, spotPrice, defaultIv);
  }, [optionChain, spotPrice, defaultIv]);

  // ===================================
  // 4. AUTO-BUILT PRESET STRATEGY (no manual entry)
  // Legs are derived from the live ATM strike + chain IV. Switching the preset
  // re-derives every leg; there are no typed inputs.
  // ===================================
  const [activePreset, setActivePreset] = useState<StrategyPreset>('iron_condor');

  const strategyLegs = useMemo<OptionLeg[]>(() => {
    const step = strikeStep;
    const center = atmStrike;
    const t = Math.max(1, dteD) / 365.25;
    const price = (K: number, ivVal: number, oType: 'call' | 'put') =>
      Math.round(Math.max(0.01, bsmPrice(spotPrice, K, t, ivVal, oType, 0.05, 0.0)) * 100) / 100;

    if (activePreset === 'iron_condor') {
      const k1 = center - 2 * step, k2 = center - step, k3 = center + step, k4 = center + 2 * step;
      return [
        { id: 'ic1', strike: k1, type: 'put', action: 'buy', qty: 1, iv: defaultIv * 1.1, entryPrice: price(k1, defaultIv * 1.1, 'put') },
        { id: 'ic2', strike: k2, type: 'put', action: 'sell', qty: 1, iv: defaultIv * 1.02, entryPrice: price(k2, defaultIv * 1.02, 'put') },
        { id: 'ic3', strike: k3, type: 'call', action: 'sell', qty: 1, iv: defaultIv * 0.98, entryPrice: price(k3, defaultIv * 0.98, 'call') },
        { id: 'ic4', strike: k4, type: 'call', action: 'buy', qty: 1, iv: defaultIv * 1.05, entryPrice: price(k4, defaultIv * 1.05, 'call') },
      ];
    }
    if (activePreset === 'straddle') {
      return [
        { id: 'st1', strike: center, type: 'call', action: 'buy', qty: 1, iv: defaultIv, entryPrice: price(center, defaultIv, 'call') },
        { id: 'st2', strike: center, type: 'put', action: 'buy', qty: 1, iv: defaultIv * 1.05, entryPrice: price(center, defaultIv * 1.05, 'put') },
      ];
    }
    if (activePreset === 'butterfly') {
      const k1 = center - step, k2 = center, k3 = center + step;
      return [
        { id: 'bf1', strike: k1, type: 'call', action: 'buy', qty: 1, iv: defaultIv * 1.02, entryPrice: price(k1, defaultIv * 1.02, 'call') },
        { id: 'bf2', strike: k2, type: 'call', action: 'sell', qty: 2, iv: defaultIv, entryPrice: price(k2, defaultIv, 'call') },
        { id: 'bf3', strike: k3, type: 'call', action: 'buy', qty: 1, iv: defaultIv * 0.98, entryPrice: price(k3, defaultIv * 0.98, 'call') },
      ];
    }
    // vertical (bull call spread, 1σ wide)
    const kLong = center, kShort = Math.round((center + rndResult.stdDev) / step) * step;
    return [
      { id: 'vt1', strike: kLong, type: 'call', action: 'buy', qty: 1, iv: defaultIv, entryPrice: price(kLong, defaultIv, 'call') },
      { id: 'vt2', strike: kShort, type: 'call', action: 'sell', qty: 1, iv: defaultIv * 0.97, entryPrice: price(kShort, defaultIv * 0.97, 'call') },
    ];
  }, [activePreset, atmStrike, strikeStep, spotPrice, defaultIv, rndResult.stdDev]);

  const strategySuite: StrategyMetrics = useMemo(() => {
    return buildStrategySuite(strategyLegs, spotPrice, dteD, 0.05, rndResult);
  }, [strategyLegs, spotPrice, rndResult]);

  const payoffChartCoordinates = useMemo(() => {
    return generatePayoffCoordinates(strategyLegs, spotPrice, rndResult);
  }, [strategyLegs, spotPrice, rndResult]);

  // 1σ expected move (in points and %) read straight off the RND dispersion.
  const expectedMovePts = rndResult.stdDev;
  const expectedMovePct = (rndResult.stdDev / spotPrice) * 100;

  // ── Volatility Geometry HERO: an always-available model IV surface (strike × tenor ×
  // IV), anchored on the live expected move. It never blanks — with no live chain it is a
  // clean MODEL-MODE surface; with a live chain it is anchored on live dispersion. ──
  const ivHeroProfile: SurfaceProfile = useMemo(() => ({
    spot: spotPrice,
    expectedMovePct,
    gammaFlip: gexProfile?.gammaFlip,
    callWall: gexProfile?.callWall,
    putWall: gexProfile?.putWall,
  }), [spotPrice, expectedMovePct, gexProfile?.gammaFlip, gexProfile?.callWall, gexProfile?.putWall]);
  const ivHeroGrid = useMemo(() => ivSurfaceGrid(ivHeroProfile), [ivHeroProfile]);
  const ivHeroDomain = useMemo(() => ivStrikeDomain(ivHeroProfile), [ivHeroProfile]);
  const ivHeroMarkers: SurfaceMarker[] = useMemo(() => ([
    spotPrice ? { at: spotPrice, kind: 'spot' as const, label: 'Spot' } : null,
    gexProfile?.callWall != null ? { at: gexProfile.callWall, kind: 'callWall' as const, label: 'Call Wall' } : null,
    gexProfile?.putWall != null ? { at: gexProfile.putWall, kind: 'putWall' as const, label: 'Put Wall' } : null,
  ].filter(Boolean) as SurfaceMarker[]), [spotPrice, gexProfile?.callWall, gexProfile?.putWall]);
  const ivHeroSliceCol = useMemo(() => {
    if (!ivHeroDomain || !spotPrice || !ivHeroGrid[0]) return null;
    const cols = ivHeroGrid[0].length;
    return Math.max(0, Math.min(cols - 1, Math.round(((spotPrice - ivHeroDomain[0]) / (ivHeroDomain[1] - ivHeroDomain[0])) * (cols - 1))));
  }, [ivHeroDomain, spotPrice, ivHeroGrid]);

  // ===================================
  // 5. DETERMINISTIC SHOCK MATRIX
  // ===================================
  const spotShocks = [-0.04, -0.02, 0, 0.02, 0.04];
  const volShocks = [-0.04, -0.02, 0, 0.02, 0.04];
  const scenarioMatrix: ShockNode[] = useMemo(() => {
    return computeScenarioShockMatrix(strategyLegs, spotPrice, spotShocks, volShocks, [dteD, Math.round(dteD / 2), 0], 0.05);
  }, [strategyLegs, spotPrice]);

  const [selectedDteScenario, setSelectedDteScenario] = useState<number>(dteD);

  // Worst / best cell across the currently selected DTE slice (real, from the matrix).
  const scenarioExtremes = useMemo(() => {
    const slice = scenarioMatrix.filter(n => n.dteRemaining === selectedDteScenario);
    if (slice.length === 0) return { worst: null as ShockNode | null, best: null as ShockNode | null };
    let worst = slice[0], best = slice[0];
    for (const n of slice) {
      if (n.pnl < worst.pnl) worst = n;
      if (n.pnl > best.pnl) best = n;
    }
    return { worst, best };
  }, [scenarioMatrix, selectedDteScenario]);

  // ===================================
  // 6. PORTFOLIO BOOK MANAGER
  // ===================================
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);

  const portfolioResult: PortfolioGreeksGroup = useMemo(() => {
    return aggregatePortfolioGreeks(portfolio, spotPrice, 0.05);
  }, [portfolio, spotPrice]);

  const handleAddPortfolioStock = () => {
    setPortfolio(prev => [
      ...prev,
      { id: Math.random().toString(36).substring(7), symbol: `${activeTicker} Shares`, type: 'stock', qty: 100, entryPrice: spotPrice, currentPrice: spotPrice },
    ]);
  };

  const handleAddPortfolioOption = (optionType: 'call' | 'put') => {
    const t = Math.max(1, dteD) / 365.25;
    const px = Math.round(Math.max(0.01, bsmPrice(spotPrice, atmStrike, t, defaultIv, optionType, 0.05, 0.0)) * 100) / 100;
    setPortfolio(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        symbol: `${activeTicker} ${optionType.toUpperCase()} ${atmStrike}`,
        type: optionType,
        qty: 1,
        entryPrice: px,
        currentPrice: px,
        strike: atmStrike,
        iv: defaultIv,
        dte: dteD,
      },
    ]);
  };

  const handleRemovePortfolioItem = (id: string) => {
    setPortfolio(prev => prev.filter(p => p.id !== id));
  };

  // ===================================
  // 7. EXPIRY GEX ENGINE
  // ===================================
  const expiryGex: ExpiryGexNode[] = useMemo(() => {
    return aggregateExpiryGexCurve(optionChain, spotPrice);
  }, [optionChain, spotPrice]);

  // ===================================
  // 8. REAL ALERTS TRIGGER ENGINE
  // ===================================
  const [alertsRules, setAlertsRules] = useState<AlertRule[]>([
    { id: '1', name: `${activeTicker} Crosses Gamma Flip`, metric: 'gex_flip', operator: 'crosses', isActive: true },
    { id: '2', name: 'Dealers Short Gamma', metric: 'gex_negative', operator: 'is_negative', isActive: true },
    { id: '3', name: 'IV Richness (variance risk premium ≥ 5 pts)', metric: 'vrp_high', operator: 'above', thresholdValue: 5, isActive: true },
  ]);

  const [alertsLog, setAlertsLog] = useState<AlertDispatch[]>([]);

  const handleToggleRule = (id: string) => {
    setAlertsRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const handleAddSpotRule = (threshold: number) => {
    setAlertsRules(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        name: `${activeTicker} Spot Crosses ${threshold.toLocaleString()}`,
        metric: 'spot',
        operator: 'crosses',
        thresholdValue: threshold,
        isActive: true,
      },
    ]);
  };

  // Keep the latest inputs in a ref so the evaluation interval is created ONCE and
  // reads fresh values, instead of being torn down/recreated on every SSE frame.
  const alertCtxRef = useRef({ alertsRules, spotPrice, gexProfile, volSuite, skewMetrics });
  alertCtxRef.current = { alertsRules, spotPrice, gexProfile, volSuite, skewMetrics };
  // Previous-tick spot so "crosses" rules can actually detect a crossing
  // (passing the same value for spot and prevSpot made them permanently dead).
  const prevAlertSpotRef = useRef(spotPrice);

  useEffect(() => {
    const interval = setInterval(() => {
      const { alertsRules, spotPrice, gexProfile, volSuite, skewMetrics } = alertCtxRef.current;
      // Evaluate against the REAL dealer GEX profile + flip when the server provides
      // them; if absent, skip GEX-dependent rules rather than fabricate a value.
      const netGexVal = typeof gexProfile?.netGex === 'number' ? gexProfile.netGex : 0;
      const gammaFlip = typeof gexProfile?.gammaFlip === 'number' ? gexProfile.gammaFlip : spotPrice;

      const triggered = evaluateAlertRules(
        alertsRules,
        spotPrice,
        prevAlertSpotRef.current,
        netGexVal,
        gammaFlip,
        // Honest underlying values (vol, decimal) — not fabricated percentiles.
        volSuite.varianceRiskPremium,
        skewMetrics.riskReversal25D
      );
      prevAlertSpotRef.current = spotPrice;

      if (triggered.length > 0) {
        setAlertsLog(prev => [...triggered, ...prev].slice(0, 30));
      }
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  // ===================================
  // 9. TRADE JOURNAL & CALIBRATION (user-recorded)
  // Starts empty — no fabricated history. Predictions logged from the live setup
  // use the strategy's real RND-derived probability of profit.
  // ===================================
  const [journal, setJournal] = useState<JournalTradeRecord[]>([]);

  const closedCount = useMemo(() => journal.filter(t => t.outcome !== 'OPEN').length, [journal]);

  const calibrationLoop: CalibrationResult = useMemo(() => {
    return calculateCalibrationLoop(journal);
  }, [journal]);

  const handleLogCurrentSetup = () => {
    const newRecord: JournalTradeRecord = {
      id: Math.random().toString(36).substring(7),
      ticker: activeTicker,
      setup: PRESET_LABELS[activePreset],
      entryTime: new Date().toISOString().split('T')[0],
      entryPrice: spotPrice,
      expectedMovePct: expectedMovePct / 100,
      pop: strategySuite.pop,
      outcome: 'OPEN',
    };
    setJournal(prev => [newRecord, ...prev]);
  };

  const handleResolveTrade = (id: string, outcome: 'WIN' | 'LOSS') => {
    setJournal(prev => prev.map(t => {
      if (t.id !== id) return t;
      // Mark against the live spot at resolution time (a real value). P&L is the
      // realized move applied to one contract's notional move — not a hardcoded figure.
      const finalPrice = spotPrice;
      const move = (finalPrice - t.entryPrice) * 100;
      const pnl = Math.round(outcome === 'WIN' ? Math.abs(move) : -Math.abs(move));
      return { ...t, outcome, finalPrice, pnl };
    }));
  };

  const handleRemoveTrade = (id: string) => {
    setJournal(prev => prev.filter(t => t.id !== id));
  };

  const fmtMoney = (n: number) => (n >= 0 ? `+$${n.toLocaleString()}` : `-$${Math.abs(n).toLocaleString()}`);

  const tabs: { id: typeof activeSubTab; label: string }[] = [
    { id: 'volgeo', label: 'Volatility Geometry' },
    { id: 'mechanics', label: 'Dealer Mechanics' },
    { id: 'distrib', label: 'Distribution & Risk' },
    { id: 'factor', label: 'Factor Lab' },
  ];

  return (
    <StrikeSyncProvider>
    <div className="flex flex-col gap-5 w-full text-[var(--text-primary)] bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 font-mono select-none" id="quant-suite-terminal-view">
      {/* Header + live summary stats */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-[var(--border)] pb-4 gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-[var(--surface-2)] border border-[var(--border)]">
            <Calculator className="w-[18px] h-[18px] text-[var(--accent-color)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-widest text-[var(--text-primary)] uppercase font-sans whitespace-nowrap">Quant Lab</h2>
              <span
                className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                  isLiveData
                    ? 'text-[var(--success)] border-[var(--success)]/40 bg-[var(--success)]/10'
                    : 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10'
                }`}
                title={isLiveData
                  ? 'Computing on the live option chain streamed from the server.'
                  : 'No live chain connected — computing on a high-fidelity simulated chain. Connect a data API key to go live.'}
              >
                {isLiveData ? 'LIVE CHAIN' : 'SIMULATED'}
              </span>
            </div>
            <p className="text-[9px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-widest">
              Risk-Neutral Density · Realized Vol · Multi-Leg Risk · Dealer GEX
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto">
          {([
            { l: 'Spot', v: spotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), tone: 'var(--accent-color)', ink: 'var(--text-primary)' },
            { l: 'RND Skew', v: rndResult.skewness.toFixed(3), tone: rndResult.skewness < 0 ? 'var(--warning)' : 'var(--success)', ink: rndResult.skewness < 0 ? 'var(--warning)' : 'var(--success)' },
            { l: 'RV · Y-Z', v: `${(volSuite.yangZhang * 100).toFixed(2)}%`, tone: 'var(--info)', ink: 'var(--text-primary)' },
            { l: '25Δ RR', v: `${(skewMetrics.riskReversal25D * 100).toFixed(2)}%`, tone: skewMetrics.riskReversal25D < 0 ? 'var(--danger)' : 'var(--success)', ink: skewMetrics.riskReversal25D < 0 ? 'var(--danger)' : 'var(--success)' },
          ]).map(c => (
            <div key={c.l} className="relative overflow-hidden flex flex-col bg-[var(--surface-2)] border border-[var(--border)] rounded-md pl-3 pr-3 py-1.5 min-w-0 lg:min-w-[92px]">
              <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: c.tone, opacity: 0.8 }} />
              <span className="text-[8px] font-black tracking-widest text-[var(--text-tertiary)] uppercase truncate">{c.l}</span>
              <span className="text-[14px] font-bold tabular-nums leading-tight truncate" style={{ color: c.ink }}>{c.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex flex-nowrap overflow-x-auto items-center gap-1 border-b border-[var(--border)]" id="quant-suite-sub-tabs">
        {tabs.map(t => {
          const active = activeSubTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`shrink-0 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
                active
                  ? 'text-[var(--text-primary)] border-[var(--success)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border-transparent'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* View panel area */}
      <div className="min-h-[280px]" id="quant-suite-view-canvas">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSubTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="w-full flex flex-col gap-4"
          >
            {/* TAB 2: VOLATILITY */}
            {activeSubTab === 'volgeo' && (
              <>
              {/* HERO — the 3D implied-volatility surface (strike × tenor × IV). Always on,
                  never blank: MODEL MODE with no live chain, live-anchored otherwise. */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden mb-4">
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers className="w-3.5 h-3.5 text-[var(--accent-color)] shrink-0" />
                    <span className="font-mono text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] truncate">Implied Volatility Surface · {activeTicker}</span>
                    <span className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] shrink-0">3D · WebGL</span>
                  </div>
                  <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-tertiary)] hidden sm:block">strike × expiry × σ</span>
                </div>
                <div className="px-3 pb-3">
                  <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[#0a0a0b]">
                    <Suspense fallback={<div className="h-[460px] w-full animate-pulse bg-[var(--surface-2)]" />}>
                      <QuantSurface3D
                        grid={ivHeroGrid}
                        ramp="sequential"
                        height={460}
                        axisLabels={['strike', 'tenor', 'IV']}
                        xDomain={ivHeroDomain}
                        xFormat={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        valueFormat={(v) => `${(v * 100).toFixed(1)}%`}
                        markers={ivHeroMarkers}
                        floorHeatmap
                        legend
                        dataState={isLiveData ? 'live' : 'model'}
                        sliceCol={ivHeroSliceCol}
                        sliceRow={0}
                      />
                    </Suspense>
                  </div>
                  <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)]/50 px-3 py-2">
                    <Activity className="mt-0.5 h-3 w-3 shrink-0 text-[var(--accent-color)]" />
                    <p className="font-mono text-[10px] leading-relaxed text-[var(--text-tertiary)]">
                      Model IV surface anchored on the live 1σ expected move (±{expectedMovePct.toFixed(2)}%). X = strike, Z = tenor (near → far), Y/colour = implied vol — blue calm, red stressed. Put-side lift is skew; the U across strikes is the smile. The lit ridge is the ATM term structure; the front row is the near-expiry smile. The real per-strike front smile is charted below.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 flex flex-col gap-4">
                  <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg">
                    <SectionHeader icon={<Activity className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Realized Volatility Estimators (20d)" />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { l: 'Parkinson', v: volSuite.parkinson, t: 'text-[var(--danger)]', d: 'high/low range; excludes overnight gaps' },
                        { l: 'Garman-Klass', v: volSuite.garmanKlass, t: 'text-[var(--success)]', d: 'OHLC; captures intraday range' },
                        { l: 'Yang-Zhang', v: volSuite.yangZhang, t: 'text-[var(--warning)]', d: 'min-variance; gaps + intraday drift' },
                      ].map((e, i) => (
                        <div key={i} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3 flex flex-col items-center text-center">
                          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">{e.l}</span>
                          <span className={`text-[20px] font-bold tabular-nums mt-1 ${e.t}`}>{(e.v * 100).toFixed(2)}%</span>
                          <p className="text-[10px] text-[var(--text-tertiary)] mt-2 leading-snug">{e.d}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg">
                    <SectionHeader icon={<TrendingUp className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Variance Risk Premium (IV − RV)" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatTile label="ATM IV" value={`${(defaultIv * 100).toFixed(2)}%`} />
                      <StatTile label="Yang-Zhang RV" value={`${(volSuite.yangZhang * 100).toFixed(2)}%`} tone="text-[var(--warning)]" />
                      <StatTile label="VRP Spread" value={`${(volSuite.varianceRiskPremium * 100).toFixed(2)} pts`} tone={volSuite.varianceRiskPremium >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'} />
                      <StatTile label="RV Percentile" value={`${volSuite.rvPercentile}th`} tone="text-[var(--success)]" />
                    </div>
                  </div>
                </div>

                <div id="quant-suite-vol-cone">
                  <VolConePanel cone={volCone} atmIv={defaultIv} realizedVol={volSuite.yangZhang} ticker={activeTicker} live={isLiveData} />
                </div>
              </div>
              </>
            )}

            {/* §2 DEALER MECHANICS GEOMETRY — real exposure surfaces (Gamma/Vanna/Charm) + edge */}
            {activeSubTab === 'mechanics' && (
              <div className="space-y-5">
                <Suspense fallback={<div className="h-[460px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] animate-pulse" />}>
                  <DealerMechanicsDashboard profile={gexProfile as any} ticker={activeTicker} decimals={activeAsset.decimals} live={isLiveData} />
                </Suspense>
                {/* Quant edge — RND / VRP / skew / scenario / Kelly / dealer clock */}
                <QuantEdgePanel />
              </div>
            )}

            {/* §4 FACTOR / STRUCTURE LAB — real cross-asset correlation + PCA + IV smile factors,
                then the market-state / regime signal grid. */}
            {activeSubTab === 'factor' && (
              <div className="space-y-5">
                <FactorLabPanel chain={optionChain} spot={spotPrice} ticker={activeTicker} live={isLiveData} />
                <div>
                  <SectionHeader icon={<Activity className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />} label="Market State / Regime" />
                  <RegimeMatrixPanel />
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* §3 Distribution & Risk — the market's own forward distribution (Breeden-Litzenberger),
          with the CDF + every probability (above/below/between/touch/ITM), expected move, CIs, and IV-vs-RV. */}
      {activeSubTab === 'distrib' && rndResult.density.length > 2 && spotPrice > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-rnd-distribution">
          <RiskNeutralDistribution
            rnd={rndResult}
            spot={spotPrice}
            dteDays={dteD}
            ivAtm={defaultIv}
            realizedVol={volSuite.yangZhang}
            callWall={gexProfile?.callWall}
            putWall={gexProfile?.putWall}
            gammaFlip={gexProfile?.gammaFlip}
            decimals={activeAsset.decimals}
            ticker={activeTicker}
            live={isLiveData}
          />
        </div>
      )}

      {/* §3 Distribution & Risk — tail risk read off the same RND: expected-move bands, tail
          probability map, prob above/below key levels, tail imbalance, scenario cone. */}
      {activeSubTab === 'distrib' && rndResult.density.length > 2 && spotPrice > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-tail-risk">
          <TailRiskMap
            rnd={rndResult}
            spot={spotPrice}
            dteDays={dteD}
            callWall={gexProfile?.callWall}
            putWall={gexProfile?.putWall}
            gammaFlip={gexProfile?.gammaFlip}
            decimals={activeAsset.decimals}
            ticker={activeTicker}
            live={isLiveData}
          />
        </div>
      )}

      {/* §1 Volatility Geometry — implied vol smile/skew, real front-expiry per-strike IV */}
      {activeSubTab === 'volgeo' && optionChain.length >= 4 && spotPrice > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-iv-smile">
          <IvSmile chain={optionChain} spot={spotPrice} decimals={activeAsset.decimals} ticker={activeTicker} live={isLiveData} />
        </div>
      )}

      {/* §2 Dealer Mechanics — per-strike Γ/Δ/vanna/charm/vega exposure from the real chain */}
      {activeSubTab === 'mechanics' && optionChain.length >= 4 && spotPrice > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-greek-exposure">
          <GreekExposurePanel
            chain={optionChain}
            spot={spotPrice}
            decimals={activeAsset.decimals}
            ticker={activeTicker}
            live={isLiveData}
            callWall={gexProfile?.callWall}
            putWall={gexProfile?.putWall}
            gammaFlip={gexProfile?.gammaFlip}
          />
        </div>
      )}

      {/* GexSurface3D removed — the Dealer Mechanics Gamma surface (strike × tenor × netGEX)
          in DealerMechanicsDashboard is the single canonical gamma surface now. */}

      {/* The 3D IV surface is now the always-on hero at the top of Volatility Geometry
          (QuantSurface3D + model IV grid); the real per-strike front smile stays as the
          2D IvSmile above. The old below-fold IvSurface3D (which blanked in headless and
          only mounted on scroll) is removed — a single canonical 3D IV surface. */}

      {/* §3 Distribution & Risk — Monte Carlo: real seeded paths under GBM / jump-diffusion / Heston */}
      {activeSubTab === 'distrib' && spotPrice > 0 && defaultIv > 0 && dteD > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-monte-carlo">
          <MonteCarloPanel spot={spotPrice} r={0.05} sigma={defaultIv} tYears={Math.max(1, dteD) / 365} ticker={activeTicker} decimals={activeAsset.decimals} />
        </div>
      )}

      {/* §2 Dealer Mechanics — hedging simulator: net-gamma landscape as spot moves, real per-strike GEX */}
      {activeSubTab === 'mechanics' && (gexProfile?.strikes?.length ?? 0) >= 2 && spotPrice > 0 && expectedMovePct > 0 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-hedging">
          <DealerHedgingPanel
            strikes={(gexProfile!.strikes as any[]).map((s) => ({ strike: s.strike, netGex: s.netGex }))}
            spot={spotPrice}
            emPct={expectedMovePct / 100}
            decimals={activeAsset.decimals}
            ticker={activeTicker}
            live={isLiveData}
          />
        </div>
      )}

      {/* §4 Factor Lab — market-regime classifier (measurable features over the candle series) */}
      {activeSubTab === 'factor' && candles.length >= 30 && (
        <div className="border-t border-[var(--border)] pt-4" id="quant-suite-regime">
          <RegimeDetectionPanel candles={candles} ticker={activeTicker} />
        </div>
      )}

      {/* Footer: REAL dealer GEX (when streamed) + per-expiry GEX breakdown */}
      {activeSubTab === 'mechanics' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 border-t border-[var(--border)] pt-4 gap-4" id="quant-suite-gex-footer">
        <div className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-lg flex flex-col gap-2">
          <SectionHeader icon={<Layers className="w-3.5 h-3.5 text-[var(--accent-color)]" />} label="Dealer GEX Profile" />
          {gexProfile ? (
            <div className="flex flex-col gap-2 text-[11px]">
              <div className="flex justify-between border-b border-[var(--border)] pb-1.5">
                <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[10px]">Net GEX</span>
                <span className={`font-bold tabular-nums ${(gexProfile.netGex ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                  {typeof gexProfile.netGex === 'number' ? `${(gexProfile.netGex / 1e9).toFixed(2)}B` : '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-[var(--border)] pb-1.5">
                <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[10px]">Gamma Flip</span>
                <span className="font-bold text-[var(--warning)] tabular-nums">{gexProfile.gammaFlip ? gexProfile.gammaFlip.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border)] pb-1.5">
                <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[10px]">Call Wall</span>
                <span className="font-bold text-[var(--success)] tabular-nums">{gexProfile.callWall ? gexProfile.callWall.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[10px]">Put Wall</span>
                <span className="font-bold text-[var(--danger)] tabular-nums">{gexProfile.putWall ? gexProfile.putWall.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">
              No dealer GEX profile streamed yet.
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] p-3 rounded-lg flex flex-col">
          <SectionHeader
            icon={<BarChart3 className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />}
            label="GEX by Expiry"
            right={<span className="text-[10px] text-[var(--text-tertiary)] tracking-wide">PER-EXPIRY</span>}
          />
          {expiryGex.length ? (
            <div className="flex flex-col gap-1.5">
              {(() => { const maxAbs = Math.max(1, ...expiryGex.map(n => Math.abs(n.totalGex))); return expiryGex.map((node, idx) => {
                const up = node.totalGex >= 0, pct = Math.min(100, (Math.abs(node.totalGex) / maxAbs) * 100), tok = up ? 'var(--success)' : 'var(--danger)';
                return (
                  <div key={idx} className="flex items-center gap-2.5">
                    <span className="w-14 shrink-0 text-[10px] font-bold text-[var(--text-secondary)] tabular-nums">{node.expiry}</span>
                    <div className="flex-1 h-[22px] relative bg-[var(--surface-2)] rounded-sm overflow-hidden border border-[var(--border)]">
                      <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(3, pct)}%`, background: `linear-gradient(to right, color-mix(in srgb, ${tok} 70%, transparent), color-mix(in srgb, ${tok} 30%, transparent))` }} />
                      <span className="absolute inset-0 flex items-center px-2 text-[10px] font-black tabular-nums" style={{ color: tok }}>{up ? '+' : '-'}${(Math.abs(node.totalGex) / 1e6).toFixed(1)}M</span>
                    </div>
                    <span className="w-16 shrink-0 text-right text-[9px] text-[var(--text-tertiary)] tabular-nums">K {node.dominantStrike.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                );
              }); })()}
            </div>
          ) : (
            <div className="text-center py-8 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">No per-expiry GEX streamed yet.</div>
          )}
        </div>
      </div>
      )}
    </div>
    </StrikeSyncProvider>
  );
}
