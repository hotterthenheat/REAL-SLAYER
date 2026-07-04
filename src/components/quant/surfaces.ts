import type { SurfacePoint } from './ThreeSurface';

/**
 * Model-data generators for the Quant Lab 3D surfaces. Each maps real option-desk
 * axes to x/y/z so the third dimension actually carries information (not decoration).
 * These are deterministic MODEL builders — swap for a live greeks/vol feed when keys
 * are wired; the shapes (grid of heights, or x/y/z/value points) stay identical.
 */

// ── Implied-volatility surface: moneyness × tenor → IV ───────────────────────
// z = ATM vol + skew·(−m) + smile·m² + term-structure(√t). A real vol-smile-by-tenor.
export function ivSurfaceGrid(cols = 40, rows = 40): number[][] {
  const atm = 0.20 + Math.random() * 0.04;      // ~20–24% ATM
  const skew = 0.9 + Math.random() * 0.4;        // put-side richness
  const smile = 6 + Math.random() * 3;
  const grid: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const tenor = r / (rows - 1);                // 0 (near) → 1 (far)
    const term = 0.06 * Math.sqrt(tenor + 0.02); // vols lift with tenor
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      const m = (c / (cols - 1) - 0.5) * 0.4;    // moneyness ∈ [-0.2, +0.2]
      const iv = atm + term + skew * -m * 0.35 + smile * m * m;
      row.push(iv);
    }
    grid.push(row);
  }
  return grid;
}

// ── Risk cloud: per-strike moneyness × IV × net-GEX scatter ──────────────────
export function riskCloudPoints(n = 900): SurfacePoint[] {
  const out: SurfacePoint[] = [];
  for (let i = 0; i < n; i++) {
    const strike = (Math.random() - 0.5) * 40;                       // moneyness offset
    const iv = 12 + Math.abs(strike) * 0.6 + Math.random() * 14;      // vol smile-ish
    const gex = Math.sin(strike / 6) * 800 + (Math.random() - 0.5) * 400; // net gamma
    out.push({ x: strike, y: iv, z: gex, v: gex });
  }
  return out;
}

// ── Dealer hedging-pressure surface: strike × time-to-close → |hedging flow| ──
// Pressure concentrates near the gamma flip and rises into the close (charm).
export function hedgingPressureGrid(cols = 40, rows = 40): number[][] {
  const flip = (Math.random() - 0.5) * 3;
  const grid: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const toClose = 1 - r / (rows - 1);          // 1 (open) → 0 (close)
    const charm = 1 + (1 - toClose) * 2.2;       // hedging accelerates into the close
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      const strike = (c / (cols - 1) - 0.5) * 8 - flip;
      const pressure = charm * Math.exp(-(strike * strike) / 3.2) + 0.15 * Math.abs(Math.sin(strike));
      row.push(pressure);
    }
    grid.push(row);
  }
  return grid;
}
