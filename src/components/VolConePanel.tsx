/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * REALIZED VOLATILITY CONE
 * ------------------------
 * The desk's reference for "is vol rich or cheap right now, for this horizon?".
 * For each lookback window the panel renders the full DISTRIBUTION of realized
 * volatility the underlying has actually printed — min · 25th · median · 75th ·
 * max — and overlays the CURRENT realized vol per window plus the front ATM
 * implied vol as a single reference line. Where current/IV sits inside the cone
 * is the read: near the top ⇒ vol historically rich (mean-reversion favoured),
 * near the floor ⇒ cheap.
 *
 * Everything is computed from REAL streamed candles by the platform's annualized,
 * bar-interval-aware estimators (src/lib/realizedVol via calculateVolatilityCone)
 * — the quantiles are the empirical rolling distribution, never a fabricated
 * waveform. Off-hours, when only a synthetic candle series is available, the
 * panel is labelled MODEL.
 */
import { useRef, useId } from 'react';
import { type VolConePoint } from '../lib/quantSuite';
import { useCrosshair, ChartTools } from './quant/chartInteraction';

/** Monotone-cubic (Fritsch–Carlson) smooth SVG path through screen-space points — no overshoot. */
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

interface VolConePanelProps {
  cone: VolConePoint[];  // precomputed by calculateVolatilityCone (real, annualized)
  atmIv: number;         // front-expiry ATM implied vol (annualized fraction)
  realizedVol: number;   // front Yang-Zhang realized vol (annualized fraction)
  ticker?: string;
  live?: boolean;
}

/** Linear-interpolated percentile of `v` within a cone point's empirical quantiles. */
function conePercentile(p: VolConePoint, v: number): number {
  const qs = [
    { p: 0, v: p.min }, { p: 25, v: p.p25 }, { p: 50, v: p.p50 }, { p: 75, v: p.p75 }, { p: 100, v: p.max },
  ];
  if (v <= qs[0].v) return 0;
  if (v >= qs[4].v) return 100;
  for (let i = 1; i < qs.length; i++) {
    if (v <= qs[i].v) {
      const a = qs[i - 1], b = qs[i];
      const t = b.v === a.v ? 0 : (v - a.v) / (b.v - a.v);
      return a.p + t * (b.p - a.p);
    }
  }
  return 100;
}

export function VolConePanel({ cone: coneRaw, atmIv, realizedVol, ticker, live }: VolConePanelProps) {
  const cone = coneRaw.filter((c) => isFinite(c.p50) && c.max > 0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');
  const { svgRef, vx, onPointerMove, onPointerLeave } = useCrosshair(1000);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  if (cone.length < 2) {
    return (
      <div className="h-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">Not enough candle history for a vol cone</span>
      </div>
    );
  }

  const W = 1000, H = 240, padL = 40, padR = 12, padT = 16, padB = 26;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const wMin = cone[0].window, wMax = cone[cone.length - 1].window;
  // Robust y-range: cap at a sensible bound so a single blown-out window (common
  // with the synthetic off-hours series) can't squash the median/current/IV. The
  // hover readout always shows the true value; out-of-range bars clip at the top.
  const medianMax = Math.max(...cone.map((c) => c.p50));
  const p75Max = Math.max(...cone.map((c) => c.p75));
  const rawMax = Math.max(atmIv, ...cone.map((c) => c.max));
  const robustCap = Math.max(atmIv * 1.8, p75Max * 1.6, medianMax * 2.2);
  const vHi = Math.min(rawMax, robustCap) * 1.06;
  const vLo = Math.max(0, Math.min(realizedVol, ...cone.map((c) => c.min)) * 0.9);
  const sx = (w: number) => x0 + ((w - wMin) / ((wMax - wMin) || 1)) * (x1 - x0);
  const sy = (v: number) => {
    const yy = y1 - ((v - vLo) / ((vHi - vLo) || 1)) * (y1 - y0);
    return Math.max(y0, Math.min(y1, yy)); // clamp into the plot box
  };

  const ptsFor = (key: 'min' | 'p25' | 'p50' | 'p75' | 'max' | 'current') =>
    cone.map((c) => ({ x: sx(c.window), y: sy(c[key]) }));
  const lineFor = (key: 'min' | 'p25' | 'p50' | 'p75' | 'max' | 'current') => smoothPath(ptsFor(key));
  const band = (top: 'max' | 'p75', bot: 'min' | 'p25') => {
    const topD = smoothPath(ptsFor(top));
    const botD = smoothPath(ptsFor(bot).reverse(), 'L');
    return `${topD} ${botD} Z`;
  };

  const ticks = [vLo, (vLo + vHi) / 2, vHi];

  // Crosshair → nearest cone window.
  const hoverW = vx != null ? wMin + ((vx - x0) / ((x1 - x0) || 1)) * (wMax - wMin) : null;
  const hoverPt = hoverW != null && hoverW >= wMin - 3 && hoverW <= wMax + 3
    ? cone.reduce((b, c) => (Math.abs(c.window - hoverW) < Math.abs(b.window - hoverW) ? c : b), cone[0]) : null;

  const ivPctShort = conePercentile(cone[0], atmIv);
  const front = cone[0], back = cone[cone.length - 1];
  const vrp = atmIv - realizedVol;

  const Cell = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] leading-none">{label}</span>
      <span className="text-[12px] font-bold tabular-nums leading-tight" style={{ color: tone || 'var(--text-primary)' }}>{value}</span>
      {sub && <span className="text-[9px] text-[var(--text-tertiary)] leading-tight">{sub}</span>}
    </div>
  );

  return (
    <div ref={wrapRef} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Realized Volatility Cone{ticker ? ` · ${ticker}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ChartTools name={`vol-cone-${ticker || 'spx'}`} svgRef={svgRef} fullscreenRef={wrapRef}
            csv={() => ({ headers: ['window', 'min', 'p25', 'median', 'p75', 'max', 'current'], rows: cone.map((c) => [c.window, c.min.toFixed(4), c.p25.toFixed(4), c.p50.toFixed(4), c.p75.toFixed(4), c.max.toFixed(4), c.current.toFixed(4)]) })} />
        </div>
      </div>

      <div className="relative">
        <svg ref={svgRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block cursor-crosshair" preserveAspectRatio="none" style={{ maxHeight: 220 }}>
          <defs>
            <linearGradient id={`coneOuter-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`coneInner-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.24" />
              <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          {/* faint vertical gridlines at each lookback window */}
          {cone.map((c) => (
            <line key={`vg${c.window}`} x1={sx(c.window)} y1={y0} x2={sx(c.window)} y2={y1} stroke="var(--border)" strokeWidth={1} opacity={0.28} />
          ))}
          {/* horizontal gridlines + tick labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={x0} y1={sy(t)} x2={x1} y2={sy(t)} stroke="var(--border)" strokeWidth={1} strokeDasharray="1 4" opacity={0.6} />
              <text x={4} y={sy(t) + 3} fontSize={10} fill="var(--text-tertiary)" fontFamily="ui-monospace, monospace">{(t * 100).toFixed(0)}%</text>
            </g>
          ))}
          {/* min–max envelope, then 25–75 band (gradient-filled) */}
          <path d={band('max', 'min')} fill={`url(#coneOuter-${uid})`} stroke="none" />
          <path d={band('p75', 'p25')} fill={`url(#coneInner-${uid})`} stroke="none" />
          <path d={lineFor('p50')} fill="none" stroke="var(--text-secondary)" strokeWidth={1.25} strokeDasharray="4 3" strokeLinejoin="round" />
          {/* front ATM IV reference */}
          <line x1={x0} y1={sy(atmIv)} x2={x1} y2={sy(atmIv)} stroke="var(--pin)" strokeWidth={1.25} strokeDasharray="5 3" />
          <g style={{ pointerEvents: 'none' }}>
            <rect x={x1 - 44} y={sy(atmIv) - 13} width={40} height={11} fill="var(--surface-2)" stroke="color-mix(in srgb, var(--pin) 45%, transparent)" strokeWidth={0.75} />
            <text x={x1 - 6} y={sy(atmIv) - 5} fontSize={7.5} fill="var(--pin)" textAnchor="end" fontFamily="ui-monospace, monospace" style={{ fontWeight: 700, letterSpacing: '0.06em' }}>IV {(atmIv * 100).toFixed(0)}%</text>
          </g>
          {/* current realized vol per window (smooth) */}
          <path d={lineFor('current')} fill="none" stroke="var(--accent-color)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
          {cone.map((c) => <circle key={c.window} cx={sx(c.window)} cy={sy(c.current)} r={2.2} fill="var(--accent-color)" stroke="var(--surface)" strokeWidth={0.75} />)}
          {/* crosshair */}
          {hoverPt && <line x1={sx(hoverPt.window)} y1={y0} x2={sx(hoverPt.window)} y2={y1} stroke="var(--accent-color)" strokeWidth={1} opacity={0.6} />}
          {hoverPt && <circle cx={sx(hoverPt.window)} cy={sy(hoverPt.current)} r={3.2} fill="var(--accent-color)" />}
        </svg>
        <div className="pointer-events-none absolute top-1.5 right-2 flex items-center gap-1">
          <LegChip color="var(--accent-color)" label="Current" />
          <LegChip color="var(--pin)" label="ATM IV" dashed />
          <LegChip color="var(--text-secondary)" label="Median" dashed />
          <LegChip color="var(--accent-color)" label="25–75" />
        </div>
        {hoverPt && (
          <div className="pointer-events-none absolute top-1 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] tabular-nums shadow-lg" style={{ left: `${Math.min(78, (sx(hoverPt.window) / W) * 100)}%` }}>
            <div className="text-[var(--text-primary)] font-bold">{hoverPt.window}-bar</div>
            <div style={{ color: 'var(--accent-color)' }}>now {pct(hoverPt.current)} · {conePercentile(hoverPt, hoverPt.current).toFixed(0)}%ile</div>
            <div className="text-[var(--text-tertiary)] text-[8.5px]">med {pct(hoverPt.p50)} · {pct(hoverPt.min)}–{pct(hoverPt.max)}</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 pb-1 text-[9px] text-[var(--text-tertiary)] tabular-nums">
        <span>{wMin}-bar</span>
        <span className="uppercase tracking-widest">lookback window · annualized realized vol</span>
        <span>{wMax}-bar</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 px-3.5 py-2.5 border-t border-[var(--border)]">
        <Cell label="Front IV" value={pct(atmIv)} sub="ATM implied" tone="var(--pin)" />
        <Cell label="Realized (YZ)" value={pct(realizedVol)} sub="front window" />
        <Cell label="VRP (IV−RV)" value={`${(vrp * 100).toFixed(1)} pts`} sub={vrp >= 0 ? 'options rich' : 'options cheap'} tone={vrp >= 0 ? 'var(--success)' : 'var(--danger)'} />
        <Cell label={`IV %ile (${front.window}-bar)`} value={`${ivPctShort.toFixed(0)}%`} sub={ivPctShort >= 75 ? 'rich vs history' : ivPctShort <= 25 ? 'cheap vs history' : 'mid-cone'} tone={ivPctShort >= 75 ? 'var(--danger)' : ivPctShort <= 25 ? 'var(--success)' : 'var(--text-primary)'} />
        <Cell label="Cone slope" value={back.p50 >= front.p50 ? 'Upward' : 'Downward'} sub={`${pct(front.p50)} → ${pct(back.p50)} median`} tone={back.p50 >= front.p50 ? 'var(--success)' : 'var(--warning)'} />
      </div>

      <div className="px-3.5 py-2 border-t border-[var(--border)] text-[9px] text-[var(--text-tertiary)] leading-relaxed">
        <span className="font-bold text-[var(--text-secondary)]">Method</span> empirical rolling realized-vol distribution per lookback (min/25/median/75/max), annualized & bar-interval-aware ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Reads</span> current/IV high in the cone ⇒ vol rich (fade); low ⇒ cheap (own) ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Source</span> {live ? 'live streamed candles' : 'synthetic candles (off-hours)'} + front ATM IV reference
      </div>
    </div>
  );
}
