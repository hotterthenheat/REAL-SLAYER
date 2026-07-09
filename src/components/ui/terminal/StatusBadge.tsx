import React from 'react';
import { cx } from '../../../lib/cx';

/**
 * StatusBadge — the unified terminal state chip. Tone is a data encoding, never
 * decoration; a badge always pairs its color with a label so state never reads
 * as color alone. `live` is kept as a compat alias of `positive` (with a pulse
 * dot) for existing callers.
 */
export type BadgeTone =
  | 'neutral'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'info'
  | 'call'
  | 'pin'
  | 'live';

type StatusBadgeProps = {
  children: React.ReactNode;
  tone?: BadgeTone;
  /** Optional leading state dot (pulses for `live`). */
  dot?: boolean;
  className?: string;
};

const toneClasses: Record<Exclude<BadgeTone, 'live'>, string> = {
  neutral:
    'border-[var(--border-subtle)] bg-[rgba(248,248,255,0.05)] text-[var(--text-secondary)]',
  positive:
    'border-[color:rgba(13,71,21,0.45)] bg-[var(--positive-soft)] text-[var(--positive-ink)]',
  negative:
    'border-[color:rgba(152,4,4,0.5)] bg-[var(--negative-soft)] text-[var(--negative-ink)]',
  warning:
    'border-[color:rgba(196,154,58,0.45)] bg-[rgba(196,154,58,0.14)] text-[var(--warning)]',
  info:
    'border-[color:rgba(74,111,184,0.45)] bg-[rgba(74,111,184,0.16)] text-[var(--text-primary)]',
  call:
    'border-[color:rgba(106,147,181,0.5)] bg-[rgba(106,147,181,0.14)] text-[var(--call)]',
  pin:
    'border-[color:rgba(44,104,123,0.5)] bg-[rgba(44,104,123,0.16)] text-[var(--pin)]',
};

export function StatusBadge({
  children,
  tone = 'neutral',
  dot,
  className,
}: StatusBadgeProps) {
  const resolved = tone === 'live' ? 'positive' : tone;
  const showDot = dot ?? tone === 'live';
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1.5 rounded-[7px] border px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em]',
        toneClasses[resolved],
        className,
      )}
    >
      {showDot && (
        <span
          className={cx('h-1.5 w-1.5 rounded-full', tone === 'live' && 'animate-pulse')}
          style={{ background: 'currentColor' }}
        />
      )}
      {children}
    </span>
  );
}

export default StatusBadge;
