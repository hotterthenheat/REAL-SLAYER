/**
 * Data builders for the Dealer Mechanics 3D surfaces. Each maps REAL desk data (per-strike
 * dealer exposures / the option-implied vol model) to a strike×tenor height grid so the
 * third dimension carries genuine mathematical context — no decorative or random surfaces.
 * Deterministic: the same inputs always produce the same grid (stable frame-to-frame).
 */

export interface StrikeRow { strike: number; netGex: number; netVex?: number; charmEx?: number; netDex?: number; callGex?: number; putGex?: number }

/** Which dealer exposure a surface plots. All are real per-strike fields on the chain. */
export type ExposureField = 'netGex' | 'netVex' | 'charmEx';
// Mirror GexExpirySlice (types.ts): the tenor field is `dte`, the display/sort key is
// `expiration` — NOT dteDays/date, or the near→far sort silently no-ops.
export interface ExpirySlice { dte?: number; expiration?: string; strikes: { strike: number; netGex: number }[] }
export interface SurfaceProfile {
  spot?: number;
  netGex?: number;
  netVex?: number;
  charmEx?: number;
  expectedMovePct?: number;
  gammaFlip?: number;
  callWall?: number;
  putWall?: number;
  strikes?: StrikeRow[];
  expiries?: ExpirySlice[];
}

const COLS = 30; // strike / moneyness resolution
const ROWS = 16; // tenor / expiry resolution
export const STRIKE_WINDOW = 0.08; // exposure surfaces plot spot ±8%
export const IV_WINDOW = 0.2;      // the IV surface spans moneyness ±20%

/** Real strike range the exposure surfaces map across their columns: spot ±8%. */
export function strikeDomain(profile: SurfaceProfile | null | undefined): [number, number] | undefined {
  const spot = profile?.spot;
  if (!spot || spot <= 0) return undefined;
  return [spot * (1 - STRIKE_WINDOW), spot * (1 + STRIKE_WINDOW)];
}

/** Real strike range the IV surface maps (moneyness ±20% → K/S 0.8..1.2). */
export function ivStrikeDomain(profile: SurfaceProfile | null | undefined): [number, number] | undefined {
  const spot = profile?.spot;
  if (!spot || spot <= 0) return undefined;
  return [spot * (1 - IV_WINDOW), spot * (1 + IV_WINDOW)];
}

/**
 * Real tenor range in calendar days — only when the chain streams per-expiry slices (net
 * gamma). Otherwise the tenor axis is a documented model and carries no day domain.
 */
export function tenorDomainDays(profile: SurfaceProfile | null | undefined, field: ExposureField): [number, number] | undefined {
  if (field !== 'netGex') return undefined;
  const expiries = (profile?.expiries ?? []).filter((e) => Array.isArray(e.strikes) && e.strikes.length > 0 && Number.isFinite(e.dte));
  if (expiries.length < 2) return undefined;
  const dtes = expiries.map((e) => e.dte as number).sort((a, b) => a - b).slice(0, ROWS);
  return [dtes[0], dtes[dtes.length - 1]];
}

// Modelled term-structure weight per greek (real value is the front-chain column; the
// shape across tenor is a documented model — permitted by rule #2). Gamma & charm
// concentrate near-dated (hedging urgency into expiry); vanna builds with tenor (it's a
// vega×spot cross-greek, and vega grows with √t).
function tenorWeight(field: ExposureField, tenor: number): number {
  if (field === 'netVex') return 0.45 + 0.9 * Math.sqrt(tenor);   // vanna richer far-dated
  return 1 / Math.sqrt(1 + tenor * 6);                            // gamma / charm near-dated
}

/**
 * DEALER EXPOSURE SURFACE — X = strike, Z = tenor (near→far expiry), Y = a real per-strike
 * dealer exposure (net gamma `netGex`, net vanna `netVex`, or net charm `charmEx`).
 * Signed → diverging ramp (red = dealers destabilise / short, green = stabilise / long;
 * slate at the zero-crossing). Uses per-expiry slices when the chain provides them (net
 * gamma only); otherwise takes the REAL front-chain exposure column and applies the
 * greek-appropriate modelled term structure above.
 */
export function exposureSurfaceGrid(profile: SurfaceProfile | null | undefined, field: ExposureField): number[][] {
  const spot = profile?.spot;
  const strikes = (profile?.strikes ?? []).filter((s) => Number.isFinite(s.strike) && Number.isFinite(s.netGex));
  if (!spot || spot <= 0 || strikes.length < 4) return [];

  const lo = spot * 0.92, hi = spot * 1.08;
  const inWin = strikes.filter((s) => s.strike >= lo && s.strike <= hi).sort((a, b) => a.strike - b.strike);
  const src = inWin.length >= 6 ? inWin : [...strikes].sort((a, b) => a.strike - b.strike);
  const axis: number[] = [];
  for (let c = 0; c < COLS; c++) axis.push(lo + (hi - lo) * (c / (COLS - 1)));
  const valAt = (k: number): number => {
    let best = src[0], bd = Infinity;
    for (const s of src) { const d = Math.abs(s.strike - k); if (d < bd) { bd = d; best = s; } }
    return (best?.[field] as number | undefined) ?? 0;
  };

  const grid: number[][] = [];

  // Per-expiry slices only carry net gamma, so only gamma uses the real term structure.
  const expiries = (profile?.expiries ?? []).filter((e) => Array.isArray(e.strikes) && e.strikes.length > 0);
  if (field === 'netGex' && expiries.length >= 2) {
    const sorted = [...expiries].sort((a, b) => (a.dte ?? 0) - (b.dte ?? 0)).slice(0, ROWS);
    for (const e of sorted) {
      const byStrike = e.strikes;
      grid.push(axis.map((k) => {
        let best = byStrike[0], bd = Infinity;
        for (const s of byStrike) { const d = Math.abs(s.strike - k); if (d < bd) { bd = d; best = s; } }
        return best?.netGex ?? 0;
      }));
    }
    return grid;
  }

  for (let r = 0; r < ROWS; r++) {
    const w = tenorWeight(field, r / (ROWS - 1));
    grid.push(axis.map((k) => valAt(k) * w));
  }
  return grid;
}

/** @deprecated use exposureSurfaceGrid(profile, 'netGex'). Kept for callers/tests. */
export function gammaSurfaceGrid(profile: SurfaceProfile | null | undefined): number[][] {
  return exposureSurfaceGrid(profile, 'netGex');
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
