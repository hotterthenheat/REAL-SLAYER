/**
 * Real factor / correlation analytics for the Factor Lab. Everything here is a plain
 * statistical calculation over supplied numeric series — Pearson correlation, a symmetric
 * eigen-solver (cyclic Jacobi), PCA off the correlation matrix, and a least-squares smile
 * factor fit. No coordinates, edges, clusters or loadings are invented: they are all a
 * deterministic function of the returns / IVs handed in. Feed it real (or model) data and
 * it yields real structure; feed it noise and it honestly reports noise.
 */

/** Continuously-compounded returns from a price path (length n → n-1). */
export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = prices[i - 1], b = prices[i];
    out.push(a > 0 && b > 0 ? Math.log(b / a) : 0);
  }
  return out;
}

/** Pearson correlation of two equal-length vectors; 0 when either is constant. */
export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db; va += da * da; vb += db * db;
  }
  if (va <= 0 || vb <= 0) return 0;
  return Math.max(-1, Math.min(1, cov / Math.sqrt(va * vb)));
}

/** N×N Pearson correlation matrix over N return series (each series equal length). */
export function correlationMatrix(series: number[][]): number[][] {
  const n = series.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    m[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const r = pearson(series[i], series[j]);
      m[i][j] = r; m[j][i] = r;
    }
  }
  return m;
}

/**
 * Eigen-decomposition of a real symmetric matrix via cyclic Jacobi rotations. Returns
 * eigenvalues and eigenvectors (as columns of `vectors`), sorted by eigenvalue descending.
 * Robust and exact enough for the small (≤ ~24) correlation matrices used here.
 */
export function jacobiEigenSymmetric(input: number[][], maxSweeps = 100): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const a = input.map((row) => row.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-14) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const idx = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[y][y] - a[x][x]);
  const values = idx.map((i) => a[i][i]);
  const vectors: number[][] = Array.from({ length: n }, (_, r) => idx.map((i) => v[r][i]));
  return { values, vectors };
}

export interface PCAResult {
  /** Per-asset (PC1, PC2) coordinates — the cluster / relationship map. */
  coords: { pc1: number; pc2: number }[];
  /** Fraction of total variance explained by each principal component (sums to 1). */
  explained: number[];
  /** loadings[i][k] = asset i's loading on PC k (eigenvector · √eigenvalue). */
  loadings: number[][];
}

/**
 * PCA of a correlation matrix. Loadings = eigvec·√eigval; coordinates are the top-2
 * loadings. Total variance of a correlation matrix is N (trace), so `explained` is
 * eigenvalue / N. Assets that co-move land near each other in (PC1, PC2).
 */
export function pcaFromCorrelation(corr: number[][]): PCAResult {
  const n = corr.length;
  if (n === 0) return { coords: [], explained: [], loadings: [] };
  const { values, vectors } = jacobiEigenSymmetric(corr);
  const totalVar = values.reduce((s, x) => s + Math.max(0, x), 0) || n;
  const explained = values.map((x) => Math.max(0, x) / totalVar);
  const loadings: number[][] = [];
  const coords: { pc1: number; pc2: number }[] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let k = 0; k < n; k++) row.push(vectors[i][k] * Math.sqrt(Math.max(0, values[k])));
    loadings.push(row);
    coords.push({ pc1: row[0] ?? 0, pc2: row[1] ?? 0 });
  }
  return { coords, explained, loadings };
}

export interface SmileFactors {
  level: number;      // β0 — parallel IV level
  slope: number;      // β1 — skew / linear tilt in log-moneyness
  curvature: number;  // β2 — smile convexity
  r2: number;         // fraction of the smile's variance the 3 factors explain
  fitted: number[];   // fitted IV per input point
}

/**
 * Three-factor decomposition of an implied-vol smile: least-squares fit of IV to
 * {1, m, m²} in log-moneyness m. These are the canonical vol factors — level (parallel),
 * slope (skew) and curvature (smile) — and the fit is exact linear algebra over the REAL
 * per-strike IVs, so the loadings are a genuine reading of the chain's smile shape.
 */
export function ivSmileFactors(moneyness: number[], iv: number[]): SmileFactors | null {
  const n = Math.min(moneyness.length, iv.length);
  if (n < 3) return null;
  // Normal equations for basis [1, m, m^2].
  let S0 = 0, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
  for (let i = 0; i < n; i++) {
    const m = moneyness[i], y = iv[i], m2 = m * m;
    S0 += 1; S1 += m; S2 += m2; S3 += m2 * m; S4 += m2 * m2;
    T0 += y; T1 += y * m; T2 += y * m2;
  }
  const A = [[S0, S1, S2], [S1, S2, S3], [S2, S3, S4]];
  const b = [T0, T1, T2];
  const beta = solve3(A, b);
  if (!beta) return null;
  const [level, slope, curvature] = beta;
  const fitted: number[] = [];
  let ssRes = 0, ssTot = 0;
  const meanY = T0 / n;
  for (let i = 0; i < n; i++) {
    const m = moneyness[i];
    const f = level + slope * m + curvature * m * m;
    fitted.push(f);
    ssRes += (iv[i] - f) ** 2;
    ssTot += (iv[i] - meanY) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  return { level, slope, curvature, r2, fitted };
}

/** Solve a 3×3 linear system by Gaussian elimination with partial pivoting. */
function solve3(A: number[][], b: number[]): [number, number, number] | null {
  const M = [[...A[0], b[0]], [...A[1], b[1]], [...A[2], b[2]]];
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k < 4; k++) M[r][k] -= f * M[col][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}
