/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SKYVISION v2 MASTER SCORE — canonical spec §20.
 *
 * Mode-aware, regime-gated, edge-driven master score that replaces the assembly
 * feeding computeMasterScore(). Every sub-score is 0-100 (50 = neutral); every
 * free parameter and unresolved sign is flagged in-line and registered in §26.
 *
 * This module is PURE math over a typed input (edge fields + lead/wall context).
 * The server (skyVisionService) sources the AssetEdge + DealerDynamics from the
 * marketEngine caches and hands them here; nothing is fabricated. The two SIGN
 * constants default to the standard dealer-positioning assumption and are
 * resolved only by the forward log (§25/§26), exactly like ACCEL_SIGN.
 */
import { percentileRank } from './skewAnalytics';
import type { AssetEdge } from './quantEdge';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type SkyVisionMode = 'INTRADAY' | 'NEAR_TERM' | 'SWING';

// ── SIGN constants (§26 #2, #3) — default to the standard assumption; resolved
//    ONLY by the forward log, jointly with skyScore.ACCEL_SIGN. Never "tuned" by hand.
export const CHARM_VANNA_SIGN: 1 | -1 = 1; // +1 = positive weighted charm+vanna ⇒ net dealer bid
export const GEXVEL_SIGN: 1 | -1 = 1;      // +1 = rising net GEX ⇒ dealers adding stabilizing hedges

// ── Mode weight sets (§26 #4) — ALL FREE, provisional until grid search on ≥200
//    labeled outcomes. Each row sums to exactly 1.00 (asserted in tests).
export interface ModeWeights {
  vrp: number; skew: number; regime: number; clock: number; gexVel: number; contract: number; emaStructure: number;
}
export const MODE_WEIGHTS: Record<SkyVisionMode, ModeWeights> = {
  INTRADAY:  { vrp: 0.08, skew: 0.10, regime: 0.10, clock: 0.20, gexVel: 0.25, contract: 0.17, emaStructure: 0.10 },
  NEAR_TERM: { vrp: 0.18, skew: 0.15, regime: 0.12, clock: 0.10, gexVel: 0.18, contract: 0.15, emaStructure: 0.12 },
  SWING:     { vrp: 0.28, skew: 0.20, regime: 0.15, clock: 0.05, gexVel: 0.10, contract: 0.12, emaStructure: 0.10 },
};

/** Per-ticker magnitude ring buffers for the clock/gexVel percentile normalizers
 *  (§20 · mirrors the quantEdge pushCap pattern). CAP 240 ≈ 4 min of ticks. */
const CAP = 240;
const signalHist = new Map<string, { cv: number[]; gv: number[] }>();
function pushCap(a: number[], v: number): void { if (isFinite(v)) { a.push(v); if (a.length > CAP) a.shift(); } }
/** Test hook — clears the rolling state so percentile reads are deterministic. */
export function __resetSkyVisionMasterState(): void { signalHist.clear(); }

export interface SkyVisionMasterInput {
  ticker: string;
  dteDays: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  leadIsCall: boolean;
  spot: number;
  callWall: number;
  putWall: number;
  /** lead contract strength (§19), 0-100. */
  contractStrength: number;
  /** emaStructureScore (existing), 0-100. */
  emaStructure: number;
  /** the ticker's AssetEdge from the marketEngine cache (null ⇒ every edge sub-score abstains to 50). */
  edge: AssetEdge | null;
  /** DealerDynamics.gamma.velocity (Δ netGEX vs prior snapshot). */
  gammaVelocity: number;
  /** true only when the chain + tape are LIVE — gates the informed-flow multiplier. */
  isLive: boolean;
}

export interface SkyVisionMasterResult {
  score: number;                 // final 0-100
  mode: SkyVisionMode;
  subScores: ModeWeights;        // each component's 0-100 value (keyed like the weights)
  weights: ModeWeights;
  base: number;                  // Σ w·subscore before multiplier/cap
  flowMultiplier: number;        // informed-flow multiplier applied (1.0 if not LIVE / no signal)
  fisherCapped: boolean;         // true if the structural-shift cap bound the score
  regimeContext: RegimeContext;  // transparency layer — every assumption behind the number
}

export interface RegimeContext {
  mode: SkyVisionMode;
  dteDays: number;
  hurst: number | null;
  regime: string | null;
  vrpSignal: string;             // 'IV RICH' | 'IV CHEAP' | 'NEUTRAL' | 'N/A'
  rrPercentile: number | null;
  dealerSession: string | null;
  clockWeight: number | null;
  fisherShiftActive: boolean;
  vpin: number | null;
  netDeltaDirection: string | null;
  signsUnresolved: string[];     // which SIGN constants are still at their default
  breakdown: ModeWeights;        // == subScores, echoed for the UI panel
}

/** §20 mode selection. SWING is only reachable with multi-expiry chains (dte ≥ 14);
 *  the service sees the front chain today, so only INTRADAY/NEAR_TERM fire in practice. */
export function selectMode(dteDays: number): SkyVisionMode {
  if (dteDays < 1.5) return 'INTRADAY';
  if (dteDays < 14) return 'NEAR_TERM';
  return 'SWING';
}

export function computeSkyVisionMaster(input: SkyVisionMasterInput): SkyVisionMasterResult {
  const { ticker, dteDays, direction, leadIsCall, spot, callWall, putWall, contractStrength, emaStructure, edge, gammaVelocity, isLive } = input;
  const mode = selectMode(dteDays);
  const weights = MODE_WEIGHTS[mode];
  const dirLong = leadIsCall ? 1 : -1;

  // ── VRP — long-premium favorability. NO direction flip: both plays (best call
  //    AND best put) are LONG premium, so cheap IV favors buyers of either. §8 N/A
  //    guard is mandatory — ratio=0 from missing RV must NOT manufacture a max signal.
  const vrp = edge?.vrp;
  const vrpScore = (!vrp || vrp.richness === 'N/A' || !(vrp.ratio > 0))
    ? 50
    : Math.round(clamp(50 + (1.0 - vrp.ratio) * 80, 0, 100)); // slope 80: FREE (§26 #9)

  // ── SKEW — FOLLOW the smirk (Xing-Zhang-Zhao, §13): high put-skew percentile
  //    favors PUT buyers. rrPercentile is 0-100 within its own 240-tick ring.
  const rrPct = edge?.skew?.rrPercentile ?? null;
  const skewScore = rrPct == null ? 50 : Math.round(leadIsCall ? (100 - rrPct) : rrPct);

  // ── REGIME — Hurst gate with the fade-wall rule. In mean-reversion the only
  //    confirmed long-premium setup is the FADE (calls near the PUT wall, puts near
  //    the CALL wall); chasing momentum in an MR regime is anti-edge.
  const H = edge?.regime?.hurst ?? null;
  const regimeScore = (() => {
    if (H == null) return 50;
    if (H > 0.55) return direction !== 'NEUTRAL' ? 70 : 50;          // persistence ⇒ momentum confirmed
    if (H < 0.45) {
      const fadeSetup = leadIsCall
        ? Math.abs(spot - putWall) / spot < 0.005
        : Math.abs(spot - callWall) / spot < 0.005;                   // proximity 0.005: FREE (§26 #10)
      return fadeSetup ? 70 : 35;
    }
    return 50;                                                        // random walk ⇒ no price-action edge
  })();

  // rolling state for the two percentile-normalized magnitude signals
  const sh = signalHist.get(ticker) ?? { cv: [], gv: [] };

  // ── DEALER CLOCK — sign quarantined (CHARM_VANNA_SIGN), magnitude ranked vs OWN
  //    history. weightedCharm/weightedVanna ALREADY embed the §14 time ramp — never
  //    re-multiply by the clock weight.
  const clock = edge?.dealerClock;
  const cv = (clock?.weightedCharm ?? 0) + (clock?.weightedVanna ?? 0);
  pushCap(sh.cv, cv);
  const cvMagPct = percentileRank(sh.cv.map(Math.abs), Math.abs(cv));
  const clockScore = Math.round(clamp(50 + dirLong * Math.sign(cv) * CHARM_VANNA_SIGN * (cvMagPct / 100) * 35, 0, 100)); // ±35: FREE

  // ── GEX VELOCITY — DealerDynamics.gamma.velocity, same sign-quarantine + percentile
  //    treatment. NO fixed dollar divisor: net-GEX scale differs by orders of
  //    magnitude across tickers, so rank magnitude against the ticker's own history.
  const gv = gammaVelocity;
  pushCap(sh.gv, gv);
  signalHist.set(ticker, sh);
  const gvMagPct = percentileRank(sh.gv.map(Math.abs), Math.abs(gv));
  const gexVelScore = Math.round(clamp(50 + dirLong * Math.sign(gv) * GEXVEL_SIGN * (gvMagPct / 100) * 35, 0, 100));

  const subScores: ModeWeights = {
    vrp: vrpScore,
    skew: skewScore,
    regime: regimeScore,
    clock: clockScore,
    gexVel: gexVelScore,
    contract: Math.round(clamp(contractStrength, 0, 100)),
    emaStructure: Math.round(clamp(emaStructure, 0, 100)),
  };

  // Step A — weighted base
  const base =
    weights.vrp * subScores.vrp +
    weights.skew * subScores.skew +
    weights.regime * subScores.regime +
    weights.clock * subScores.clock +
    weights.gexVel * subScores.gexVel +
    weights.contract * subScores.contract +
    weights.emaStructure * subScores.emaStructure;

  // Step B — informed-flow multiplier. VPIN is UNSIGNED (§10) so we gate on the
  //   signed net-delta TAPE direction, and ONLY on LIVE data (synthetic tape
  //   direction is noise, §12/§27.4).
  const vpin = edge?.vpin?.vpin ?? 0;
  const tapeDir = edge?.netDelta?.direction ?? 'NEUTRAL';
  const wantDir = leadIsCall ? 'BULLISH' : 'BEARISH';
  let flowMultiplier = 1.0;
  if (isLive) {
    if (vpin > 0.4 && tapeDir === wantDir) flowMultiplier = 1.10;                             // informed flow WITH us
    else if (vpin > 0.4 && tapeDir !== 'NEUTRAL' && tapeDir !== wantDir) flowMultiplier = 0.80; // AGAINST us — haircut
    else if (vpin > 0.45) flowMultiplier = 0.90;                                              // toxic, direction unclear
  }

  // Step C — Fisher structural-shift cap: the market's statistical rules just
  //   changed, so every history-derived signal is suspect (§11).
  const shiftActive = edge?.fisher?.structuralShift === true;
  const afterFlow = base * flowMultiplier;
  const capped = shiftActive ? Math.min(afterFlow, 55) : afterFlow;

  // Step D — final
  const score = Math.round(clamp(capped, 0, 100));

  const signsUnresolved: string[] = [];
  if (Math.abs(cv) > 0) signsUnresolved.push('CHARM_VANNA_SIGN');
  if (Math.abs(gv) > 0) signsUnresolved.push('GEXVEL_SIGN');

  const regimeContext: RegimeContext = {
    mode,
    dteDays,
    hurst: H,
    regime: edge?.regime?.state ?? null,
    vrpSignal: vrp?.richness ?? 'N/A',
    rrPercentile: rrPct,
    dealerSession: clock?.session ?? null,
    clockWeight: (clock as any)?.weight ?? null,
    fisherShiftActive: shiftActive,
    vpin: edge?.vpin ? vpin : null,
    netDeltaDirection: edge?.netDelta?.direction ?? null,
    signsUnresolved,
    breakdown: subScores,
  };

  return { score, mode, subScores, weights, base: Math.round(base), flowMultiplier, fisherCapped: shiftActive && capped < afterFlow, regimeContext };
}
