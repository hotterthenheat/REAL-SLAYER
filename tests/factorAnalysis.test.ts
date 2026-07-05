import { logReturns, pearson, correlationMatrix, jacobiEigenSymmetric, pcaFromCorrelation, ivSmileFactors } from '../src/lib/factorAnalysis';

let passed = 0;
function assert(cond: boolean, msg: string) { if (!cond) throw new Error('FAIL: ' + msg); passed++; console.log('✔ ' + msg); }
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log('--- RUNNING FACTOR-ANALYSIS TEST SUITE ---');

// logReturns
{
  const r = logReturns([100, 110, 99]);
  assert(r.length === 2, 'logReturns length n-1');
  assert(close(r[0], Math.log(1.1)), 'logReturns value correct');
  assert(logReturns([0, 100]).every((x) => Number.isFinite(x)), 'logReturns guards non-positive prices');
}

// pearson
{
  const x = [1, 2, 3, 4, 5];
  assert(close(pearson(x, x), 1), 'pearson of identical series = 1');
  assert(close(pearson(x, [5, 4, 3, 2, 1]), -1), 'pearson of reversed series = -1');
  assert(close(pearson(x, [7, 7, 7, 7, 7]), 0), 'pearson with a constant series = 0');
  const half = pearson([1, 2, 3, 4], [1, 2, 1, 2]);
  assert(half > -1 && half < 1, 'pearson of unrelated-ish series is strictly inside (-1,1)');
}

// correlationMatrix symmetry + unit diagonal
{
  const m = correlationMatrix([[1, 2, 3, 4], [2, 4, 6, 8], [4, 3, 2, 1]]);
  assert(m.length === 3 && m[0].length === 3, 'correlation matrix is N×N');
  assert(close(m[0][0], 1) && close(m[1][1], 1), 'unit diagonal');
  assert(close(m[0][1], 1), 'perfectly scaled series correlate = 1');
  assert(close(m[0][2], -1), 'opposite series correlate = -1');
  assert(close(m[0][1], m[1][0]) && close(m[0][2], m[2][0]), 'matrix is symmetric');
}

// jacobi eigen of a known symmetric matrix [[2,0],[0,3]] → eigenvalues 3,2
{
  const { values, vectors } = jacobiEigenSymmetric([[2, 0], [0, 3]]);
  assert(close(values[0], 3) && close(values[1], 2), 'diagonal matrix eigenvalues sorted desc');
  assert(vectors.length === 2, 'eigenvectors returned per row');
  // known 2x2 [[2,1],[1,2]] → eigenvalues 3 and 1
  const e2 = jacobiEigenSymmetric([[2, 1], [1, 2]]);
  assert(close(e2.values[0], 3) && close(e2.values[1], 1), 'symmetric 2×2 eigenvalues correct');
}

// PCA explained variance sums to 1, largest first
{
  const corr = correlationMatrix([
    [1, 2, 3, 4, 5], [1.1, 2.1, 2.9, 4.2, 4.8], // co-moving pair
    [5, 4, 3, 2, 1], // opposite
  ]);
  const pca = pcaFromCorrelation(corr);
  const sum = pca.explained.reduce((s, x) => s + x, 0);
  assert(close(sum, 1, 1e-6), 'PCA explained variance sums to 1');
  assert(pca.explained[0] >= pca.explained[1], 'PCA components sorted by explained variance');
  assert(pca.coords.length === 3, 'PCA yields a coordinate per asset');
  // co-moving assets 0 and 1 should be closer than 0 and 2
  const d01 = Math.hypot(pca.coords[0].pc1 - pca.coords[1].pc1, pca.coords[0].pc2 - pca.coords[1].pc2);
  const d02 = Math.hypot(pca.coords[0].pc1 - pca.coords[2].pc1, pca.coords[0].pc2 - pca.coords[2].pc2);
  assert(d01 < d02, 'co-moving assets cluster closer than anti-correlated ones');
}

// ivSmileFactors recovers a known quadratic smile
{
  const m = [-0.2, -0.1, 0, 0.1, 0.2];
  const level = 0.22, slope = -0.15, curv = 0.9;
  const iv = m.map((x) => level + slope * x + curv * x * x);
  const f = ivSmileFactors(m, iv)!;
  assert(f !== null, 'ivSmileFactors returns a fit for a valid smile');
  assert(close(f.level, level, 1e-6), 'recovers level factor');
  assert(close(f.slope, slope, 1e-6), 'recovers slope (skew) factor');
  assert(close(f.curvature, curv, 1e-6), 'recovers curvature factor');
  assert(close(f.r2, 1, 1e-6), 'exact quadratic → R² = 1');
  assert(ivSmileFactors([0], [0.2]) === null, 'too few points → null');
}

console.log(`🎉 ALL FACTOR-ANALYSIS TESTS PASSED! (${passed} assertions) 🎉`);
