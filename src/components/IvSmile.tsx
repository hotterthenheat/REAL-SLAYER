/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * IMPLIED VOLATILITY SMILE / SKEW
 * -------------------------------
 * The real front-expiry implied-volatility smile: per-strike IV straight from the
 * option chain (the one IV dimension the feed actually ships per contract), with
 * the at-the-money level, the 25-delta wings, and the dealer-desk skew dials
 * (25Δ risk reversal, 25Δ butterfly, ∂IV/∂lnK) computed from it.
 *
 * No term-structure extrapolation here — this is a single, REAL expiry. (A full
 * IV surface over DTE would be a labelled model, since per-(strike,expiry) IV is
 * not in the feed.) Everything plotted traces to a real contract IV.
 */
import { useMemo, useRef, useId } from 'react';
import { computeSkew, ivAtDelta } from '../lib/skewAnalytics';
import type { ChainContract } from '../lib/v11Math';
import { useCrosshair, ChartTools } from './quant/chartInteraction';
import { useStrikeSync, StrikePublisher } from './quant/crosshairSync';

/** Monotone-cubic (Fritsch–Carlson) smooth SVG path through screen-space points — preserves peaks, no overshoot. */
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

interface IvSmileProps {
  chain: ChainContract[];
  spot: number;
  decimals?: number;
  ticker?: string;
  live?: boolean;
  windowPct?: number;
}

export function IvSmile({ chain, spot, decimals = 0, ticker, live, windowPct = 0.14 }: IvSmileProps) {
  const m = useMemo(() => {
    if (!Array.isArray(chain) || chain.length < 4 || !(spot > 0)) return null;
    const lo = spot * (1 - windowPct), hi = spot * (1 + windowPct);
    // Blend call+put IV at each strike within the window.
    const byStrike = new Map<number, number[]>();
    chain.forEach((c) => {
      if (c.strike >= lo && c.strike <= hi && isFinite(c.iv) && c.iv > 0) {
        (byStrike.get(c.strike) || byStrike.set(c.strike, []).get(c.strike)!).push(c.iv);
      }
    });
    const pts = Array.from(byStrike.entries())
      .map(([strike, ivs]) => ({ strike, iv: ivs.reduce((a, b) => a + b, 0) / ivs.length }))
      .sort((a, b) => a.strike - b.strike);
    if (pts.length < 4) return null;

    const skew = computeSkew(chain, spot);
    const calls = chain.filter((c) => c.type === 'call');
    const puts = chain.filter((c) => c.type === 'put');
    // strike at a target |delta| (for marking the 25Δ wings on the curve)
    const strikeAtDelta = (side: ChainContract[], target: number): number | null => {
      const f = side.filter((c) => isFinite(c.delta) && isFinite(c.iv) && c.iv > 0)
        .map((c) => ({ ad: Math.abs(c.delta), k: c.strike })).sort((a, b) => a.ad - b.ad);
      if (f.length < 2) return null;
      for (let i = 1; i < f.length; i++) if (target <= f[i].ad) {
        const a = f[i - 1], b = f[i]; const t = (target - a.ad) / (b.ad - a.ad || 1);
        return a.k + (b.k - a.k) * t;
      }
      return f[f.length - 1].k;
    };
    const callWingK = strikeAtDelta(calls, 0.25);
    const putWingK = strikeAtDelta(puts, 0.25);

    const ivs = pts.map((p) => p.iv);
    const minIv = Math.min(...ivs), maxIv = Math.max(...ivs);
    const minS = pts[0].strike, maxS = pts[pts.length - 1].strike;
    return { pts, skew, minIv, maxIv, minS, maxS, callWingK, putWingK, callIv25: ivAtDelta(calls, 0.25), putIv25: ivAtDelta(puts, 0.25) };
  }, [chain, spot, windowPct]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');
  const { svgRef, vx, onPointerMove, onPointerLeave } = useCrosshair(1000);
  const { syncedStrike } = useStrikeSync('iv-smile');
  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  if (!m) {
    return (
      <div className="h-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">No IV smile (chain too sparse)</span>
      </div>
    );
  }

  const W = 1000, H = 240, padL = 44, padR = 12, padT = 16, padB = 26;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const padIv = (m.maxIv - m.minIv) * 0.15 || 0.01;
  const loIv = Math.max(0, m.minIv - padIv), hiIv = m.maxIv + padIv;
  const sx = (k: number) => x0 + ((k - m.minS) / ((m.maxS - m.minS) || 1)) * (x1 - x0);
  const sy = (iv: number) => y1 - ((iv - loIv) / ((hiIv - loIv) || 1)) * (y1 - y0);
  const pxPts = m.pts.map((p) => ({ x: sx(p.strike), y: sy(p.iv) }));
  const curve = smoothPath(pxPts);
  const area = `${curve} L${sx(m.maxS).toFixed(1)},${y1} L${sx(m.minS).toFixed(1)},${y1} Z`;
  const spotX = sx(spot);
  const ticks = [loIv, (loIv + hiIv) / 2, hiIv];
  const vGrid = [0.2, 0.4, 0.6, 0.8];
  // Smile IV interpolated at an arbitrary strike (for the ATM marker at spot).
  const ivAt = (K: number): number => {
    if (K <= m.minS) return m.pts[0].iv;
    if (K >= m.maxS) return m.pts[m.pts.length - 1].iv;
    for (let i = 1; i < m.pts.length; i++) if (m.pts[i].strike >= K) {
      const a = m.pts[i - 1], b = m.pts[i]; const t = b.strike === a.strike ? 0 : (K - a.strike) / (b.strike - a.strike);
      return a.iv + t * (b.iv - a.iv);
    }
    return m.pts[m.pts.length - 1].iv;
  };
  const vertex = m.pts.reduce((a, b) => (b.iv < a.iv ? b : a), m.pts[0]); // smile floor (min IV)
  const spotIn = spot >= m.minS && spot <= m.maxS;
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

  // Crosshair: resolve pointer's viewBox-x to a strike, then interpolate the smile IV there.
  const hoverStrike = vx != null ? m.minS + ((vx - x0) / ((x1 - x0) || 1)) * (m.maxS - m.minS) : null;
  const hoverIv = (() => {
    if (hoverStrike == null || hoverStrike < m.minS || hoverStrike > m.maxS) return null;
    const p = m.pts;
    for (let i = 1; i < p.length; i++) {
      if (p[i].strike >= hoverStrike) {
        const a = p[i - 1], b = p[i];
        const t = b.strike === a.strike ? 0 : (hoverStrike - a.strike) / (b.strike - a.strike);
        return a.iv + t * (b.iv - a.iv);
      }
    }
    return p[p.length - 1].iv;
  })();

  const bias = m.skew?.bias ?? 'FLAT';
  const biasColor = bias === 'PUT SKEW' ? 'var(--negative-ink)' : bias === 'CALL SKEW' ? 'var(--positive-ink)' : 'var(--text-secondary)';

  return (
    <div ref={wrapRef} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Implied Volatility Smile{ticker ? ` · ${ticker}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ChartTools name={`iv-smile-${ticker || 'spx'}`} svgRef={svgRef} fullscreenRef={wrapRef}
            csv={() => ({ headers: ['strike', 'iv'], rows: m.pts.map((p) => [p.strike.toFixed(2), p.iv.toFixed(6)]) })} />
          <span className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase" style={{ color: biasColor, background: `color-mix(in srgb, ${biasColor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${biasColor} 30%, transparent)` }}>{bias}</span>
        </div>
      </div>

      <div className="relative">
        <svg ref={svgRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block cursor-crosshair" preserveAspectRatio="none" style={{ maxHeight: 220 }}>
          <defs>
            <linearGradient id={`ivfill-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.26" />
              <stop offset="58%" stopColor="var(--accent-color)" stopOpacity="0.07" />
              <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* faint vertical gridlines */}
          {vGrid.map((f, i) => (
            <line key={`vg${i}`} x1={x0 + f * (x1 - x0)} y1={y0} x2={x0 + f * (x1 - x0)} y2={y1} stroke="var(--border)" strokeWidth={1} opacity={0.32} />
          ))}
          {/* horizontal gridlines + tick labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={x0} y1={sy(t)} x2={x1} y2={sy(t)} stroke="var(--border)" strokeWidth={1} strokeDasharray="1 4" opacity={0.7} />
              <text x={4} y={sy(t) + 3} fontSize={10} fill="var(--text-tertiary)" fontFamily="ui-monospace, monospace">{(t * 100).toFixed(0)}%</text>
            </g>
          ))}
          {/* 25Δ wings — directional colours */}
          {m.putWingK && <line x1={sx(m.putWingK)} y1={y0} x2={sx(m.putWingK)} y2={y1} stroke="var(--negative-ink)" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />}
          {m.callWingK && <line x1={sx(m.callWingK)} y1={y0} x2={sx(m.callWingK)} y2={y1} stroke="var(--positive-ink)" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />}
          {/* spot reference */}
          <line x1={spotX} y1={y0} x2={spotX} y2={y1} stroke="var(--text-secondary)" strokeWidth={1.25} />
          {/* smile area (gradient) + smooth curve */}
          <path d={area} fill={`url(#ivfill-${uid})`} stroke="none" />
          <path d={curve} fill="none" stroke="var(--accent-color)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
          {m.pts.map((p, i) => <circle key={i} cx={sx(p.strike)} cy={sy(p.iv)} r={1.5} fill="var(--accent-color)" opacity={0.5} />)}
          {/* smile floor (min IV) */}
          <circle cx={sx(vertex.strike)} cy={sy(vertex.iv)} r={3} fill="var(--pin)" stroke="var(--surface)" strokeWidth={1} />
          {/* ATM marker at spot */}
          {spotIn && <circle cx={spotX} cy={sy(ivAt(spot))} r={3.4} fill="var(--accent-color)" stroke="var(--surface)" strokeWidth={1} />}
          {chip(spotX, 'SPOT', 'var(--text-secondary)', y0 + 1)}
          {/* synced strike from a sibling panel */}
          {syncedStrike != null && syncedStrike >= m.minS && syncedStrike <= m.maxS && (
            <line x1={sx(syncedStrike)} y1={y0} x2={sx(syncedStrike)} y2={y1} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 4" opacity={0.65} />
          )}
          {/* crosshair */}
          {hoverStrike != null && hoverIv != null && (
            <>
              <line x1={sx(hoverStrike)} y1={y0} x2={sx(hoverStrike)} y2={y1} stroke="var(--accent-color)" strokeWidth={1} opacity={0.75} />
              <circle cx={sx(hoverStrike)} cy={sy(hoverIv)} r={3.2} fill="var(--accent-color)" />
            </>
          )}
        </svg>
        <div className="pointer-events-none absolute top-1.5 right-2 flex items-center gap-1">
          <LegChip color="var(--accent-color)" label="Smile" />
          <LegChip color="var(--positive-ink)" label="25Δ C" dashed />
          <LegChip color="var(--negative-ink)" label="25Δ P" dashed />
          <LegChip color="var(--pin)" label="Floor" />
        </div>
        <StrikePublisher id="iv-smile" strike={hoverStrike} />
        {hoverStrike != null && hoverIv != null && (
          <div className="pointer-events-none absolute top-1 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] tabular-nums shadow-lg" style={{ left: `${Math.min(80, (sx(hoverStrike) / W) * 100)}%` }}>
            <div className="text-[var(--text-primary)] font-bold">K {fmt(hoverStrike)}</div>
            <div style={{ color: 'var(--accent-color)' }}>IV {(hoverIv * 100).toFixed(1)}%</div>
            <div className="text-[var(--text-tertiary)] text-[8.5px]">{hoverStrike >= spot ? `+${(((hoverStrike / spot) - 1) * 100).toFixed(1)}%` : `${(((hoverStrike / spot) - 1) * 100).toFixed(1)}%`} vs spot</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 pb-1 text-[9px] text-[var(--text-tertiary)] tabular-nums">
        <span>K {fmt(m.minS)}</span>
        <span className="uppercase tracking-widest">strike · spot {fmt(spot)}</span>
        <span>K {fmt(m.maxS)}</span>
      </div>

      {m.skew && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-3.5 py-2.5 border-t border-[var(--border)]">
          <Cell label="ATM IV" value={`${(m.skew.atmIv * 100).toFixed(1)}%`} />
          <Cell label="25Δ Risk Reversal" value={`${(m.skew.riskReversal25 * 100).toFixed(2)} pts`} tone={m.skew.riskReversal25 >= 0 ? 'var(--danger)' : 'var(--success)'} />
          <Cell label="25Δ Butterfly" value={`${(m.skew.butterfly25 * 100).toFixed(2)} pts`} tone="var(--info)" />
          <Cell label="ATM skew ∂IV/∂lnK" value={m.skew.skewSlope.toFixed(3)} tone={m.skew.skewSlope < 0 ? 'var(--danger)' : 'var(--success)'} />
        </div>
      )}

      <div className="px-3.5 py-2 border-t border-[var(--border)] text-[9px] text-[var(--text-tertiary)] leading-relaxed">
        <span className="font-bold text-[var(--text-secondary)]">Inputs</span> front-expiry chain, per-strike IV (call/put blended), n={m.pts.length} ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">25Δ wings</span> interpolated at |Δ|=0.25 ·{' '}
        <span className="font-bold text-[var(--text-secondary)]">Source</span> {live ? 'live option chain' : 'model chain (off-hours)'} ·{' '}
        single real expiry — not a DTE extrapolation
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] leading-none">{label}</span>
      <span className="text-[12px] font-bold tabular-nums leading-tight" style={{ color: tone || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
