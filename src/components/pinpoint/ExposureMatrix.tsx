import DataTable, { type DataColumn } from '../ui/terminal/DataTable';
import TerminalPanel from '../ui/terminal/TerminalPanel';

/**
 * ExposureMatrix — the per-strike GEX/DEX/VEX inventory table from the Pinpoint
 * render, extracted as a shared component. Purely presentational over REAL rows:
 * puts wear the brand red, calls the call purple, nets by sign; each cell carries
 * a proportional magnitude bar normalized to the window's own max per greek
 * (data-driven — no fixed scale constants).
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

function MatrixValue({
  value,
  maxAbs,
  tone,
}: {
  value: number;
  maxAbs: number;
  tone: 'put' | 'call' | 'net';
}) {
  const width = `${maxAbs > 0 ? Math.min(100, (Math.abs(value) / maxAbs) * 100) : 0}%`;
  const color =
    tone === 'put'
      ? 'var(--negative-ink)'
      : tone === 'call'
        ? 'var(--call)'
        : value >= 0
          ? 'var(--positive-ink)'
          : 'var(--negative-ink)';
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="slayer-num text-[11px]" style={{ color }}>
        {formatCompact(value)}
      </span>
      <div className="h-1.5 w-full rounded-full bg-[rgba(248,248,255,0.05)]">
        <div className="h-1.5 rounded-full" style={{ width, background: color }} />
      </div>
    </div>
  );
}

export function ExposureMatrix({
  rows,
  spot,
  title = 'Exposure Matrix',
  subtitle = 'Inventory and sensitivity by strike',
  actions,
  footer,
}: ExposureMatrixProps) {
  // Normalize each greek family to its own window max so bars are comparable
  // within a family but never invent a cross-family scale.
  const max = {
    gex: Math.max(1e-9, ...rows.flatMap(r => [Math.abs(r.putGex), Math.abs(r.callGex), Math.abs(r.netGex)])),
    dex: Math.max(1e-9, ...rows.flatMap(r => [Math.abs(r.putDex), Math.abs(r.callDex), Math.abs(r.netDex)])),
    vex: Math.max(1e-9, ...rows.flatMap(r => [Math.abs(r.putVex), Math.abs(r.callVex), Math.abs(r.netVex)])),
  };

  const columns: DataColumn<ExposureRow>[] = [
    {
      id: 'strike',
      title: 'Strike',
      width: '92px',
      render: (row) => (
        <span
          className={
            spot != null && row.strike === spot
              ? 'slayer-num text-[var(--pin)]'
              : 'slayer-num text-[var(--text-primary)]'
          }
        >
          {row.strike.toLocaleString('en-US')}
        </span>
      ),
    },
    { id: 'putGex', title: 'Put GEX', align: 'right', render: (r) => <MatrixValue value={r.putGex} maxAbs={max.gex} tone="put" /> },
    { id: 'callGex', title: 'Call GEX', align: 'right', render: (r) => <MatrixValue value={r.callGex} maxAbs={max.gex} tone="call" /> },
    { id: 'netGex', title: 'Net GEX', align: 'right', render: (r) => <MatrixValue value={r.netGex} maxAbs={max.gex} tone="net" /> },
    { id: 'putDex', title: 'Put DEX', align: 'right', render: (r) => <MatrixValue value={r.putDex} maxAbs={max.dex} tone="put" /> },
    { id: 'callDex', title: 'Call DEX', align: 'right', render: (r) => <MatrixValue value={r.callDex} maxAbs={max.dex} tone="call" /> },
    { id: 'netDex', title: 'Net DEX', align: 'right', render: (r) => <MatrixValue value={r.netDex} maxAbs={max.dex} tone="net" /> },
    { id: 'putVex', title: 'Put VEX', align: 'right', render: (r) => <MatrixValue value={r.putVex} maxAbs={max.vex} tone="put" /> },
    { id: 'callVex', title: 'Call VEX', align: 'right', render: (r) => <MatrixValue value={r.callVex} maxAbs={max.vex} tone="call" /> },
    { id: 'netVex', title: 'Net VEX', align: 'right', render: (r) => <MatrixValue value={r.netVex} maxAbs={max.vex} tone="net" /> },
  ];

  // Nearest row to spot gets the pin-tinted highlight (real strikes rarely equal spot exactly).
  const nearestToSpot =
    spot == null || rows.length === 0
      ? null
      : rows.reduce((best, r) => (Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best), rows[0]).strike;

  return (
    <TerminalPanel title={title} subtitle={subtitle} actions={actions} footer={footer} padded={false}>
      <DataTable
        className="rounded-none border-0"
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.strike)}
        rowClassName={(row) =>
          nearestToSpot != null && row.strike === nearestToSpot
            ? 'bg-[rgba(44,104,123,0.08)]'
            : undefined
        }
      />
    </TerminalPanel>
  );
}

export default ExposureMatrix;
