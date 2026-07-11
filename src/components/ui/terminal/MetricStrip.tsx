import React from 'react';
import { cx } from '../../../lib/cx';

/**
 * MetricStrip — the dense top KPI strip shared by every terminal page. Tone is
 * a data encoding: positive/negative use the readable ink variants of the brand
 * red/green; call/pin/warning are the market accents. Reflows 2 → 4 → N columns
 * so it never overflows on mobile.
 */
export type MetricTone =
  | 'neutral'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'call'
  | 'pin';

export type Metric = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: MetricTone;
  /** The lead figure of the strip (e.g. Net GEX, Spot). Renders one weight/size
   *  step above supporting cells so the strip has a readable focal point instead
   *  of every value sharing the same weight. */
  primary?: boolean;
};

type MetricStripProps = {
  metrics: Metric[];
  columns?: 4 | 5 | 6 | 7 | 8 | 9;
  className?: string;
};

const toneClass: Record<MetricTone, string> = {
  neutral: 'text-[var(--text-primary)]',
  positive: 'text-[var(--positive-ink)]',
  negative: 'text-[var(--negative-ink)]',
  warning: 'text-[var(--warning)]',
  call: 'text-[var(--call)]',
  pin: 'text-[var(--pin)]',
};

const columnClass: Record<NonNullable<MetricStripProps['columns']>, string> = {
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
  7: 'xl:grid-cols-7',
  8: 'xl:grid-cols-8',
  9: 'xl:grid-cols-9',
};

export function MetricStrip({ metrics, columns = 8, className }: MetricStripProps) {
  // Denser strips get a smaller value type so multi-digit prices fit a cell
  // intact — otherwise a tabular value like "5,453.11" breaks mid-number.
  const valueSize = columns >= 8 ? 'text-[17px]' : columns >= 6 ? 'text-[19px]' : 'text-[22px]';
  return (
    <div
      className={cx(
        'slayer-panel grid grid-cols-2 gap-0 overflow-hidden md:grid-cols-4',
        columnClass[columns],
        className,
      )}
    >
      {metrics.map((metric, index) => (
        <div
          key={`${metric.label}-${index}`}
          className={cx(
            'min-w-0 px-4 py-3',
            index !== 0 && 'border-l border-[var(--border-subtle)]',
          )}
        >
          <div className="text-[var(--text-3xs)] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {metric.label}
          </div>
          <div
            className={cx(
              // nowrap so a two-word value ("SHORT GAMMA") can't wrap and stretch
              // the whole row taller than its neighbours.
              'mt-1.5 leading-[1.1] slayer-num whitespace-nowrap [overflow-wrap:normal] [word-break:keep-all]',
              metric.primary ? 'font-bold' : 'font-semibold',
              valueSize,
              metric.primary && 'text-[1.08em]',
              toneClass[metric.tone || 'neutral'],
            )}
          >
            {metric.value}
          </div>
          {metric.sub ? (
            <div className="mt-1 text-[11px] leading-tight text-[var(--text-secondary)]">
              {metric.sub}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default MetricStrip;
