/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * RISK-NEUTRAL PROBABILITY DISTRIBUTION
 * -------------------------------------
 * The market's own forward distribution for the underlying at expiry, inferred
 * from option prices via Breeden-Litzenberger:  f(K) = e^{rT} · ∂²C/∂K².
 *
 * This is the rigorous companion to the implied-density (PDF) hero: it renders
 * the CDF and reads every probability the directive asks for directly off the
 * already-solved density — probability above / below / between levels, touch
 * probability for the dealer walls and gamma flip, probability of expiring ITM,
 * the expected price, the expected move, and a 90% confidence band — plus the
 * implied-vs-realized vol (variance-risk-premium) comparison.
 *
 * Every number is traceable to the inputs in the provenance footer. Nothing is
 * synthesized: the panel only presents the risk-neutral density that was solved
 * from the live option chain (or, off-hours, the clearly-labelled model chain).
 */
import { useMemo, useRef, useId } from 'react';
import { touchProbability } from '../lib/probability';
import type { BreedenLitzenbergerResult } from '../lib/quantSuite';
import { useCrosshair, ChartTools } from './quant/chartInteraction';
import { useStrikeSync, StrikePublisher } from './quant/crosshairSync';

/** Monotone-cubic (Fritsch–Carlson) smooth SVG path — monotonicity-preserving, so a CDF never overshoots [0,1]. */
function smoothPath(pts: { x: number; y: number }[], startCmd: 'M' | 'L' = 'M'): string {
  const n = pts.length;
  if (n === 0) return '';
  const f = (v: number) => v.toFixed(1);
  if (n < 3) return pts.map((p, i) => `${i === 0 ? startCmd : 'L'}${f(p.x)},${f(p.y)}`).join(' ');
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const dx: number[] = [], slope: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; slope[i] = (ys[i + 1] - ys[i]) / (dx[i] || 1e-9); }
  const t: number[] = new Array(n);
  t[0] = slope[0]; t[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { t[i] = 0; t[i + 1] = 0; }
    else { const a = t[i] / slope[i], b = t[i + 1] / slope[i], s = a * a + b * b; if (s > 9) { const tau = 3 / Math.sqrt(s); t[i] = tau * a * slope[i]; t[i + 1] = tau * b * slope[i]; } }
  }
  let d = `${startCmd}${f(xs[0])},${f(ys[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const x1 = xs[i] + dx[i] / 3, y1 = ys[i] + (t[i] * dx[i]) / 3;
    const x2 = xs[i + 1] - dx[i] / 3, y2 = ys[i + 1] - (t[i + 1] * dx[i]) / 3;
    d += ` C${f(x1)},${f(y1)} ${f(x2)},${f(y2)} ${f(xs[i + 1])},${f(ys[i + 1])}`;
  }
  return d;
}

/** Dense legend chip — sharp corners, cold-dark surface, hairline accent border. */
function LegChip({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1 px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-wider leading-none" style={{ background: 'color-mix(in srgb, var(--surface-2) 90%, transparent)', border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`, color: 'var(--text-secondary)' }}>
      <span className="inline-block w-2.5" style={{ height: dashed ? 0 : 2, borderTop: dashed ? `2px dashed ${color}` : undefined, background: dashed ? undefined : color }} />
      {label}
    </span>
  );
}

interface RiskNeutralDistributionProps {
  rnd: BreedenLitzenbergerResult;
  spot: number;
  dteDays: number;
  ivAtm: number;        // ATM implied vol (annualized fraction)
  realizedVol: number;  // Yang-Zhang realized vol (annualized fraction)
  callWall?: number | null;
  putWall?: number | null;
  gammaFlip?: number | null;
  decimals?: number;
  ticker?: string;
  live?: boolean;
}

export function RiskNeutralDistribution({
  rnd, spot, dteDays, ivAtm, realizedVol, callWall, putWall, gammaFlip, decimals = 0, ticker, live,
}: RiskNeutralDistributionProps) {
  const m = useMemo(() => {
    const density = (rnd?.density || []).filter((d) => isFinite(d.strike) && isFinite(d.cumulativeProb));
    if (density.length < 3 || !(spot > 0)) return null;
    const sorted = [...density].sort((a, b) => a.strike - b.strike);
    const minS = sorted[0].strike, maxS = sorted[sorted.length - 1].strike;

    // CDF interpolation off the solved cumulativeProb, clamped to [0,1].
    const cdfAt = (K: number): number => {
      if (K <= minS) return 0;
      if (K >= maxS) return 1;
      let lo = 0, hi = sorted.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (sorted[mid].strike <= K) lo = mid; else hi = mid; }
      const a = sorted[lo], b = sorted[hi];
      const t = b.strike === a.strike ? 0 : (K - a.strike) / (b.strike - a.strike);
      return Math.max(0, Math.min(1, a.cumulativeProb + t * (b.cumulativeProb - a.cumulativeProb)));
    };
    // Inverse-CDF (percentile → strike) for confidence bands.
    const quantile = (p: number): number => {
      const target = Math.max(0, Math.min(1, p));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].cumulativeProb >= target) {
          const a = sorted[i - 1], b = sorted[i];
          const dz = b.cumulativeProb - a.cumulativeProb;
          const t = dz <= 0 ? 0 : (target - a.cumulativeProb) / dz;
          return a.strike + t * (b.strike - a.strike);
        }
      }
      return maxS;
    };

    const T = Math.max(dteDays, 0.5) / 365;
    const sigmaAnn = (rnd.stdDev / spot) / Math.sqrt(T); // annualized vol implied by the RND dispersion
    const touch = (L: number) => touchProbability(spot, L, sigmaAnn, T);

    const pBelowSpot = rnd.probLessThanSpot ?? cdfAt(spot);
    const pAboveSpot = rnd.probGreaterThanSpot ?? (1 - cdfAt(spot));

    const levels: { key: string; label: string; price: number; color: string; pAbove: number; pTouch: number }[] = [];
    if (callWall && callWall > 0) levels.push({ key: 'cw', label: 'Call Wall', price: callWall, color: 'var(--positive-ink)', pAbove: 1 - cdfAt(callWall), pTouch: touch(callWall) });
    if (gammaFlip && gammaFlip > 0) levels.push({ key: 'gf', label: 'γ Flip', price: gammaFlip, color: 'var(--pin)', pAbove: 1 - cdfAt(gammaFlip), pTouch: touch(gammaFlip) });
    if (putWall && putWall > 0) levels.push({ key: 'pw', label: 'Put Wall', price: putWall, color: 'var(--negative-ink)', pAbove: 1 - cdfAt(putWall), pTouch: touch(putWall) });

    const pBetweenWalls = (callWall && putWall && callWall > putWall) ? cdfAt(callWall) - cdfAt(putWall) : null;
    const ci90 = { lo: quantile(0.05), hi: quantile(0.95) };
    const vrp = ivAtm - realizedVol;

    return { sorted, minS, maxS, cdfAt, pBelowSpot, pAboveSpot, levels, pBetweenWalls, ci90, sigmaAnn, T, vrp };
  }, [rnd, spot, dteDays, ivAtm, realizedVol, callWall, putWall, gammaFlip]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');
  const { svgRef, vx, onPointerMove, onPointerLeave } = useCrosshair(1000);
  const { syncedStrike } = useStrikeSync('rnd');
  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  if (!m) {
    return (
      <div className="h-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">Insufficient chain for risk-neutral density</span>
      </div>
    );
  }

  // ---- CDF curve geometry (SVG) ----
  const W = 1000, H = 230, padL = 8, padR = 8, padT = 14, padB = 24;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const sx = (K: number) => x0 + ((K - m.minS) / ((m.maxS - m.minS) || 1)) * (x1 - x0);
  const sy = (p: number) => y1 - p * (y1 - y0);
  const pxPts = m.sorted.map((d) => ({ x: sx(d.strike), y: sy(Math.max(0, Math.min(1, d.cumulativeProb))) }));
  const curve = smoothPath(pxPts);
  const area = `${curve} L${x1},${y1} L${x0},${y1} Z`;
  const spotX = sx(spot);
  const meanX = sx(rnd.mean);
  const meanIn = rnd.mean >= m.minS && rnd.mean <= m.maxS;
  const ciLoX = sx(m.ci90.lo), ciHiX = sx(m.ci90.hi);
  // Small SVG chip (scales with viewBox) — sharp corners, mono label.
  const chip = (cx: number, text: string, color: string, y: number) => {
    const w = text.length * 5.6 + 8;
    return (
      <g style={{ pointerEvents: 'none' }}>
        <rect x={cx - w / 2} y={y} width={w} height={11} fill="var(--surface-2)" stroke={`color-mix(in srgb, ${color} 45%, transparent)`} strokeWidth={0.75} />
        <text x={cx} y={y + 8} fontSize={7.5} textAnchor="middle" fill={color} fontFamily="ui-monospace, monospace" style={{ fontWeight: 700, letterSpacing: '0.06em' }}>{text}</text>
      </g>
    );
  };

  // Crosshair: resolve the pointer's viewBox-x to a strike, then read P(below)/P(above) off the CDF.
  const hoverStrike = vx != null ? m.minS + ((vx - x0) / ((x1 - x0) || 1)) * (m.maxS - m.minS) : null;
  const hoverCdf = hoverStrike != null && hoverStrike >= m.minS && hoverStrike <= m.maxS ? m.cdfAt(hoverStrike) : null;

  const Cell = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] leading-none">{label}</span>
      <span className="text-[12px] font-bold tabular-nums leading-tight" style={{ color: tone || 'var(--text-primary)' }}>{value}</span>
    </div>
  );

  return (
    <div ref={wrapRef} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Risk-Neutral Distribution{ticker ? ` · ${ticker}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ChartTools name={`rnd-cdf-${ticker || 'spx'}`} svgRef={svgRef} fullscreenRef={wrapRef}
            csv={() => ({ headers: ['strike', 'pdf', 'cdf'], rows: m.sorted.map((d) => [d.strike.toFixed(2), d.probability.toExponential(6), d.cumulativeProb.toFixed(6)]) })} />
        </div>
      </div>

      {/* CDF — cumulative probability P(S_T ≤ K) */}
      <div className="px-1 pt-2">
        <div className="relative">
          <svg ref={svgRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block cursor-crosshair" preserveAspectRatio="none" style={{ maxHeight: 200 }}>
            <defs>
              <linearGradient id={`rndfill-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.24" />
                <stop offset="60%" stopColor="var(--accent-color)" stopOpacity="0.06" />
                <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* directional shading: below-spot (red) / above-spot (green) */}
            <rect x={x0} y={y0} width={Math.max(0, Math.min(spotX, x1) - x0)} height={y1 - y0} fill="color-mix(in srgb, var(--negative-ink) 6%, transparent)" />
            <rect x={Math.min(spotX, x1)} y={y0} width={Math.max(0, x1 - spotX)} height={y1 - y0} fill="color-mix(in srgb, var(--positive-ink) 5%, transparent)" />
            {/* 90% confidence band */}
            <rect x={Math.min(ciLoX, ciHiX)} y={y0} width={Math.abs(ciHiX - ciLoX)} height={y1 - y0} fill="color-mix(in srgb, var(--accent-color) 6%, transparent)" />
            <line x1={ciLoX} y1={y0} x2={ciLoX} y2={y1} stroke="var(--accent-color)" strokeWidth={1} strokeDasharray="2 3" opacity={0.45} />
            <line x1={ciHiX} y1={y0} x2={ciHiX} y2={y1} stroke="var(--accent-color)" strokeWidth={1} strokeDasharray="2 3" opacity={0.45} />
            {/* horizontal quartile gridlines + 50% guide */}
            {[0.25, 0.75].map((p) => (
              <line key={p} x1={x0} y1={sy(p)} x2={x1} y2={sy(p)} stroke="var(--border)" strokeWidth={1} strokeDasharray="1 4" opacity={0.5} />
            ))}
            <line x1={x0} y1={sy(0.5)} x2={x1} y2={sy(0.5)} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 4" opacity={0.85} />
            {/* level markers */}
            {m.levels.map((l) => (
              <line key={l.key} x1={sx(l.price)} y1={y0} x2={sx(l.price)} y2={y1} stroke={l.color} strokeWidth={1} opacity={0.5} strokeDasharray="2 3" />
            ))}
            {/* mean (expected price) reference */}
            {meanIn && <line x1={meanX} y1={y0} x2={meanX} y2={y1} stroke="var(--pin)" strokeWidth={1.25} strokeDasharray="4 2" opacity={0.8} />}
            {/* spot marker */}
            <line x1={spotX} y1={y0} x2={spotX} y2={y1} stroke="var(--text-secondary)" strokeWidth={1.25} />
            {/* CDF area (gradient) + smooth curve */}
            <path d={area} fill={`url(#rndfill-${uid})`} stroke="none" />
            <path d={curve} fill="none" stroke="var(--accent-color)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            {/* spot CDF dot */}
            <circle cx={spotX} cy={sy(m.cdfAt(spot))} r={3.4} fill="var(--accent-color)" stroke="var(--surface)" strokeWidth={1} />
            {/* chips */}
            {chip(spotX, 'SPOT', 'var(--text-secondary)', y0 + 1)}
            {meanIn && chip(meanX, 'E[S]', 'var(--pin)', y1 - 12)}
            {m.levels.map((l) => (l.price >= m.minS && l.price <= m.maxS ? <g key={`c${l.key}`}>{chip(sx(l.price), l.label === 'γ Flip' ? 'γ' : l.label === 'Call Wall' ? 'CW' : 'PW', l.color, y0 + 1)}</g> : null))}
            {/* synced strike from a sibling panel */}
            {syncedStrike != null && syncedStrike >= m.minS && syncedStrike <= m.maxS && (
              <line x1={sx(syncedStrike)} y1={y0} x2={sx(syncedStrike)} y2={y1} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 4" opacity={0.65} />
            )}
            {/* crosshair */}
            {hoverStrike != null && hoverCdf != null && (
              <>
                <line x1={sx(hoverStrike)} y1={y0} x2={sx(hoverStrike)} y2={y1} stroke="var(--accent-color)" strokeWidth={1} opacity={0.75} />
                <circle cx={sx(hoverStrike)} cy={sy(hoverCdf)} r={3.2} fill="var(--accent-color)" />
              </>
            )}
          </svg>
          <div className="pointer-events-none absolute top-1.5 right-2 flex items-center gap-1">
            <LegChip color="var(--accent-color)" label="CDF" />
            <LegChip color="var(--pin)" label="E[S]" dashed />
            <LegChip color="var(--accent-color)" label="90% CI" />
          </div>
          <StrikePublisher id="rnd" strike={hoverStrike} />
          {hoverStrike != null && hoverCdf != null && (
            <div className="pointer-events-none absolute top-1 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] tabular-nums shadow-lg" style={{ left: `${Math.min(80, (sx(hoverStrike) / W) * 100)}%` }}>
              <div className="text-[var(--text-primary)] font-bold">{fmt(hoverStrike)}</div>
              <div style={{ color: 'var(--danger)' }}>P(below) {pct(hoverCdf)}</div>
              <div style={{ color: 'var(--success)' }}>P(above) {pct(1 - hoverCdf)}</div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-2 pb-1 text-[9px] text-[var(--text-tertiary)] tabular-nums">
          <span>{fmt(m.minS)}</span>
          <span className="uppercase tracking-widest">CDF · P(Sₜ ≤ K)</span>
          <span>{fmt(m.maxS)}</span>
        </div>
      </div>

      {/* Probability readouts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 px-3.5 py-2.5">
        <Cell label="P(above spot)" value={pct(m.pAboveSpot)} tone="var(--success)" />
        <Cell label="P(below spot)" value={pct(m.pBelowSpot)} tone="var(--danger)" />
        <Cell label="Expected price" value={fmt(rnd.mean)} />
        <Cell label="Expected move ±1σ" value={`±${fmt(rnd.stdDev)}`} tone="var(--warning)" />
        {m.levels.map((l) => (
          <Cell key={l.key} label={`P(touch ${l.label})`} value={pct(l.pTouch)} tone={l.color} />
        ))}
        {m.pBetweenWalls != null && <Cell label="P(between walls)" value={pct(m.pBetweenWalls)} tone="var(--info)" />}
        <Cell label="90% CI low" value={fmt(m.ci90.lo)} />
        <Cell label="90% CI high" value={fmt(m.ci90.hi)} />
        <Cell label="RND skew" value={rnd.skewness.toFixed(2)} tone={rnd.skewness < 0 ? 'var(--danger)' : 'var(--success)'} />
        <Cell label="Excess kurtosis" value={rnd.kurtosis.toFixed(2)} tone={rnd.isFatTailed ? 'var(--warning)' : 'var(--text-primary)'} />
      </div>

      {/* Implied vs realized vol comparison */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3.5 py-2 border-t border-[var(--border)] text-[10px]">
        <span className="text-[var(--text-tertiary)] uppercase tracking-widest">Vol</span>
        <span className="text-[var(--text-secondary)]">ATM IV <b className="text-[var(--text-primary)] tabular-nums">{pct(ivAtm)}</b></span>
        <span className="text-[var(--text-secondary)]">Realized (YZ) <b className="text-[var(--text-primary)] tabular-nums">{pct(realizedVol)}</b></span>
        <span className="text-[var(--text-secondary)]">VRP (IV−RV) <b className="tabular-nums" style={{ color: m.vrp >= 0 ? 'var(--success)' : 'var(--danger)' }}>{(m.vrp * 100).toFixed(1)} pts</b></span>
        <span className="tabular-nums" style={{ color: m.vrp >= 0 ? 'var(--success)' : 'var(--danger)' }}>{m.vrp >= 0 ? 'options rich' : 'options cheap'}</span>
      </div>

      {/* Provenance */}
      <div className="px-3.5 py-2 border-t border-[var(--border)] text-[9px] text-[var(--text-tertiary)] leading-relaxed">
        <span className="font-bold text-[var(--text-secondary)]">Model</span> Breeden-Litzenberger risk-neutral density · <span className="font-mono">f(K)=e^{'{rT}'}·∂²C/∂K²</span> ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Inputs</span> chain n={m.sorted.length}, spot {fmt(spot)}, {dteDays}DTE, r=5.1% ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Assumes</span> no-arbitrage risk-neutral measure; touch via reflection on σ={(m.sigmaAnn * 100).toFixed(1)}% ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Source</span> {live ? 'live option chain' : 'model chain (off-hours)'}
        {rnd.isFatTailed ? ' · ⚠ fat-tailed: normal-based reads understate tails' : ''}
      </div>
    </div>
  );
}
