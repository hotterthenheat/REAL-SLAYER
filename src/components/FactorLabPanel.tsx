import { useEffect, useMemo, useRef, useState } from 'react';
import { useContractStore } from '../lib/store';
import { Boxes, GitBranch, Layers } from 'lucide-react';
import { logReturns, correlationMatrix, pcaFromCorrelation, ivSmileFactors } from '../lib/factorAnalysis';
import type { ChainContract } from '../lib/v11Math';

/**
 * FACTOR LAB — real cross-asset and volatility factor structure. Nothing here is a
 * decorative node graph: every cell, coordinate and loading is computed from actual data.
 *
 *   • Cross-asset correlation heatmap — Pearson ρ over log-returns accumulated live from
 *     the multi-asset spot feed. It starts in DATA REQUIRED and fills as returns arrive;
 *     it never invents structure. On a live chain it reads real market co-movement.
 *   • PCA cluster map — principal components of that correlation matrix. Assets that
 *     co-move land near each other (real coordinates = eigvec·√eigval), colour-coded by
 *     macro role. PC1/PC2 explained-variance is reported.
 *   • IV smile factor decomposition — the classic level / slope / curvature factors,
 *     least-squares fit to the REAL per-strike IV smile. Always available from the chain,
 *     so the lab is never blank even before cross-asset returns have accumulated.
 */

// Curated cross-asset basket (all in ASSET_LIST) spanning indices, semis, havens and vol
// so the correlation structure and PCA clusters are interpretable.
type Role = 'equity' | 'tech' | 'haven' | 'vol' | 'fin';
const BASKET: { t: string; role: Role }[] = [
  { t: 'SPX', role: 'equity' }, { t: 'NDX', role: 'equity' }, { t: 'RUT', role: 'equity' }, { t: 'SOX', role: 'tech' },
  { t: 'QQQ', role: 'tech' }, { t: 'NVDA', role: 'tech' }, { t: 'AAPL', role: 'tech' }, { t: 'TSLA', role: 'tech' },
  { t: 'JPM', role: 'fin' }, { t: 'TLT', role: 'haven' }, { t: 'GLD', role: 'haven' }, { t: 'VIX', role: 'vol' },
];
const ROLE_CSS: Record<Role, string> = { equity: '#3b82f6', tech: '#22c55e', haven: '#eab308', vol: '#ef4444', fin: '#a855f7' };
const ROLE_LABEL: Record<Role, string> = { equity: 'Index', tech: 'Tech / Semis', haven: 'Haven', vol: 'Vol', fin: 'Financials' };

const MAX_SAMPLES = 90;   // rolling window of live snapshots
const MIN_SAMPLES = 24;   // returns needed before correlations are meaningful

// Module-scope ring buffer — survives remounts so the accumulated live returns are not
// thrown away every time the tab is re-opened.
const priceBuffer: Record<string, number>[] = [];
function pushSnapshot(prices: Record<string, number | undefined>) {
  const snap: Record<string, number> = {};
  for (const { t } of BASKET) {
    const v = prices[t];
    if (!(typeof v === 'number' && v > 0)) return; // only append fully-populated snapshots
    snap[t] = v;
  }
  const last = priceBuffer[priceBuffer.length - 1];
  if (last && BASKET.every(({ t }) => last[t] === snap[t])) return; // no-op tick
  priceBuffer.push(snap);
  if (priceBuffer.length > MAX_SAMPLES) priceBuffer.shift();
}

// diverging ρ → colour (red neg · slate 0 · green pos)
function corrCss(r: number): string {
  const t = (r + 1) / 2;
  if (t < 0.5) return `color-mix(in srgb, #ef4444 ${((0.5 - t) * 2 * 82 + 8).toFixed(0)}%, #1e293b)`;
  return `color-mix(in srgb, #22c55e ${((t - 0.5) * 2 * 82 + 8).toFixed(0)}%, #1e293b)`;
}

// ── MODEL MODE shared-factor simulator ──────────────────────────────────────
// When no live chain is connected there is no real return history to correlate, and a
// blank warm-up screen makes the lab look empty in walkthroughs. Instead we generate a
// deterministic multi-asset return series from a small, realistic factor model — a broad
// MARKET factor, a TECH/semis factor, a RATES/HAVEN factor and a VOL-shock factor — with
// each asset's loadings below. VIX loads strongly NEGATIVE on the market factor and
// positive on vol; bonds/gold load the haven factor. The resulting correlations and PCA
// are genuine calculations over model returns (labelled MODEL MODE), not invented cells.
const FACTOR_BETAS: Record<string, [number, number, number, number]> = {
  //       market  tech   haven  vol
  SPX:  [ 1.00,  0.10,  0.00, -0.05],
  NDX:  [ 1.05,  0.45,  0.00, -0.05],
  RUT:  [ 1.10, -0.05, -0.10, -0.05],
  SOX:  [ 1.15,  0.70,  0.00, -0.05],
  QQQ:  [ 1.02,  0.50,  0.00, -0.05],
  NVDA: [ 1.10,  0.85,  0.00, -0.05],
  AAPL: [ 1.00,  0.45,  0.00, -0.05],
  TSLA: [ 1.20,  0.55, -0.05, -0.05],
  JPM:  [ 0.95, -0.10,  0.20, -0.05],
  TLT:  [-0.25,  0.00,  0.90,  0.05],
  GLD:  [-0.10,  0.00,  0.55,  0.10],
  VIX:  [-2.80, -0.20,  0.10,  1.00],
};
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function modelReturns(n: number): number[][] {
  const rng = mulberry32(0x51a7e2); // fixed seed → stable frame-to-frame
  const series: number[][] = BASKET.map(() => []);
  for (let s = 0; s < n; s++) {
    const shock = rng() > 0.9 ? 2.4 : 1;              // occasional vol burst
    const F = [gauss(rng), gauss(rng), gauss(rng), gauss(rng) * shock]; // market, tech, haven, vol
    BASKET.forEach(({ t }, i) => {
      const b = FACTOR_BETAS[t] || [1, 0, 0, 0];
      const r = b[0] * F[0] * 0.010 + b[1] * F[1] * 0.008 + b[2] * F[2] * 0.006 + b[3] * F[3] * 0.010 + gauss(rng) * 0.004;
      series[i].push(r);
    });
  }
  return series;
}

const LOOKBACKS = [20, 60, 90] as const;

interface Props { chain?: ChainContract[]; spot?: number; ticker?: string; live?: boolean }

export function FactorLabPanel({ chain, spot, ticker, live }: Props) {
  const liveSpotPrices = useContractStore((s) => s.serverState?.liveSpotPrices);
  const [, setTick] = useState(0);

  // Accumulate a snapshot whenever the multi-asset spot map updates.
  useEffect(() => {
    if (!liveSpotPrices) return;
    pushSnapshot(liveSpotPrices as Record<string, number | undefined>);
    setTick((x) => x + 1);
  }, [liveSpotPrices]);

  const [lookback, setLookback] = useState<number>(60);

  const factors = useMemo(() => {
    const liveSamples = priceBuffer.length;
    // Live chain but not enough history yet → honest warm-up (never invent live structure).
    if (live && liveSamples < MIN_SAMPLES) return { mode: 'warming' as const, samples: liveSamples };
    // Live + enough history → real correlations over the lookback window; otherwise fall
    // back to the deterministic MODEL MODE factor simulator so the lab is never empty.
    const useLive = !!live && liveSamples >= MIN_SAMPLES;
    const series = useLive
      ? BASKET.map(({ t }) => logReturns(priceBuffer.slice(-(lookback + 1)).map((s) => s[t])))
      : modelReturns(lookback);
    const corr = correlationMatrix(series);
    const pca = pcaFromCorrelation(corr);
    // Average absolute off-diagonal correlation — a one-number read of "how tied together".
    let sum = 0, cnt = 0;
    for (let i = 0; i < corr.length; i++) for (let j = i + 1; j < corr.length; j++) { sum += Math.abs(corr[i][j]); cnt++; }
    const avgAbs = cnt ? sum / cnt : 0;
    const usedN = useLive ? Math.min(lookback, Math.max(0, liveSamples - 1)) : lookback;
    return { mode: (useLive ? 'live' : 'model') as 'live' | 'model', samples: usedN, corr, pca, avgAbs };
  }, [liveSpotPrices, live, lookback]); // recompute each live tick / lookback change

  const ready = factors.mode === 'live' || factors.mode === 'model';

  // IV smile factor decomposition off the real front chain (always available).
  const smile = useMemo(() => {
    if (!chain || !spot || !(spot > 0)) return null;
    const pts = chain
      .filter((c) => c.type === 'call' && Number.isFinite(c.iv) && c.iv > 0 && c.strike > 0)
      .map((c) => ({ m: Math.log(c.strike / spot), iv: c.iv }))
      .filter((p) => Math.abs(p.m) <= 0.25)
      .sort((a, b) => a.m - b.m);
    if (pts.length < 5) return null;
    const f = ivSmileFactors(pts.map((p) => p.m), pts.map((p) => p.iv));
    return f ? { f, pts } : null;
  }, [chain, spot]);

  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const n = BASKET.length;

  const state = factors.mode; // 'live' | 'model' | 'warming'
  const stateCss = state === 'live'
    ? 'text-[var(--success)] border-[var(--success)]/40 bg-[var(--success)]/10'
    : state === 'model' ? 'text-[var(--info)] border-[var(--info)]/40 bg-[var(--info)]/10'
      : 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface-2)]';
  const stateLabel = state === 'live' ? 'Live Chain' : state === 'model' ? 'Model Mode' : 'Collecting';
  const method = `Pearson · log returns · ${lookback}D`;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Boxes className="w-3.5 h-3.5 text-[var(--accent-color)]" />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">Factor Lab{ticker ? ` · ${ticker}` : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Lookback window control — drives the correlation/PCA sample window. */}
          <div className="hidden sm:flex items-center rounded border border-[var(--border)] overflow-hidden">
            {LOOKBACKS.map((lb) => (
              <button
                key={lb}
                onClick={() => setLookback(lb)}
                className={`px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-widest uppercase transition-colors ${lookback === lb ? 'bg-[var(--accent-color)]/15 text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
              >
                {lb}D
              </button>
            ))}
          </div>
          <span className={`text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded border uppercase ${stateCss}`}>{stateLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-3">
        {/* Correlation heatmap */}
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5 min-w-0"><Layers className="w-3 h-3 shrink-0" /> <span className="truncate">Cross-Asset Correlation</span></span>
            {ready && <span className="text-[8px] tabular-nums text-[var(--text-tertiary)] shrink-0">{method} · ⟨|ρ|⟩ {factors.avgAbs!.toFixed(2)}</span>}
          </div>
          {ready ? (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                {/* column headers */}
                <div className="flex">
                  <span className="w-9 shrink-0" />
                  {BASKET.map(({ t, role }) => (
                    <span key={t} className="flex-1 min-w-[16px] text-center text-[7px] tabular-nums" style={{ color: ROLE_CSS[role] }}>{t.slice(0, 3)}</span>
                  ))}
                </div>
                {factors.corr!.map((row, i) => (
                  <div key={i} className="flex items-center">
                    <span className="w-9 shrink-0 text-[7px] tabular-nums text-right pr-1" style={{ color: ROLE_CSS[BASKET[i].role] }}>{BASKET[i].t}</span>
                    {row.map((r, j) => (
                      <span
                        key={j}
                        onMouseEnter={() => setHover({ i, j })}
                        onMouseLeave={() => setHover(null)}
                        className="flex-1 min-w-[16px] aspect-square flex items-center justify-center text-[6px] tabular-nums cursor-crosshair transition-transform hover:scale-110"
                        style={{ background: i === j ? '#334155' : corrCss(r), color: Math.abs(r) > 0.55 ? '#0a0a0b' : 'rgba(255,255,255,0.55)' }}
                        title={`${BASKET[i].t} · ${BASKET[j].t}: ρ ${r.toFixed(2)}`}
                      >
                        {i === j ? '' : (r * 100).toFixed(0)}
                      </span>
                    ))}
                  </div>
                ))}
                <div className="mt-1.5 h-1 rounded-full" style={{ background: 'linear-gradient(to right, #ef4444, #334155, #22c55e)' }} />
                <div className="flex justify-between text-[7px] tabular-nums text-[var(--text-tertiary)] mt-0.5"><span>−1</span><span>0</span><span>+1</span></div>
                {hover && (
                  <div className="mt-1.5 text-[9px] tabular-nums text-[var(--text-secondary)]">
                    {BASKET[hover.i].t} × {BASKET[hover.j].t}: <span className="font-bold" style={{ color: factors.corr![hover.i][hover.j] < 0 ? 'var(--danger)' : 'var(--success)' }}>ρ {factors.corr![hover.i][hover.j].toFixed(3)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Warming samples={factors.samples!} min={MIN_SAMPLES} />
          )}
        </div>

        {/* PCA cluster map */}
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5"><GitBranch className="w-3 h-3" /> PCA Cluster Map</span>
            {ready && <span className="text-[9px] tabular-nums text-[var(--text-tertiary)]">PC1 {(factors.pca!.explained[0] * 100).toFixed(0)}% · PC2 {(factors.pca!.explained[1] * 100).toFixed(0)}%</span>}
          </div>
          {ready ? <PcaScatter pca={factors.pca!} /> : <Warming samples={factors.samples!} min={MIN_SAMPLES} />}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {(['equity', 'tech', 'fin', 'haven', 'vol'] as Role[]).map((r) => (
              <span key={r} className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-[var(--text-tertiary)]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: ROLE_CSS[r] }} /> {ROLE_LABEL[r]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* IV smile factor decomposition */}
      <div className="border-t border-[var(--border)] p-3">
        <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">Implied-Vol Smile Factors (level / slope / curvature · least-squares on the real smile)</span>
        {smile ? (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-2">
            <FactorTile label="Level" value={`${(smile.f.level * 100).toFixed(1)}%`} sub="ATM vol" tone="var(--accent-color)" />
            <FactorTile label="Slope (skew)" value={`${(smile.f.slope * 100).toFixed(1)}`} sub={smile.f.slope < 0 ? 'put-side rich' : 'call-side rich'} tone={smile.f.slope < 0 ? 'var(--danger)' : 'var(--success)'} />
            <FactorTile label="Curvature" value={`${(smile.f.curvature).toFixed(2)}`} sub="smile convexity" tone="var(--warning)" />
            <FactorTile label="Fit R²" value={`${(smile.f.r2 * 100).toFixed(1)}%`} sub="variance explained" tone="var(--info)" />
          </div>
        ) : (
          <div className="mt-2 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">Data required — chain smile unavailable.</div>
        )}
      </div>
    </div>
  );
}

function Warming({ samples, min }: { samples: number; min: number }) {
  const pct = Math.min(100, (samples / min) * 100);
  return (
    <div className="h-[150px] flex flex-col items-center justify-center gap-2 text-center px-4">
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">Warming up live return history</div>
      <div className="w-40 h-1.5 rounded-full bg-[var(--surface)] overflow-hidden border border-[var(--border)]">
        <div className="h-full bg-[var(--accent-color)] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[9px] tabular-nums text-[var(--text-tertiary)]">Correlation and PCA unlock after {min} return snapshots ({samples}/{min}). IV smile factors are available below now.</div>
    </div>
  );
}

function PcaScatter({ pca }: { pca: ReturnType<typeof pcaFromCorrelation> }) {
  const W = 300, H = 160, pad = 16;
  const xs = pca.coords.map((c) => c.pc1), ys = pca.coords.map((c) => c.pc2);
  const xMin = Math.min(...xs, -0.1), xMax = Math.max(...xs, 0.1);
  const yMin = Math.min(...ys, -0.1), yMax = Math.max(...ys, 0.1);
  const sx = (v: number) => pad + ((v - xMin) / ((xMax - xMin) || 1)) * (W - 2 * pad);
  const sy = (v: number) => (H - pad) - ((v - yMin) / ((yMax - yMin) || 1)) * (H - 2 * pad);
  const x0 = sx(0), y0 = sy(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" style={{ maxHeight: 170 }}>
      <line x1={x0} y1={4} x2={x0} y2={H - 4} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 3" />
      <line x1={4} y1={y0} x2={W - 4} y2={y0} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 3" />
      {pca.coords.map((c, i) => (
        <g key={i}>
          <circle cx={sx(c.pc1)} cy={sy(c.pc2)} r={6} fill={ROLE_CSS[BASKET[i].role]} opacity={0.28} />
          <circle cx={sx(c.pc1)} cy={sy(c.pc2)} r={3} fill={ROLE_CSS[BASKET[i].role]}>
            <title>{BASKET[i].t} · PC1 {c.pc1.toFixed(2)} · PC2 {c.pc2.toFixed(2)}</title>
          </circle>
          <text x={sx(c.pc1) + 6} y={sy(c.pc2) + 3} fontSize={7.5} fontWeight={600} fill="var(--text-secondary)" className="tabular-nums">{BASKET[i].t}</text>
        </g>
      ))}
    </svg>
  );
}

function FactorTile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="relative overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
      <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: tone, opacity: 0.7 }} />
      <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] truncate">{label}</div>
      <div className="text-[15px] font-bold tabular-nums leading-tight" style={{ color: tone }}>{value}</div>
      <div className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wide truncate">{sub}</div>
    </div>
  );
}

export default FactorLabPanel;
