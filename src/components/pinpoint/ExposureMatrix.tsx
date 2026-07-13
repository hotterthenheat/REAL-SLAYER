import DataTable, { type DataColumn } from '../ui/terminal/DataTable';
import TerminalPanel from '../ui/terminal/TerminalPanel';

/**
 * ExposureMatrix — the per-strike GEX/DEX/VEX inventory grid from the Pinpoint
 * render, extracted as a shared component. Purely presentational over REAL rows:
 * every NET cell is heat-shaded (green var(--positive-ink) for long, red
 * var(--negative-ink) for short) with tint intensity scaled to that greek's own
 * window max, so the matrix reads as a heatmap at a glance; PUT/CALL cells wear a
 * lighter wash. The single strongest cell per greek family — the wall — is ringed
 * in the accent. All tints are color-mix over the token so they theme; no value,
 * strike, column, or scale constant is invented.
 */
export type ExposureRow = {
  strike: number;
  putGex: number;
  callGex: number;
  netGex: number;
  putDex: number;
  callDex: number;
  netDex: number;
  putVex: number;
  callVex: number;
  netVex: number;
};

type ExposureMatrixProps = {
  rows: ExposureRow[];
  spot?: number;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
};

function formatCompact(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '+';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function formatAbs(abs: number) {
  if (abs >= 1_000_000_000) return `${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`;
  return abs.toFixed(0);
}

/**
 * A single heat-shaded exposure cell. The tint is a color-mix of the tone token
 * with transparent, its percentage proportional to |value| against the family max
 * — NET reads hot, PUT/CALL wear a lighter wash. `isWall` rings the family max.
 */
function MatrixCell({
  value,
  maxAbs,
  tone,
  isWall,
}: {
  value: number;
  maxAbs: number;
  tone: 'put' | 'call' | 'net';
  isWall: boolean;
}) {
  const intensity = maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
  const base =
    tone === 'put'
      ? 'var(--negative-ink)'
      : tone === 'call'
        ? 'var(--call)'
        : value >= 0
          ? 'var(--positive-ink)'
          : 'var(--negative-ink)';
  // NET runs hotter than the PUT/CALL wash so the net column carries the read.
  const ceiling = tone === 'net' ? 42 : 20;
  const pct = (intensity * ceiling).toFixed(1);
  const text =
    tone === 'put'
      ? 'var(--negative-ink)'
      : tone === 'call'
        ? 'var(--call)'
        : value >= 0
          ? 'var(--positive-ink)'
          : 'var(--negative-ink)';
  return (
    // -my-1 -mx-2 bleeds the tint to the cell's border box (td padding is 4px 8px),
    // so the shading tiles edge-to-edge and the hairline row rules read as grid lines.
    <div
      className="slayer-num -mx-2 -my-1 px-2 py-1 text-right text-[11px]"
      style={{
        background: `color-mix(in srgb, ${base} ${pct}%, transparent)`,
        color: text,
        outline: isWall
          ? '1px solid color-mix(in srgb, var(--accent-color) 62%, transparent)'
          : undefined,
        outlineOffset: '-1px',
      }}
    >
      {formatCompact(value)}
    </div>
  );
}

/** Column header with a tiny per-column max-abs legend (the tint's 100% reference). */
function ColHeader({ label, maxAbs }: { label: string; maxAbs: number }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span>{label}</span>
      <span className="slayer-num text-[8px] font-normal normal-case tracking-normal text-[var(--text-muted)]">
        max {formatAbs(maxAbs)}
      </span>
    </div>
  );
}

export function ExposureMatrix({
  rows,
  spot,
  title = 'Exposure Matrix',
  subtitle = 'Heat-shaded inventory and sensitivity by strike',
  actions,
  footer,
}: ExposureMatrixProps) {
  // Normalize each greek family to its own window max so tints are comparable
  // within a family but never invent a cross-family scale.
  const max = {
    gex: Math.max(1e-9, ...rows.flatMap(r => [Math.abs(r.putGex), Math.abs(r.callGex), Math.abs(r.netGex)])),
    dex: Math.max(1e-9, ...rows.flatMap(r => [Math.abs(r.putDex), Math.abs(r.callDex), Math.abs(r.netDex)])),
    vex: Math.max(1e-9, ...rows.flatMap(r => [Math.abs(r.putVex), Math.abs(r.callVex), Math.abs(r.netVex)])),
  };

  // The single strongest |value| in each family is the wall — ring it in the accent.
  const isWall = (value: number, familyMax: number) =>
    familyMax > 1e-9 && Math.abs(value) === familyMax;

  // Nearest row to spot gets the accent highlight (real strikes rarely equal spot exactly).
  const nearestToSpot =
    spot == null || rows.length === 0
      ? null
      : rows.reduce((best, r) => (Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best), rows[0]).strike;

  const groupBorder = 'border-l border-[var(--border-subtle)]';

  const columns: DataColumn<ExposureRow>[] = [
    {
      id: 'strike',
      title: 'Strike',
      width: '96px',
      render: (row) => {
        const isSpot = nearestToSpot != null && row.strike === nearestToSpot;
        return (
          <div
            className="-mx-2 -my-1 flex items-center gap-1.5 px-2 py-1"
            style={{ borderLeft: `2px solid ${isSpot ? 'var(--accent-color)' : 'transparent'}` }}
          >
            <span
              className={
                isSpot
                  ? 'slayer-num font-semibold text-[var(--pin)]'
                  : 'slayer-num text-[var(--text-primary)]'
              }
            >
              {row.strike.toLocaleString('en-US')}
            </span>
            {isSpot ? (
              <span className="text-[8px] uppercase tracking-wider text-[var(--accent-color)]">spot</span>
            ) : null}
          </div>
        );
      },
    },
    { id: 'putGex', title: <ColHeader label="Put GEX" maxAbs={max.gex} />, align: 'right', render: (r) => <MatrixCell value={r.putGex} maxAbs={max.gex} tone="put" isWall={isWall(r.putGex, max.gex)} /> },
    { id: 'callGex', title: <ColHeader label="Call GEX" maxAbs={max.gex} />, align: 'right', render: (r) => <MatrixCell value={r.callGex} maxAbs={max.gex} tone="call" isWall={isWall(r.callGex, max.gex)} /> },
    { id: 'netGex', title: <ColHeader label="Net GEX" maxAbs={max.gex} />, align: 'right', render: (r) => <MatrixCell value={r.netGex} maxAbs={max.gex} tone="net" isWall={isWall(r.netGex, max.gex)} /> },
    { id: 'putDex', title: <ColHeader label="Put DEX" maxAbs={max.dex} />, align: 'right', className: groupBorder, render: (r) => <MatrixCell value={r.putDex} maxAbs={max.dex} tone="put" isWall={isWall(r.putDex, max.dex)} /> },
    { id: 'callDex', title: <ColHeader label="Call DEX" maxAbs={max.dex} />, align: 'right', render: (r) => <MatrixCell value={r.callDex} maxAbs={max.dex} tone="call" isWall={isWall(r.callDex, max.dex)} /> },
    { id: 'netDex', title: <ColHeader label="Net DEX" maxAbs={max.dex} />, align: 'right', render: (r) => <MatrixCell value={r.netDex} maxAbs={max.dex} tone="net" isWall={isWall(r.netDex, max.dex)} /> },
    { id: 'putVex', title: <ColHeader label="Put VEX" maxAbs={max.vex} />, align: 'right', className: groupBorder, render: (r) => <MatrixCell value={r.putVex} maxAbs={max.vex} tone="put" isWall={isWall(r.putVex, max.vex)} /> },
    { id: 'callVex', title: <ColHeader label="Call VEX" maxAbs={max.vex} />, align: 'right', render: (r) => <MatrixCell value={r.callVex} maxAbs={max.vex} tone="call" isWall={isWall(r.callVex, max.vex)} /> },
    { id: 'netVex', title: <ColHeader label="Net VEX" maxAbs={max.vex} />, align: 'right', render: (r) => <MatrixCell value={r.netVex} maxAbs={max.vex} tone="net" isWall={isWall(r.netVex, max.vex)} /> },
  ];

  return (
    <TerminalPanel title={title} subtitle={subtitle} actions={actions} footer={footer} padded={false}>
      <DataTable
        className="rounded-none border-0"
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.strike)}
        rowClassName={(row) =>
          nearestToSpot != null && row.strike === nearestToSpot
            ? 'bg-[color-mix(in_srgb,var(--accent-color)_9%,transparent)]'
            : undefined
        }
      />
    </TerminalPanel>
  );
}

export default ExposureMatrix;
