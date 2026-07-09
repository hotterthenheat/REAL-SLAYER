import { useLayoutEffect, useRef, useState } from 'react';
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
        <div ref={plotRef} className="relative min-h-0 w-full flex-1">
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
        </svg>
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

function formatAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`;
  return abs.toFixed(0);
}

export default DealerPositioningMap;
