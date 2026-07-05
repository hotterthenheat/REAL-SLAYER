import type { CloudPoint } from './QuantSurface3D';

/**
 * Data builders for the Dealer Mechanics 3D surfaces (Directive 08 whitelist targets).
 * Each maps REAL desk data to a grid or cloud so the third dimension carries genuine
 * mathematical context. When the live chain is present these read from it; otherwise
 * they fall back to a deterministic model anchored on the real profile scalars (never
 * Math.random → the surface is stable frame-to-frame, not jittering noise).
 */

export interface StrikeRow { strike: number; netGex: number; callGex?: number; putGex?: number }
export interface ExpirySlice { dteDays?: number; date?: string; strikes: { strike: number; netGex: number }[] }
export interface SurfaceProfile {
  spot?: number;
  netGex?: number;
  netVex?: number;
  charmEx?: number;
  expectedMovePct?: number;
  gammaFlip?: number;
  strikes?: StrikeRow[];
  expiries?: ExpirySlice[];
}

// Deterministic RNG so clouds are stable across renders (mulberry32).
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(r: () => number) {
  // Box–Muller
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const COLS = 30; // strike / moneyness resolution
const ROWS = 16; // tenor / expiry resolution

/**
 * DEALER GAMMA SURFACE — X = strike, Z = tenor (near→far expiry), Y = net dealer gamma.
 * Signed → diverging ramp (red short-gamma / green long-gamma, slate at the flip).
 * Uses per-expiry slices when the chain provides them; else decays the front-chain
 * gamma column across a modelled term structure (gamma concentrates near-dated).
 */
export function gammaSurfaceGrid(profile: SurfaceProfile | null | undefined): number[][] {
  const spot = profile?.spot;
  const strikes = (profile?.strikes ?? []).filter((s) => Number.isFinite(s.strike) && Number.isFinite(s.netGex));
  if (!spot || spot <= 0 || strikes.length < 4) return [];

  // Strike axis: window ~±8% around spot, evenly sampled to COLS columns.
  const lo = spot * 0.92, hi = spot * 1.08;
  const inWin = strikes.filter((s) => s.strike >= lo && s.strike <= hi).sort((a, b) => a.strike - b.strike);
  const src = inWin.length >= 6 ? inWin : [...strikes].sort((a, b) => a.strike - b.strike);
  const axis: number[] = [];
  for (let c = 0; c < COLS; c++) axis.push(lo + (hi - lo) * (c / (COLS - 1)));
  const gexAt = (k: number): number => {
    // nearest-strike gamma from the source column
    let best = src[0], bd = Infinity;
    for (const s of src) { const d = Math.abs(s.strike - k); if (d < bd) { bd = d; best = s; } }
    return best?.netGex ?? 0;
  };

  const expiries = (profile?.expiries ?? []).filter((e) => Array.isArray(e.strikes) && e.strikes.length > 0);
  const grid: number[][] = [];

  if (expiries.length >= 2) {
    const sorted = [...expiries].sort((a, b) => (a.dteDays ?? 0) - (b.dteDays ?? 0)).slice(0, ROWS);
    for (const e of sorted) {
      const byStrike = e.strikes;
      const row = axis.map((k) => {
        let best = byStrike[0], bd = Infinity;
        for (const s of byStrike) { const d = Math.abs(s.strike - k); if (d < bd) { bd = d; best = s; } }
        return best?.netGex ?? 0;
      });
      grid.push(row);
    }
    return grid;
  }

  // Model term structure: front gamma decays ~1/√tenor and the flip drifts slightly.
  for (let r = 0; r < ROWS; r++) {
    const tenor = r / (ROWS - 1);                 // 0 near → 1 far
    const decay = 1 / Math.sqrt(1 + tenor * 6);   // near-dated gamma dominates
    const row = axis.map((k) => gexAt(k) * decay);
    grid.push(row);
  }
  return grid;
}

/**
 * IMPLIED VOLATILITY SURFACE — X = moneyness (K/S), Z = tenor, Y = IV.
 * Unsigned intensity → sequential ramp (blue calm → red stressed). Deterministic vol
 * model (ATM + term-structure + put-skew + smile) anchored on the real expected move.
 */
export function ivSurfaceGrid(profile: SurfaceProfile | null | undefined): number[][] {
  const em = profile?.expectedMovePct;
  // Anchor ATM vol on the real 1-session expected move when present (EM ≈ σ·√(1/252)).
  const atm = em && em > 0 ? Math.min(0.9, Math.max(0.08, (em / 100) * Math.sqrt(252))) : 0.2;
  const skew = 0.85;   // put-side richness
  const smile = 6.5;
  const grid: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const tenor = r / (ROWS - 1);
    const term = 0.05 * Math.sqrt(tenor + 0.03);
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) {
      const m = (c / (COLS - 1) - 0.5) * 0.4;      // moneyness ∈ [-0.2, +0.2]
      const iv = atm + term + skew * -m * 0.35 + smile * m * m;
      row.push(iv);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * MONTE-CARLO PATH CLOUD — GBM price paths fanned into a 3D probability cone.
 * x = time, z = price (height), y = per-path lateral lane (gives the cloud volume),
 * v = terminal return sign → diverging ramp (green finishes up, red finishes down).
 * σ is anchored on the real expected move; drift 0 (risk-neutral-ish, honest).
 */
export function monteCarloCloud(profile: SurfaceProfile | null | undefined, paths = 240, steps = 40): CloudPoint[] {
  const spot = profile?.spot;
  if (!spot || spot <= 0) return [];
  const em = profile?.expectedMovePct;
  const sigmaDay = em && em > 0 ? em / 100 : 0.01; // per-session vol
  const dt = 1; // one session per step
  const r = rng(Math.round(spot) * 7919 + steps * 31 + paths);
  const out: CloudPoint[] = [];
  for (let p = 0; p < paths; p++) {
    let price = spot;
    const lane = (p / (paths - 1) - 0.5); // spread paths across depth
    for (let t = 1; t <= steps; t++) {
      const z = gaussian(r);
      price *= Math.exp(-0.5 * sigmaDay * sigmaDay * dt + sigmaDay * Math.sqrt(dt) * z);
      // sample every few steps to keep the cloud light (~240×~13 ≈ 3k pts)
      if (t % 3 === 0 || t === steps) {
        out.push({ x: t / steps, y: lane, z: price, v: (price - spot) / spot });
      }
    }
  }
  return out;
}
