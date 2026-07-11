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
  /** Preferred metric count — used only to pick a sensible desktop column count.
   *  Regardless of value the strip is CAPPED at 6 columns and wraps 7+ metrics to
   *  even rows, so cells never get too narrow to hold their label + value. */
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

// Desktop columns per row. Capped at 6 so a cell is always wide enough for its
// value; strips with 7–9 metrics resolve to 4 and wrap to two even rows instead
// of cramming one row where labels wrap unevenly and values clip/overlap.
const desktopColClass: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
};

export function MetricStrip({ metrics, columns, className }: MetricStripProps) {
  const count = columns ?? metrics.length;
  // ≤6 metrics keep their own single row; 7+ wrap to rows of 4.
  const cols = (count <= 6 ? Math.max(2, count) : 4) as 2 | 3 | 4 | 5 | 6;
  // Denser strips get a smaller value type so multi-digit prices fit a cell
  // intact — otherwise a tabular value like "5,453.11" breaks mid-number.
  const valueSize = cols >= 6 ? 'text-[18px]' : cols >= 5 ? 'text-[19px]' : 'text-[21px]';
  return (
    // gap-px over a hairline background draws clean 1px rules between every cell in
    // BOTH directions, so a wrapped second row reads correctly (per-cell left
    // borders would leave a dangling edge and no row divider when wrapping).
    <div
      className={cx(
        'slayer-panel grid grid-cols-2 gap-px overflow-hidden bg-[var(--border-subtle)] md:grid-cols-4',
        desktopColClass[cols],
        className,
      )}
    >
      {metrics.map((metric, index) => (
        <div
          key={`${metric.label}-${index}`}
          className="min-w-0 bg-[var(--surface)] px-4 py-3"
        >
          <div
            title={typeof metric.label === 'string' ? metric.label : undefined}
            className="min-h-[2.3em] text-[var(--text-3xs)] font-semibold uppercase leading-[1.15] tracking-[0.16em] text-[var(--text-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
          >
            {metric.label}
          </div>
          <div
            className={cx(
              // nowrap so a two-word value ("SHORT GAMMA") can't wrap and stretch
              // the whole row taller than its neighbours; truncate keeps it inside
              // its cell (cells are now wide enough that this rarely triggers).
              'mt-1.5 leading-[1.1] slayer-num truncate [overflow-wrap:normal] [word-break:keep-all]',
              metric.primary ? 'font-bold' : 'font-semibold',
              valueSize,
              metric.primary && 'text-[1.08em]',
              toneClass[metric.tone || 'neutral'],
            )}
          >
            {metric.value}
          </div>
          {metric.sub ? (
            <div className="mt-1 text-[11px] leading-tight text-[var(--text-secondary)] truncate">
              {metric.sub}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default MetricStrip;
