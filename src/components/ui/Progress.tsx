import { Progress as RadixProgress } from 'radix-ui';

/**
 * Slayer terminal Progress — a determinate bar for REAL progress (data export,
 * referral milestones, upload/build steps). Built on radix Progress so it carries
 * proper role="progressbar" + aria-valuenow/valuemax for screen readers, which the
 * hand-rolled width-only divs did not. Reserve for measurable 0→100 progress; use a
 * Spinner for indeterminate waits.
 */

type Tone = 'accent' | 'success' | 'danger' | 'info';

const TONE: Record<Tone, string> = {
  accent: 'var(--accent-color)',
  success: 'var(--success)',
  danger: 'var(--danger)',
  info: 'var(--info)',
};

interface ProgressProps {
  /** 0–100. Values are clamped. */
  value: number;
  tone?: Tone;
  /** Track height in px. Default 8. */
  height?: number;
  /** Accessible label describing what is progressing. */
  ariaLabel?: string;
  className?: string;
}

export function Progress({ value, tone = 'accent', height = 8, ariaLabel, className = '' }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = TONE[tone];
  return (
    <RadixProgress.Root
      value={clamped}
      aria-label={ariaLabel}
      className={`relative w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-2)] ${className}`}
      style={{ height }}
    >
      <RadixProgress.Indicator
        className="h-full rounded-full transition-transform duration-500 ease-out"
        style={{
          background: color,
          width: '100%',
          // Translate the full-width bar left by the remaining fraction — GPU-composited,
          // avoids animating layout width.
          transform: `translateX(-${100 - clamped}%)`,
        }}
      />
    </RadixProgress.Root>
  );
}

export default Progress;
