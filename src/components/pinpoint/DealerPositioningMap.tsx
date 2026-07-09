import TerminalPanel from '../ui/terminal/TerminalPanel';

/**
 * DealerPositioningMap — the render's diverging dealer-pressure chart by strike,
 * extracted as a dependency-light SVG component. Purely presentational over REAL
 * rows: positive net pressure (dealer short gamma) extends right in pin teal,
 * negative (dealer long gamma) extends left in brand red. Level references
 * (spot / walls / pin) draw as horizontal dashed rules at their NEAREST strike
 * row — levels are real prices, so they snap to the closest row rather than
 * requiring an exact match; co-located levels merge into one label.
 */
export type PositioningRow = {
  strike: number;
  value: number;
};

type LevelRef = { label: string; value: number; color: string };

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
  const width = 800;
  const rowHeight = 28;
  const top = 30;
  const height = rows.length * rowHeight + 60;
  const centerX = 384;
  const barMax = 232;
  // Reserved right-hand gutter so level tags render as a clean vertical rail and
  // are never clipped by the plot edge. Dashed rules stop just before the rail.
  const labelW = 158;
  const labelX = width - labelW - 6;
  const lineStart = 118;
  const lineEnd = labelX - 8;
  const maxAbs = Math.max(1e-9, ...rows.map((row) => Math.abs(row.value)));

  const nearestRowIndex = (level?: number): number | null => {
    if (level == null || !isFinite(level) || rows.length === 0) return null;
    let best = 0;
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(rows[i].strike - level) < Math.abs(rows[best].strike - level)) best = i;
    }
    return best;
  };

  // Build refs, merging levels that land on the same row so labels never stack.
  const rawRefs: LevelRef[] = [];
  if (putWall != null) rawRefs.push({ label: 'PUT WALL', value: putWall, color: 'var(--negative-ink)' });
  if (pinLevel != null) rawRefs.push({ label: 'PIN', value: pinLevel, color: 'var(--pin)' });
  if (callWall != null) rawRefs.push({ label: 'CALL WALL', value: callWall, color: 'var(--call)' });
  if (spot != null) rawRefs.push({ label: 'SPOT', value: spot, color: 'var(--text-primary)' });
  const byRow = new Map<number, LevelRef[]>();
  for (const ref of rawRefs) {
    const idx = nearestRowIndex(ref.value);
    if (idx == null) continue;
    byRow.set(idx, [...(byRow.get(idx) ?? []), ref]);
  }

  const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

  return (
    <TerminalPanel title={title} subtitle={subtitle} actions={actions} footer={footer} padded={false}>
      <div className="p-[var(--panel-pad)]">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
          {/* zero axis */}
          <line x1={centerX} x2={centerX} y1={10} y2={height - 30} stroke="rgba(248,248,255,0.24)" strokeWidth="1" />
          {/* scale labels */}
          <text x={centerX - barMax} y={height - 12} fontSize="10" fill="var(--text-muted)" textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>
            -{formatAxis(maxAbs)}
          </text>
          <text x={centerX} y={height - 12} fontSize="10" fill="var(--text-muted)" textAnchor="middle">0</text>
          <text x={centerX + barMax} y={height - 12} fontSize="10" fill="var(--text-muted)" textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>
            +{formatAxis(maxAbs)}
          </text>
          {rows.map((row, index) => {
            const y = top + index * rowHeight;
            const magnitude = (Math.abs(row.value) / maxAbs) * barMax;
            const isPositive = row.value >= 0;
            return (
              <g key={row.strike}>
                <text x={20} y={y + 4} fontSize="11" fill="var(--text-secondary)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(row.strike)}
                </text>
                <line x1={lineStart} x2={lineEnd} y1={y} y2={y} stroke="rgba(248,248,255,0.05)" strokeWidth="1" />
                <rect
                  x={isPositive ? centerX : centerX - magnitude}
                  y={y - 6}
                  width={Math.max(1, magnitude)}
                  height={12}
                  rx={6}
                  fill={isPositive ? 'var(--pin)' : 'var(--negative)'}
                >
                  <title>{`${fmt(row.strike)}: ${formatAxis(Math.abs(row.value))} ${isPositive ? 'short-gamma supply' : 'long-gamma support'}`}</title>
                </rect>
              </g>
            );
          })}
          {[...byRow.entries()].map(([idx, refs]) => {
            const y = top + idx * rowHeight;
            const label = refs.map((r) => r.label).join(' · ');
            const value = fmt(refs[0].value);
            const color = refs[0].color;
            return (
              <g key={`ref-${idx}`}>
                <line x1={lineStart} x2={lineEnd} y1={y} y2={y} stroke={color} strokeOpacity="0.7" strokeWidth="1" strokeDasharray="4 4" />
                <foreignObject x={labelX} y={y - 15} width={labelW} height={30}>
                  <div
                    className="slayer-level-tag flex flex-col justify-center whitespace-nowrap leading-tight"
                    style={{ color, borderColor: color, paddingTop: 3, paddingBottom: 3 }}
                  >
                    <span className="font-semibold">{label}</span>
                    <span className="slayer-num text-[var(--text-primary)]">{value}</span>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
        <div className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
          <span className="text-[var(--pin)]">Positive</span> = Dealer short gamma (upside supply) ·{' '}
          <span className="text-[var(--negative-ink)]">Negative</span> = Dealer long gamma (downside support)
        </div>
      </div>
    </TerminalPanel>
  );
}

function formatAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`;
  return abs.toFixed(0);
}

export default DealerPositioningMap;
