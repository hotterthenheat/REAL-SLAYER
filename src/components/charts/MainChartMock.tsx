import { useMemo } from 'react';

/**
 * MainChartMock — the shared lightweight SVG chart shell from the terminal
 * renders (price line over a hairline grid, with labeled dealer-level tags on
 * the right edge). Purely presentational: it draws exactly the points, levels
 * and time labels it is given — feed it real candle closes and real levels.
 * Renders no axis labels it wasn't given.
 */
export type PricePoint = { x: number; y: number };
export type ChartLevel = {
  label: string;
  value: string;
  y: number;
  tone?: 'spot' | 'call' | 'put' | 'pin' | 'flip';
};

type MainChartMockProps = {
  points: PricePoint[];
  levels?: ChartLevel[];
  timeLabels?: string[];
  height?: number;
};

const toneColor: Record<NonNullable<ChartLevel['tone']>, string> = {
  spot: 'var(--text-primary)',
  call: 'var(--call)',
  put: 'var(--negative-ink)',
  pin: 'var(--pin)',
  flip: 'var(--warning)',
};

export function MainChartMock({
  points,
  levels = [],
  timeLabels,
  height = 360,
}: MainChartMockProps) {
  const width = 960;
  const path = useMemo(() => {
    if (!points.length) return '';
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }, [points]);
  return (
    <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-shell)] p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        <defs>
          <pattern id="chart-grid" width="80" height="40" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 40" fill="none" stroke="rgba(248,248,255,0.06)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#chart-grid)" />
        {levels.map((level) => (
          <g key={`${level.label}-${level.y}`}>
            <line
              x1={0}
              x2={width}
              y1={level.y}
              y2={level.y}
              stroke={toneColor[level.tone || 'spot']}
              strokeOpacity="0.55"
              strokeWidth="1"
              strokeDasharray={level.tone === 'spot' ? '0' : '4 4'}
            />
            <foreignObject x={width - 150} y={level.y - 14} width={140} height={28}>
              <div className="slayer-num flex h-7 items-center justify-between rounded-[7px] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.85)] px-2 text-[10px] uppercase tracking-[0.14em]">
                <span style={{ color: toneColor[level.tone || 'spot'] }}>{level.label}</span>
                <span className="text-[var(--text-primary)]">{level.value}</span>
              </div>
            </foreignObject>
          </g>
        ))}
        <path
          d={path}
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth="2.25"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {timeLabels && timeLabels.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          {timeLabels.map((label, i) => (
            <span key={`${label}-${i}`} className="slayer-num">{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default MainChartMock;
