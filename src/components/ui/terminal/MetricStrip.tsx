/**
 * MetricStrip — the top KPI strip shared by every terminal page. Fixed brand
 * tones; the 8-cell desktop grid reflows to 2/4 columns on smaller screens so it
 * never overflows on mobile. Color is a data encoding (negative/positive/warning
 * /call/pin), never decoration.
 */
export type MetricTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'call' | 'pin';

export type Metric = {
  label: string;
  value: string;
  sub?: string;
  tone?: MetricTone;
};

const toneClass: Record<MetricTone, string> = {
  neutral: 'text-[var(--text-primary)]',
  positive: 'text-[#2f9d45]',
  negative: 'text-[#d94646]',
  warning: 'text-[var(--warning)]',
  call: 'text-[var(--call)]',
  pin: 'text-[var(--pin)]',
};

export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="min-h-[76px] border-b border-r border-[var(--border-subtle)] px-4 py-3 last:border-r-0 [&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n)]:border-r sm:[&:nth-child(4n)]:border-r-0 lg:[&:nth-child(4n)]:border-r lg:[&:nth-child(8n)]:border-r-0 lg:border-b-0"
        >
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{metric.label}</div>
          <div className={`mt-1 text-[18px] font-semibold slayer-num leading-tight ${toneClass[metric.tone ?? 'neutral']}`}>
            {metric.value}
          </div>
          {metric.sub && <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{metric.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export default MetricStrip;
