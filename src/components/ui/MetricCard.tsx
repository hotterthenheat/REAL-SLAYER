import React from 'react';

/**
 * MetricCard — the canonical single-stat card (label · optional icon · big value · footnote).
 * Standardises the metric grids that were hand-rolled across Trade History, Dealer Flow, and the
 * quant panels so they read identically. Terminal look preserved; this is convergence, not a
 * restyle. `tone` colours the value the way the existing cards did (success/danger/warning).
 */

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'accent';

const TONE_VALUE: Record<Tone, string> = {
  default: 'text-[var(--text-primary)]',
  success: 'text-[var(--success)]',
  danger: 'text-[var(--danger)]',
  warning: 'text-[var(--warning)]',
  accent: 'text-[var(--accent-color)]',
};

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  /** Small suffix rendered after the value (e.g. "min", "%"). */
  unit?: string;
  /** Sub-label under the value. */
  footnote?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  className?: string;
}

export function MetricCard({ label, value, unit, footnote, icon, tone = 'default', className = '' }: MetricCardProps) {
  return (
    <div className={`bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl ${className}`}>
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">{label}</span>
        {icon && <span aria-hidden="true">{icon}</span>}
      </div>
      <h3 className={`text-2xl font-black mt-2 tabular-nums ${TONE_VALUE[tone]}`}>
        {value}
        {unit && <span className="text-sm font-bold text-[var(--text-tertiary)]"> {unit}</span>}
      </h3>
      {footnote && (
        <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold tracking-wide mt-1">{footnote}</p>
      )}
    </div>
  );
}

export default MetricCard;
