/**
 * DataStateBadge — the ONE canonical data-provenance chip for the whole app.
 *
 * The product had SIMULATED / SAMPLE DATA / MODEL / LIVE scattered with per-panel styling.
 * This centralises the five allowed states and their treatment so every surface reads the
 * same way. One quiet badge per panel — never a large "FAKE DATA" stamp.
 *
 *   live     → LIVE CHAIN     (green)  real streamed option chain
 *   delayed  → DELAYED DATA   (amber)  real but lagged
 *   model    → MODEL MODE     (blue)   model-derived, no live chain
 *   sample   → SAMPLE MODE    (blue)   illustrative demo fixtures
 *   required → DATA REQUIRED  (muted)  not enough data yet
 */

export type DataState = 'live' | 'delayed' | 'model' | 'sample' | 'required';

const META: Record<DataState, { label: string; cls: string }> = {
  live: { label: 'Live Chain', cls: 'text-[var(--success)] border-[var(--success)]/40 bg-[var(--success)]/10' },
  delayed: { label: 'Delayed Data', cls: 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10' },
  model: { label: 'Model Mode', cls: 'text-[var(--info)] border-[var(--info)]/40 bg-[var(--info)]/10' },
  sample: { label: 'Sample Mode', cls: 'text-[var(--info)] border-[var(--info)]/40 bg-[var(--info)]/10' },
  required: { label: 'Data Required', cls: 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface-2)]' },
};

interface Props {
  state: DataState;
  /** Override the label text (e.g. "Live Tradier"); defaults to the canonical label. */
  label?: string;
  title?: string;
  className?: string;
}

export function DataStateBadge({ state, label, title, className = '' }: Props) {
  const m = META[state];
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-widest ${m.cls} ${className}`}
    >
      {label ?? m.label}
    </span>
  );
}

/** Convenience mapper: a boolean live flag → the two most common states. */
export const liveState = (live: boolean): DataState => (live ? 'live' : 'model');

export default DataStateBadge;
