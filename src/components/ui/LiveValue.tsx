import React, { useEffect, useRef, useState } from 'react';

/**
 * LiveValue — the terminal's "this number is alive" primitive. Renders a value and,
 * whenever it changes, briefly flashes it green (up) / red (down) so a trader's eye
 * catches motion across a dense grid without watching every cell. Numeric values
 * flash directionally; non-numeric (a regime label, a state word) flash neutral.
 *
 *   <LiveValue value={netGex} format={fmtGreek} />
 *   <LiveValue value={regime} />           // string → neutral flash on change
 *
 * Purely presentational — it reflects whatever value it's handed (live feed today,
 * real backend the moment one connects). tabular-nums so digits don't jitter.
 */

type FlashMode = 'directional' | 'neutral';

interface LiveValueProps {
  value: number | string | null | undefined;
  /** Formatter for display. Defaults to toLocaleString for numbers, String otherwise. */
  format?: (v: number | string) => React.ReactNode;
  /** directional = green up / red down (numbers only); neutral = single accent flash. */
  mode?: FlashMode;
  /** Placeholder shown when value is null/undefined. */
  placeholder?: string;
  className?: string;
  /** Turn the flash off (still renders the value) — e.g. for reduced density. */
  flash?: boolean;
  title?: string;
}

const defaultFormat = (v: number | string) =>
  typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v);

export function LiveValue({
  value,
  format = defaultFormat,
  mode = 'directional',
  placeholder = '—',
  className = '',
  flash = true,
  title,
}: LiveValueProps) {
  const prev = useRef<number | string | null | undefined>(value);
  // `tick` increments on every change so the flashing span remounts and replays the
  // CSS animation (a stable element wouldn't re-run the same-named keyframe).
  const [tick, setTick] = useState(0);
  const [dir, setDir] = useState<'up' | 'down' | 'neutral'>('neutral');

  useEffect(() => {
    const p = prev.current;
    if (p === value || value === null || value === undefined) { prev.current = value; return; }
    if (mode === 'directional' && typeof value === 'number' && typeof p === 'number') {
      setDir(value > p ? 'up' : value < p ? 'down' : 'neutral');
    } else {
      setDir('neutral');
    }
    setTick((t) => t + 1);
    prev.current = value;
  }, [value, mode]);

  if (value === null || value === undefined) {
    return <span className={`tabular-nums ${className}`}>{placeholder}</span>;
  }

  const flashCls = !flash || tick === 0 ? '' : `slv-flash-${dir}`;
  return (
    <span
      key={tick}
      title={title}
      className={`tabular-nums rounded-[3px] ${flashCls} ${className}`}
    >
      {format(value)}
    </span>
  );
}

/**
 * LiveDot — a small pulsing "streaming" indicator. Green + ping when the stream is
 * flowing; amber/red for degraded/stopped. Pairs with a short label to read as a
 * heartbeat anywhere a panel wants to signal it's live.
 */
export function LiveDot({
  state = 'live',
  label,
  className = '',
}: {
  state?: 'live' | 'idle' | 'down';
  label?: string;
  className?: string;
}) {
  const color = state === 'live' ? 'var(--success)' : state === 'idle' ? 'var(--warning)' : 'var(--danger)';
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {state === 'live' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: color }} />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      </span>
      {label && <span className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{label}</span>}
    </span>
  );
}

export default LiveValue;
