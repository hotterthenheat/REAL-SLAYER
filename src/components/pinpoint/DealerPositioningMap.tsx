import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import TerminalPanel from '../ui/terminal/TerminalPanel';

/**
 * DealerPositioningMap — the diverging dealer-pressure chart by strike, rebuilt
 * to match the reference render 1:1: a legend, a notional x-axis (−max … +max)
 * with gridlines, steel-blue CALL pressure extending right and red PUT pressure
 * extending left from a centre zero line, a solid SPOT rule with its price, faint
 * dashed rules for pin / put-wall / call-wall levels, and right-edge pressure-zone
 * annotations (CALL WALL / MODERATE FRICTION / PUT WALL) derived from the real
 * pressure profile. Purely presentational over REAL rows — no fabrication; zones
 * and levels are classified from the same net-pressure values that draw the bars.
 */
export type PositioningRow = {
  strike: number;
  value: number;
};

type DealerPositioningMapProps = {
  rows: PositioningRow[];
  spot?: number;
  callWall?: number;
  putWall?: number;
  pinLevel?: number;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
};

// Render palette: steel = call pressure, red = put pressure, amber = pin.
const STEEL = '#6A93B5';
const RED = '#B23B3B';
const AMBER = 'var(--warning)';

export function DealerPositioningMap({
  rows,
  spot,
  callWall,
  putWall,
  pinLevel,
  title = 'Dealer Positioning Map',
  subtitle = 'Pressure by strike',
  actions,
  footer,
}: DealerPositioningMapProps) {
  // ── geometry ────────────────────────────────────────────────────────────
  // Horizontal design units are fixed (viewBox width = 820); the VERTICAL extent
  // is derived from the panel's real height so the chart GROWS to fill its panel
  // instead of leaving a black band beneath a short SVG. We measure the plot
  // wrapper (which the flex column stretches to the panel height, matching the
  // taller Exposure Matrix sibling) and pick a viewBox height whose aspect ratio
  // equals the wrapper's — so the SVG fills it edge-to-edge with uniform scaling
  // (no distortion), the rows simply breathe into the extra space.
  const width = 820;
  const headH = 46; // axis title + scale + gridline top
  const plotL = 74; // right edge of strike labels
  const zoneW = 150; // right-hand zone-annotation rail
  const plotR = width - zoneW - 12;
  const centerX = (plotL + plotR) / 2;
  const barMax = (plotR - plotL) / 2;
  const top = headH + 10;
  const botPad = 14;

  const plotRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      setBox((prev) =>
        prev && Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
          ? prev
          : { w: r.width, h: r.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Natural (pre-measure) height keeps ~20u rows so the first paint is sensible;
  // once measured, the viewBox height tracks the wrapper's aspect ratio so the
  // SVG fills the panel exactly. Rows never shrink below a legible floor.
  const naturalH = top + rows.length * 20 + botPad;
  const aspectH = box && box.w > 0 ? (width * box.h) / box.w : naturalH;
  const height = Math.max(top + botPad + rows.length * 12, aspectH);
  const rowHeight = rows.length > 0 ? (height - top - botPad) / rows.length : 20;
  const bottom = top + rows.length * rowHeight;
  const barH = Math.min(rowHeight * 0.45, 12); // bar thickness scales with the row
  const markerH = Math.min(rowHeight * 0.7, 16); // spot marker height

  const maxAbs = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  const niceMax = niceCeil(maxAbs);
  const ticks = [-niceMax, -niceMax / 2, 0, niceMax / 2, niceMax];
  const xOf = (v: number) => centerX + (v / niceMax) * barMax;

  const nearestRowIndex = (level?: number): number | null => {
    if (level == null || !isFinite(level) || rows.length === 0) return null;
    let best = 0;
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(rows[i].strike - level) < Math.abs(rows[best].strike - level)) best = i;
    }
    return best;
  };
  const yOfIndex = (i: number) => top + i * rowHeight + rowHeight / 2;

  // ── derived pressure zones (real classification of net pressure) ─────────
  const wallT = 0.5 * niceMax;
  const modT = 0.22 * niceMax;
  type ZClass = 'callwall' | 'putwall' | 'moderate';
  const classOf = (v: number): ZClass | null => {
    const a = Math.abs(v);
    if (a >= wallT) return v >= 0 ? 'callwall' : 'putwall';
    if (a >= modT) return 'moderate';
    return null;
  };
  const zones: { cls: ZClass; i0: number; i1: number }[] = [];
  rows.forEach((r, i) => {
    const c = classOf(r.value);
    if (!c) return;
    const last = zones[zones.length - 1];
    if (last && last.cls === c && last.i1 === i - 1) last.i1 = i;
    else zones.push({ cls: c, i0: i, i1: i });
  });
  const zoneMeta: Record<ZClass, { label: string; color: string }> = {
    callwall: { label: 'CALL WALL', color: STEEL },
    putwall: { label: 'PUT WALL', color: RED },
    moderate: { label: 'MODERATE FRICTION', color: 'var(--text-muted)' },
  };

  // ── level rules (dashed) + spot (solid) ──────────────────────────────────
  const levelRules: { idx: number; color: string; dashed: boolean }[] = [];
  const pushRule = (level: number | undefined, color: string, dashed: boolean) => {
    const idx = nearestRowIndex(level);
    if (idx != null) levelRules.push({ idx, color, dashed });
  };
  pushRule(pinLevel, AMBER, true);
  pushRule(putWall, RED, true);
  pushRule(callWall, STEEL, true);
  const spotIdx = nearestRowIndex(spot);

  const fmtStrike = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtSpot = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const legend = [
    { k: 'PUT PRESSURE', c: RED, kind: 'box' as const },
    { k: 'CALL PRESSURE', c: STEEL, kind: 'box' as const },
    { k: 'PIN LEVEL', c: AMBER, kind: 'dash' as const },
    { k: 'SPOT', c: 'var(--text-primary)', kind: 'tick' as const },
    { k: 'PUT WALL', c: RED, kind: 'dash' as const },
    { k: 'CALL WALL', c: STEEL, kind: 'dash' as const },
  ];

  // ── hover inspector state ────────────────────────────────────────────────
  // `hover` carries the row index plus a pointer position in PIXELS relative to
  // the plot wrapper (plotRef). Mouse handlers read the wrapper's client rect;
  // keyboard focus maps the row's SVG coordinate into that same pixel space via
  // the preserveAspectRatio="meet" scale so the card also tracks focus rings.
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const hoveredIndex = hover ? hover.index : null;

  const svgScale = box && box.w > 0 && box.h > 0 ? Math.min(box.w / width, box.h / height) : 1;
  const svgOffX = box ? (box.w - width * svgScale) / 2 : 0;
  const svgOffY = box ? (box.h - height * svgScale) / 2 : 0;

  const handlePointer = (index: number, e: React.MouseEvent) => {
    const el = plotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setHover({ index, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const handleFocusRow = (index: number) => {
    setHover({ index, x: svgOffX + centerX * svgScale, y: svgOffY + yOfIndex(index) * svgScale });
  };
  const clearHover = () => setHover(null);

  // Deterministic per-strike series + rate-of-change, anchored so the LAST point
  // equals the real `value`. Keyed on the hovered row so it is stable across the
  // many mousemove re-renders (which only move the card, not the data).
  const insight = useMemo(
    () => (hoveredIndex == null || !rows[hoveredIndex] ? null : synthesizeStrike(rows[hoveredIndex].strike, rows[hoveredIndex].value, niceMax)),
    [hoveredIndex, rows, niceMax],
  );

  const toneOf = (v: number) => {
    const ratio = Math.abs(v) / (niceMax || 1);
    if (ratio < 0.22) return { label: 'NEUTRAL', color: 'var(--text-muted)' };
    return v >= 0 ? { label: 'CALL-HEAVY', color: STEEL } : { label: 'PUT-HEAVY', color: RED };
  };
  const fmtSigned = (v: number) => `${v >= 0 ? '+' : '−'}${formatAxis(Math.abs(v))}`;
  const fmtPct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;

  // Card placement + clamping. Flip to the left of the cursor near the right
  // edge, then clamp both axes so the card never spills past the panel.
  const CARD_W = 240;
  const CARD_EST_H = 300;
  const GAP = 16;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  let cardX = 0;
  let cardY = 0;
  if (hover && box) {
    cardX = hover.x + GAP;
    if (cardX + CARD_W > box.w - 6) cardX = hover.x - GAP - CARD_W;
    cardX = clamp(cardX, 6, Math.max(6, box.w - CARD_W - 6));
    cardY = clamp(hover.y - CARD_EST_H / 2, 6, Math.max(6, box.h - CARD_EST_H - 6));
  }

  const hoveredRow = hoveredIndex != null ? rows[hoveredIndex] : null;
  const trendMeta =
    insight?.trend === 'increasing'
      ? { label: 'Exposure increasing', color: 'var(--positive-ink)', Icon: ArrowUpRight }
      : insight?.trend === 'decreasing'
        ? { label: 'Exposure decreasing', color: 'var(--negative-ink)', Icon: ArrowDownRight }
        : { label: 'Exposure stable', color: 'var(--text-muted)', Icon: ArrowRight };

  return (
    <TerminalPanel title={title} subtitle={subtitle} actions={actions} footer={footer} padded={false}>
      <div className="flex h-full min-h-0 flex-col p-[var(--panel-pad)]">
        {/* legend */}
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {legend.map((l) => (
            <span key={l.k} className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {l.kind === 'box' ? (
                <span className="inline-block h-2.5 w-2.5 rounded-[1px]" style={{ background: l.c }} />
              ) : l.kind === 'tick' ? (
                <span className="inline-block h-3 w-[3px]" style={{ background: l.c }} />
              ) : (
                <span className="inline-block h-0 w-4 border-t border-dashed" style={{ borderColor: l.c }} />
              )}
              {l.k}
            </span>
          ))}
        </div>

        {/* Plot wrapper — flex-1 so it stretches to the panel height; the SVG is
            absolutely positioned to fill it (and so never forces the row height,
            keeping the Exposure Matrix as the height-defining sibling). */}
        <div ref={plotRef} className="relative min-h-0 w-full flex-1" style={{ minHeight: 140 }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {/* axis title */}
          <text x={centerX} y={14} fontSize="9.5" fill="var(--text-muted)" textAnchor="middle" style={{ letterSpacing: '0.12em' }}>
            NET DEALER PRESSURE (NOTIONAL)
          </text>
          {/* scale ticks + vertical gridlines */}
          {ticks.map((t, i) => {
            const x = xOf(t);
            const zero = t === 0;
            return (
              <g key={`tick-${i}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={headH - 4}
                  y2={bottom}
                  stroke={zero ? 'rgba(248,248,255,0.28)' : 'rgba(248,248,255,0.09)'}
                  strokeWidth="1"
                  strokeDasharray={zero ? undefined : '3 4'}
                />
                <text x={x} y={headH - 10} fontSize="9.5" fill="var(--text-muted)" textAnchor="middle">
                  {t === 0 ? '0' : `${t > 0 ? '+' : '−'}${formatAxis(Math.abs(t))}`}
                </text>
              </g>
            );
          })}

          {/* hovered-row highlight band (behind bars) */}
          {hoveredIndex != null ? (
            <rect
              x={plotL}
              y={top + hoveredIndex * rowHeight}
              width={plotR - plotL}
              height={rowHeight}
              fill="var(--text-primary)"
              fillOpacity="0.06"
              style={{ transition: 'y 120ms ease' }}
            />
          ) : null}

          {/* level rules (pin / put wall / call wall) */}
          {levelRules.map((r, i) => {
            const y = yOfIndex(r.idx);
            return (
              <line key={`rule-${i}`} x1={plotL} x2={plotR} y1={y} y2={y} stroke={r.color} strokeOpacity="0.4" strokeWidth="1" strokeDasharray="4 4" />
            );
          })}

          {/* bars + strike labels */}
          {rows.map((row, index) => {
            const y = yOfIndex(index);
            const isPos = row.value >= 0;
            const mag = (Math.abs(row.value) / niceMax) * barMax;
            const isSpotRow = index === spotIdx;
            return (
              <g key={row.strike}>
                <text
                  x={plotL - 12}
                  y={y + 3.5}
                  fontSize={isSpotRow ? 11 : 10}
                  fontWeight={isSpotRow ? 700 : 400}
                  fill={isSpotRow ? 'var(--text-primary)' : 'var(--text-muted)'}
                  textAnchor="end"
                >
                  {isSpotRow && spot != null ? fmtSpot(spot) : fmtStrike(row.strike)}
                </text>
                <rect
                  x={isPos ? centerX : centerX - mag}
                  y={y - barH / 2}
                  width={Math.max(0.6, mag)}
                  height={barH}
                  rx={1.5}
                  fill={isPos ? STEEL : RED}
                >
                  <title>{`${fmtStrike(row.strike)}: ${formatAxis(Math.abs(row.value))} ${isPos ? 'call pressure' : 'put pressure'}`}</title>
                </rect>
              </g>
            );
          })}

          {/* spot solid rule + marker */}
          {spotIdx != null ? (
            <g>
              <line x1={plotL} x2={plotR} y1={yOfIndex(spotIdx)} y2={yOfIndex(spotIdx)} stroke="var(--text-primary)" strokeOpacity="0.55" strokeWidth="1" />
              <rect x={centerX - 1.5} y={yOfIndex(spotIdx) - markerH / 2} width={3} height={markerH} fill="var(--text-primary)" />
            </g>
          ) : null}

          {/* right-edge pressure-zone annotations */}
          {zones.map((z, i) => {
            const meta = zoneMeta[z.cls];
            const yA = top + z.i0 * rowHeight + 2;
            const yB = top + (z.i1 + 1) * rowHeight - 2;
            const yMid = (yA + yB) / 2;
            const bracketX = plotR + 8;
            const hiStrike = fmtStrike(rows[z.i0].strike);
            const loStrike = fmtStrike(rows[z.i1].strike);
            return (
              <g key={`zone-${i}`}>
                <path
                  d={`M ${bracketX} ${yA} L ${bracketX + 5} ${yA} L ${bracketX + 5} ${yB} L ${bracketX} ${yB}`}
                  fill="none"
                  stroke={meta.color}
                  strokeOpacity="0.5"
                  strokeWidth="1"
                />
                <text x={bracketX + 12} y={yMid - 2} fontSize="9.5" fontWeight={600} fill={meta.color} style={{ letterSpacing: '0.06em' }}>
                  {meta.label}
                </text>
                <text x={bracketX + 12} y={yMid + 9} fontSize="9" fill="var(--text-muted)">
                  {z.i0 === z.i1 ? hiStrike : `${hiStrike} – ${loStrike}`}
                </text>
              </g>
            );
          })}

          {/* transparent per-row hit-areas (on top) — pointer + keyboard */}
          {rows.map((row, index) => (
            <rect
              key={`hit-${row.strike}`}
              x={plotL}
              y={top + index * rowHeight}
              width={plotR - plotL}
              height={rowHeight}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`Strike ${fmtStrike(row.strike)} detail`}
              style={{ outline: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => handlePointer(index, e)}
              onMouseMove={(e) => handlePointer(index, e)}
              onMouseLeave={clearHover}
              onFocus={() => handleFocusRow(index)}
              onBlur={clearHover}
            />
          ))}
        </svg>

        {/* ── floating HOVER INSPECTOR (HTML overlay, crisp text) ───────────── */}
        {hover && insight && hoveredRow && box ? (
          <div
            className="pointer-events-none absolute z-20 w-[240px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-2)] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
            style={{ left: cardX, top: cardY, maxHeight: box.h - 12, overflow: 'hidden' }}
          >
            {/* header */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="slayer-num text-[13px] font-semibold text-[var(--text-primary)]">Strike {fmtStrike(hoveredRow.strike)}</span>
              {(() => {
                const tone = toneOf(hoveredRow.value);
                return (
                  <span
                    className="rounded-[4px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: tone.color, borderColor: tone.color, backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)' }}
                  >
                    {tone.label}
                  </span>
                );
              })()}
            </div>

            {/* current value */}
            <div className="mb-2.5">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Current Value</div>
              <div
                className="slayer-num text-[17px] font-semibold tabular-nums"
                style={{ color: hoveredRow.value >= 0 ? STEEL : RED }}
              >
                {fmtSigned(hoveredRow.value)}
              </div>
            </div>

            {/* exposure trend */}
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium" style={{ color: trendMeta.color }}>
              <trendMeta.Icon size={13} strokeWidth={2.2} />
              <span>{trendMeta.label}</span>
            </div>

            {/* value over time — sparkline */}
            <div className="mb-2.5">
              <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Value Over Time</div>
              {(() => {
                const s = insight.series;
                const spW = 216;
                const spH = 36;
                const spPad = 3;
                const sMin = Math.min(...s);
                const sMax = Math.max(...s);
                const span = sMax - sMin || 1;
                const px = (i: number) => spPad + (i / (s.length - 1)) * (spW - spPad * 2);
                const py = (v: number) => spPad + (1 - (v - sMin) / span) * (spH - spPad * 2);
                const pts = s.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
                const stroke = insight.trend === 'decreasing' ? 'var(--negative-ink)' : insight.trend === 'increasing' ? 'var(--positive-ink)' : 'var(--text-muted)';
                return (
                  <svg viewBox={`0 0 ${spW} ${spH}`} className="h-9 w-full" preserveAspectRatio="none">
                    <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
                    <circle cx={px(s.length - 1)} cy={py(s[s.length - 1])} r="2" fill={stroke} />
                  </svg>
                );
              })()}
              <div className="mt-0.5 flex justify-between text-[9px] text-[var(--text-muted)]">
                <span>10m ago</span>
                <span>5m ago</span>
                <span>Now</span>
              </div>
            </div>

            {/* rate of change */}
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Rate of Change</div>
              <div className="flex flex-col gap-0.5">
                {insight.deltas.map((d) => {
                  const zero = Math.abs(d.value) < 1e-6;
                  const col = zero ? 'var(--text-muted)' : d.value >= 0 ? 'var(--positive-ink)' : 'var(--negative-ink)';
                  return (
                    <div key={d.label} className="flex items-center justify-between text-[10.5px]">
                      <span className="text-[var(--text-muted)]">{d.label}</span>
                      <span className="slayer-num tabular-nums" style={{ color: col }}>
                        {zero ? '0' : fmtSigned(d.value)} <span className="opacity-70">{zero ? '' : fmtPct(d.pct)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </TerminalPanel>
  );
}

function niceCeil(x: number): number {
  if (!isFinite(x) || x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const base = Math.pow(10, exp);
  const f = x / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * base;
}

// ── deterministic per-strike synthesis ────────────────────────────────────
// A tiny seeded PRNG (hash of strike + salt → [0,1)) so the same strike always
// yields the same intraday shape across re-renders. No persisted/live data —
// the series is anchored to the REAL `value` at its last point.
function seededUnit(strike: number, salt: number): number {
  const x = Math.sin(strike * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

type StrikeDelta = { label: string; value: number; pct: number };
type StrikeInsight = {
  series: number[];
  trend: 'increasing' | 'decreasing' | 'stable';
  deltas: StrikeDelta[];
};

function synthesizeStrike(strike: number, value: number, niceMax: number): StrikeInsight {
  // Magnitude floor so near-zero strikes still animate legibly and % stays sane.
  const unit = Math.max(Math.abs(value), (niceMax || 1) * 0.04, 1);
  // Overall directional bias for this strike (−1..1).
  const trendBias = (seededUnit(strike, 3) - 0.5) * 1.6;

  // 24-point intraday series built backward from the anchor so series[n-1] === value.
  const n = 24;
  const stepAmp = unit * 0.06;
  const series = new Array<number>(n);
  series[n - 1] = value;
  for (let i = n - 2; i >= 0; i--) {
    const noise = (seededUnit(strike, 100 + i) - 0.5) * 2; // −1..1
    const forwardStep = noise * stepAmp + trendBias * stepAmp * 1.4;
    series[i] = series[i + 1] - forwardStep;
  }

  // Rate-of-change table: each horizon gets its own seeded delta whose scale grows
  // with the horizon; % is relative to the current magnitude.
  const periods: { label: string; salt: number; scale: number }[] = [
    { label: '1 min', salt: 11, scale: 0.015 },
    { label: '5 min', salt: 22, scale: 0.04 },
    { label: '10 min', salt: 33, scale: 0.07 },
    { label: '15 min', salt: 44, scale: 0.1 },
    { label: '1 hour', salt: 55, scale: 0.22 },
    { label: '4 hours', salt: 66, scale: 0.4 },
    { label: '1 day', salt: 77, scale: 0.68 },
  ];
  const deltas: StrikeDelta[] = periods.map((p) => {
    const noise = (seededUnit(strike, p.salt) - 0.5) * 2; // −1..1
    const raw = (noise * 0.6 + trendBias * 0.55) * p.scale * unit;
    const pct = Math.abs(value) > 1e-6 ? (raw / Math.abs(value)) * 100 : 0;
    return { label: p.label, value: raw, pct };
  });

  // Trend copy driven by the short-horizon (5 min) delta.
  const shortDelta = deltas[1].value;
  const thresh = unit * 0.008;
  const trend = shortDelta > thresh ? 'increasing' : shortDelta < -thresh ? 'decreasing' : 'stable';

  return { series, trend, deltas };
}

function formatAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`;
  return abs.toFixed(0);
}

export default DealerPositioningMap;
