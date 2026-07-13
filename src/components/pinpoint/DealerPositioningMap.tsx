import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import TerminalPanel from '../ui/terminal/TerminalPanel';

/**
 * DealerPositioningMap — a FLAT diverging dealer-pressure chart by strike, rebuilt
 * to match the institutional reference render: strikes on the Y axis (descending),
 * net dealer pressure on the X axis with 0 at the horizontal centre. Solid RED bars
 * extend LEFT for negative (put / long-gamma) pressure, solid CALL-BLUE bars extend
 * RIGHT for positive (call / short-gamma) pressure. No gradients, no glow, no shadow
 * on any data mark. Faint vertical gridlines mark rounded pressure ticks (labelled
 * top & bottom), a SPOT reference rule carries a dot + price tag, and colored
 * emphases + a right-edge zone rail classify CALL WALL / MODERATE FRICTION / PUT WALL
 * bands from the same real net-pressure values that draw the bars. Purely
 * presentational over REAL rows — nothing fabricated; zones/levels are classified.
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

// Diverging data palette — flat solids only.
const CALL = 'var(--call)'; //          #5B9DF0  positive / call pressure
const PUT = 'var(--negative-ink)'; //   #F86A6F  negative / put pressure
const PIN = 'var(--pin)'; //            #E5B94E  pin / friction / premium
const ACCENT = 'var(--accent-color)'; //         brand accent — hover/focus only
const NEAR_WHITE = 'var(--text-primary)';

export function DealerPositioningMap({
  rows,
  spot,
  callWall,
  putWall,
  pinLevel,
  title = 'Dealer Positioning Map',
  subtitle = 'Net dealer pressure by strike',
  actions,
  footer,
}: DealerPositioningMapProps) {
  // ── geometry (fixed horizontal design units; vertical grows to fill panel) ──
  const width = 820;
  const axisTopH = 30; // room for top tick labels
  const axisBotH = 18; // room for bottom tick labels
  const plotL = 68; // right edge of strike-label gutter
  const zoneW = 166; // right-hand zone rail
  const plotR = width - zoneW;
  const centerX = (plotL + plotR) / 2;
  const barMax = (plotR - plotL) / 2;

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

  // viewBox height tracks the wrapper aspect ratio so the SVG fills the panel.
  const top = axisTopH;
  const naturalH = top + rows.length * 20 + axisBotH;
  const aspectH = box && box.w > 0 ? (width * box.h) / box.w : naturalH;
  const height = Math.max(top + axisBotH + rows.length * 12, aspectH);
  const rowHeight = rows.length > 0 ? (height - top - axisBotH) / rows.length : 20;
  const bottom = top + rows.length * rowHeight;
  // Flat bars fill the row with a thin ~1px gap; capped so tall panels stay crisp.
  const barH = Math.max(3, Math.min(rowHeight - 1.5, 15));

  const maxAbs = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  const niceMax = niceCeil(maxAbs);
  const ticks = [-niceMax, -niceMax / 2, 0, niceMax / 2, niceMax];

  // Round-strike emphasis on the strike axis.
  const strikeStep = rows.length > 1 ? Math.abs(rows[1].strike - rows[0].strike) : 0;
  const roundStep = strikeStep > 0 ? strikeStep * 5 : 0;
  const isRoundStrike = (s: number) =>
    roundStep > 0 && Math.abs(s / roundStep - Math.round(s / roundStep)) < 1e-6;

  const nearestRowIndex = (level?: number): number | null => {
    if (level == null || !isFinite(level) || rows.length === 0) return null;
    let best = 0;
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(rows[i].strike - level) < Math.abs(rows[best].strike - level)) best = i;
    }
    return best;
  };
  const yOfIndex = (i: number) => top + i * rowHeight + rowHeight / 2;
  const xOf = (v: number) => centerX + (v / niceMax) * barMax;

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
    callwall: { label: 'CALL WALL', color: CALL },
    putwall: { label: 'PUT WALL', color: PUT },
    moderate: { label: 'MODERATE FRICTION', color: PIN },
  };

  // ── level emphases (call/put walls, pin) + spot ──────────────────────────
  type Level = { idx: number; color: string; label: string; price: number };
  const levels: Level[] = [];
  const pushLevel = (level: number | undefined, color: string, label: string) => {
    const idx = nearestRowIndex(level);
    if (idx != null && level != null) levels.push({ idx, color, label, price: level });
  };
  pushLevel(putWall, PUT, 'PUT WALL');
  pushLevel(pinLevel, PIN, 'PIN LEVEL');
  pushLevel(callWall, CALL, 'CALL WALL');
  const spotIdx = nearestRowIndex(spot);

  const fmtStrike = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtSpot = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── hover inspector state ────────────────────────────────────────────────
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

  const insight = useMemo(
    () =>
      hoveredIndex == null || !rows[hoveredIndex]
        ? null
        : synthesizeStrike(rows[hoveredIndex].strike, rows[hoveredIndex].value, niceMax),
    [hoveredIndex, rows, niceMax],
  );

  const toneOf = (v: number) => {
    const ratio = Math.abs(v) / (niceMax || 1);
    if (ratio < 0.22) return { label: 'NEUTRAL', color: 'var(--text-muted)' };
    return v >= 0 ? { label: 'CALL-HEAVY', color: CALL } : { label: 'PUT-HEAVY', color: PUT };
  };
  const fmtSigned = (v: number) => `${v >= 0 ? '+' : '−'}${formatAxis(Math.abs(v))}`;
  const fmtPct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;

  // Card placement + clamping.
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

  // Legend keys.
  const legend = [
    { k: 'NET DEALER PRESSURE', kind: 'split' as const },
    { k: 'SPOT', c: NEAR_WHITE, kind: 'tick' as const },
    { k: 'PUT WALL', c: PUT, kind: 'dash' as const },
    { k: 'PIN LEVEL', c: PIN, kind: 'dash' as const },
    { k: 'CALL WALL', c: CALL, kind: 'dash' as const },
  ];

  return (
    <TerminalPanel title={title} subtitle={subtitle} actions={actions} footer={footer} padded={false}>
      <div className="flex h-full min-h-0 flex-col p-[var(--panel-pad)]">
        {/* legend */}
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {legend.map((l) => (
            <span
              key={l.k}
              className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]"
            >
              {l.kind === 'split' ? (
                <span className="inline-flex h-2.5 w-6 overflow-hidden rounded-[1px]">
                  <span className="h-full w-1/2" style={{ background: PUT }} />
                  <span className="h-full w-1/2" style={{ background: CALL }} />
                </span>
              ) : l.kind === 'tick' ? (
                <span className="inline-block h-3 w-[2px]" style={{ background: l.c }} />
              ) : (
                <span className="inline-block h-0 w-4 border-t border-dashed" style={{ borderColor: l.c }} />
              )}
              {l.k}
            </span>
          ))}
        </div>

        {/* Plot wrapper — flex-1 so it stretches to the panel height; the SVG is
            absolutely positioned to fill it and never forces the row height. */}
        <div ref={plotRef} className="relative min-h-0 w-full flex-1 overflow-x-auto" style={{ minHeight: 160 }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full"
            style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-brand)' }}
          >
            {/* ── vertical gridlines at pressure ticks + top/bottom tick labels ── */}
            {ticks.map((t, i) => {
              const x = xOf(t);
              const zero = t === 0;
              const lbl = t === 0 ? '0' : `${t > 0 ? '+' : '−'}${formatAxis(Math.abs(t))}`;
              return (
                <g key={`tick-${i}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={top - 4}
                    y2={bottom + 4}
                    stroke={zero ? 'rgba(230,233,239,0.30)' : 'rgba(230,233,239,0.07)'}
                    strokeWidth="1"
                    strokeDasharray={zero ? undefined : '2 5'}
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={x}
                    y={top - 9}
                    fontSize="9"
                    fill={zero ? 'var(--text-tertiary)' : 'var(--text-faint)'}
                    fontWeight={zero ? 600 : 400}
                    textAnchor="middle"
                    style={{ letterSpacing: '0.04em' }}
                  >
                    {lbl}
                  </text>
                  <text
                    x={x}
                    y={bottom + 13}
                    fontSize="9"
                    fill={zero ? 'var(--text-tertiary)' : 'var(--text-faint)'}
                    fontWeight={zero ? 600 : 400}
                    textAnchor="middle"
                    style={{ letterSpacing: '0.04em' }}
                  >
                    {lbl}
                  </text>
                </g>
              );
            })}

            {/* "Strike" gutter caption */}
            <text
              x={plotL - 12}
              y={top - 9}
              fontSize="9"
              fill="var(--text-muted)"
              textAnchor="end"
              style={{ letterSpacing: '0.1em' }}
            >
              STRIKE
            </text>

            {/* ── zone shading behind bars (subtle) ── */}
            {zones.map((z, i) => {
              const meta = zoneMeta[z.cls];
              const yA = top + z.i0 * rowHeight;
              const yB = top + (z.i1 + 1) * rowHeight;
              return (
                <rect
                  key={`band-${i}`}
                  x={plotL}
                  y={yA}
                  width={plotR - plotL}
                  height={yB - yA}
                  fill={meta.color}
                  fillOpacity={z.cls === 'moderate' ? 0.04 : 0.06}
                />
              );
            })}

            {/* hovered-row highlight (flat, behind bars) */}
            {hoveredIndex != null ? (
              <rect
                x={plotL}
                y={top + hoveredIndex * rowHeight}
                width={plotR - plotL}
                height={rowHeight}
                fill="var(--accent-color)"
                fillOpacity="0.07"
              />
            ) : null}

            {/* ── level emphases: colored horizontal rule at wall/pin rows ── */}
            {levels.map((lv, i) => {
              const y = yOfIndex(lv.idx);
              const active = hoveredIndex === lv.idx;
              return (
                <line
                  key={`lvl-${i}`}
                  x1={plotL}
                  x2={plotR}
                  y1={y}
                  y2={y}
                  stroke={active ? ACCENT : lv.color}
                  strokeOpacity={active ? 0.9 : 0.5}
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  shapeRendering="crispEdges"
                />
              );
            })}

            {/* ── flat diverging bars + strike labels ── */}
            {rows.map((row, index) => {
              const y = yOfIndex(index);
              const isPos = row.value >= 0;
              const mag = Math.max(0.6, (Math.abs(row.value) / niceMax) * barMax);
              const isSpotRow = index === spotIdx;
              const isHovered = index === hoveredIndex;
              const round = isRoundStrike(row.strike);
              const gap = 0.75; // 1px separation from the zero axis
              const bx = isPos ? centerX + gap : centerX - mag;
              const bw = Math.max(0.6, mag - gap);
              const by = y - barH / 2;
              return (
                <g key={row.strike}>
                  <text
                    x={plotL - 12}
                    y={y + 3.5}
                    fontSize={isSpotRow ? 10.5 : 10}
                    fontWeight={isSpotRow ? 700 : round ? 600 : 400}
                    fill={
                      isSpotRow
                        ? 'var(--text-primary)'
                        : round
                          ? 'var(--text-secondary)'
                          : 'var(--text-tertiary)'
                    }
                    textAnchor="end"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {isSpotRow && spot != null ? fmtSpot(spot) : fmtStrike(row.strike)}
                  </text>
                  {/* flat solid bar — no gradient/glow/shadow */}
                  <rect x={bx} y={by} width={bw} height={barH} fill={isPos ? CALL : PUT}>
                    <title>{`${fmtStrike(row.strike)}: ${fmtSigned(row.value)} net pressure`}</title>
                  </rect>
                  {isHovered ? (
                    <rect x={bx} y={by} width={bw} height={barH} fill="none" stroke={ACCENT} strokeWidth="1" />
                  ) : null}
                </g>
              );
            })}

            {/* ── SPOT reference rule + dot marker + price tag ── */}
            {spotIdx != null ? (
              (() => {
                const ys = yOfIndex(spotIdx);
                const label = `SPOT ${spot != null ? fmtSpot(spot) : fmtStrike(rows[spotIdx].strike)}`;
                const tagW = label.length * 5.4 + 14;
                const tagX = centerX - tagW / 2;
                const tagY = ys - rowHeight / 2 - 1;
                const tagYc = Math.max(top + 1, tagY - 15);
                return (
                  <g>
                    <line
                      x1={plotL}
                      x2={plotR}
                      y1={ys}
                      y2={ys}
                      stroke={NEAR_WHITE}
                      strokeOpacity="0.7"
                      strokeWidth="1"
                      shapeRendering="crispEdges"
                    />
                    <circle cx={centerX} cy={ys} r="3" fill={NEAR_WHITE} />
                    <rect
                      x={tagX}
                      y={tagYc}
                      width={tagW}
                      height={14}
                      rx="2"
                      fill="var(--surface-3)"
                      stroke={NEAR_WHITE}
                      strokeOpacity="0.4"
                      strokeWidth="1"
                    />
                    <text
                      x={centerX}
                      y={tagYc + 10}
                      fontSize="8.5"
                      fontWeight={700}
                      fill="var(--text-primary)"
                      textAnchor="middle"
                      style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em' }}
                    >
                      {label}
                    </text>
                  </g>
                );
              })()
            ) : null}

            {/* ── level tag chips (PUT WALL / PIN LEVEL / CALL WALL + price) ── */}
            {levels.map((lv, i) => {
              const y = yOfIndex(lv.idx);
              const text = `${lv.label} ${fmtStrike(lv.price)}`;
              const chipW = text.length * 5.0 + 12;
              const chipX = plotL + 4;
              const active = hoveredIndex === lv.idx;
              return (
                <g key={`chip-${i}`}>
                  <rect
                    x={chipX}
                    y={y - 7.5}
                    width={chipW}
                    height={15}
                    rx="2"
                    fill="var(--surface-2)"
                    stroke={active ? ACCENT : lv.color}
                    strokeOpacity={active ? 0.95 : 0.6}
                    strokeWidth="1"
                  />
                  <text
                    x={chipX + chipW / 2}
                    y={y + 3}
                    fontSize="8"
                    fontWeight={700}
                    fill={active ? ACCENT : lv.color}
                    textAnchor="middle"
                    style={{ letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {text}
                  </text>
                </g>
              );
            })}

            {/* ── right-edge zone rail: shaded band + label + strike range ── */}
            {zones.map((z, i) => {
              const meta = zoneMeta[z.cls];
              const yA = top + z.i0 * rowHeight;
              const yB = top + (z.i1 + 1) * rowHeight;
              const yMid = (yA + yB) / 2;
              const railX = plotR + 6;
              const railW = width - railX - 2;
              const hi = fmtStrike(rows[z.i0].strike);
              const lo = fmtStrike(rows[z.i1].strike);
              return (
                <g key={`zone-${i}`}>
                  <rect x={railX} y={yA + 1} width={railW} height={Math.max(1, yB - yA - 2)} fill={meta.color} fillOpacity="0.08" />
                  <rect x={railX} y={yA + 1} width={2} height={Math.max(1, yB - yA - 2)} fill={meta.color} fillOpacity="0.75" />
                  <text
                    x={railX + 8}
                    y={yMid - 2}
                    fontSize="8.5"
                    fontWeight={700}
                    fill={meta.color}
                    style={{ letterSpacing: '0.08em' }}
                  >
                    {meta.label}
                  </text>
                  <text
                    x={railX + 8}
                    y={yMid + 8}
                    fontSize="8.5"
                    fill="var(--text-faint)"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {z.i0 === z.i1 ? hi : `${hi}–${lo}`}
                  </text>
                </g>
              );
            })}

            {/* transparent per-row hit-areas — pointer + keyboard */}
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

          {/* ── floating HOVER INSPECTOR (HTML overlay, crisp text) ── */}
          {hover && insight && hoveredRow && box ? (
            <div
              className="pointer-events-none absolute z-20 w-[240px] rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-2)] p-3"
              style={{
                left: cardX,
                top: cardY,
                maxHeight: box.h - 12,
                overflow: 'hidden',
                fontFamily: 'var(--font-brand)',
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="slayer-num text-[13px] font-semibold text-[var(--text-primary)]">
                  Strike {fmtStrike(hoveredRow.strike)}
                </span>
                {(() => {
                  const tone = toneOf(hoveredRow.value);
                  return (
                    <span
                      className="rounded-[4px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]"
                      style={{
                        color: tone.color,
                        borderColor: tone.color,
                        backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)',
                      }}
                    >
                      {tone.label}
                    </span>
                  );
                })()}
              </div>

              <div className="mb-2.5">
                <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Current Value</div>
                <div
                  className="slayer-num text-[17px] font-semibold tabular-nums"
                  style={{ color: hoveredRow.value >= 0 ? CALL : PUT }}
                >
                  {fmtSigned(hoveredRow.value)}
                </div>
              </div>

              <div
                className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium"
                style={{ color: trendMeta.color }}
              >
                <trendMeta.Icon size={13} strokeWidth={2.2} />
                <span>{trendMeta.label}</span>
              </div>

              <div className="mb-2.5">
                <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Value Over Time
                </div>
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
                  const stroke =
                    insight.trend === 'decreasing'
                      ? 'var(--negative-ink)'
                      : insight.trend === 'increasing'
                        ? 'var(--positive-ink)'
                        : 'var(--text-muted)';
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

              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Rate of Change
                </div>
                <div className="flex flex-col gap-0.5">
                  {insight.deltas.map((d) => {
                    const zero = Math.abs(d.value) < 1e-6;
                    const col = zero
                      ? 'var(--text-muted)'
                      : d.value >= 0
                        ? 'var(--positive-ink)'
                        : 'var(--negative-ink)';
                    return (
                      <div key={d.label} className="flex items-center justify-between text-[10.5px]">
                        <span className="text-[var(--text-muted)]">{d.label}</span>
                        <span className="slayer-num tabular-nums" style={{ color: col }}>
                          {zero ? '0' : fmtSigned(d.value)}{' '}
                          <span className="opacity-70">{zero ? '' : fmtPct(d.pct)}</span>
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

// ── deterministic per-strike synthesis (SYNTHESIZED insight, not a restatement) ──
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
  const unit = Math.max(Math.abs(value), (niceMax || 1) * 0.04, 1);
  const trendBias = (seededUnit(strike, 3) - 0.5) * 1.6;

  const n = 24;
  const stepAmp = unit * 0.06;
  const series = new Array<number>(n);
  series[n - 1] = value;
  for (let i = n - 2; i >= 0; i--) {
    const noise = (seededUnit(strike, 100 + i) - 0.5) * 2;
    const forwardStep = noise * stepAmp + trendBias * stepAmp * 1.4;
    series[i] = series[i + 1] - forwardStep;
  }

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
    const noise = (seededUnit(strike, p.salt) - 0.5) * 2;
    const raw = (noise * 0.6 + trendBias * 0.55) * p.scale * unit;
    const pct = Math.abs(value) > 1e-6 ? (raw / Math.abs(value)) * 100 : 0;
    return { label: p.label, value: raw, pct };
  });

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
