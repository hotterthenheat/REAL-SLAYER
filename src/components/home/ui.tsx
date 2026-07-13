/**
 * Small presentational atoms shared across the Home dashboard widgets. Flat,
 * hairline, tabular — no glow / gradients / pills. Colour is a data encoding only.
 */
import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cx } from '../../lib/cx';
import { toneVar, type Tone } from './format';

/** A thin normalized magnitude bar (strength / confidence). Flat solid fill. */
export function MiniBar({ pct, color, className }: { pct: number; color: string; className?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <span className={cx('relative block h-[3px] w-full overflow-hidden rounded-[1px] bg-[var(--border-subtle)]', className)}>
      <span className="absolute inset-y-0 left-0 rounded-[1px]" style={{ width: `${w}%`, background: color }} />
    </span>
  );
}

/** A square status/category badge — hairline border, tone-tinted text, no pill. */
export function Badge({ label, tone = 'neutral', className }: { label: string; tone?: Tone; className?: string }) {
  const c = toneVar[tone];
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-[var(--radius-control)] border px-1.5 py-px text-[8.5px] font-bold uppercase leading-none tracking-[0.1em] slayer-num',
        className,
      )}
      style={{ color: c, borderColor: `color-mix(in srgb, ${c} 45%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)` }}
    >
      {label}
    </span>
  );
}

/** Panel footer navigation link — quiet until hover, brand-accent focus ring. */
export function FooterLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:text-[var(--text-primary)]"
    >
      {label}
      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/** Section header row inside a compact panel (title + optional right slot). */
export function PanelHead({ title, right }: { title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-2.5 py-1.5">
      <div className="slayer-title text-[10px]">{title}</div>
      {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
    </div>
  );
}

/** A single dense table column-header cell. */
export function Th({ children, align = 'left', className }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return (
    <th
      className={cx(
        'whitespace-nowrap px-2 py-1 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}
