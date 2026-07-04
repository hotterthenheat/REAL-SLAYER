import React from 'react';

/**
 * Slayer terminal skeletons — for REAL loading states only (data in flight), never
 * decorative filler. Uses the app's surface tokens so it reads as "structure is
 * here, values are loading", matching the panel it stands in for.
 */

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`animate-pulse rounded-md bg-[var(--surface-2)] ${className}`}
    />
  );
}

/** A chart-shaped placeholder: axis frame + a candle-like bar field. */
export function ChartSkeleton({ label = 'Loading chart…', bars = 28 }: { label?: string; bars?: number }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="relative flex h-full min-h-[160px] w-full flex-col justify-end gap-2 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
    >
      <div className="flex flex-1 items-end gap-[3px]">
        {Array.from({ length: bars }).map((_, i) => {
          // Deterministic pseudo-random heights (no Math.random → stable render).
          const h = 24 + ((i * 37) % 60);
          return (
            <div
              key={i}
              className="flex-1 animate-pulse rounded-sm bg-[var(--surface-2)]"
              style={{ height: `${h}%`, animationDelay: `${(i % 6) * 90}ms` }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-tertiary)]" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">{label}</span>
      </div>
    </div>
  );
}

/** A table/matrix-shaped placeholder for dense grids awaiting data. */
export function MatrixSkeleton({ rows = 8, cols = 4, label = 'Loading…' }: { rows?: number; cols?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="w-full space-y-1.5">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {Array.from({ length: rows * cols }).map((_, i) => (
          <Skeleton key={i} className="h-6" style={{ animationDelay: `${(i % cols) * 80}ms`, opacity: 1 - Math.floor(i / cols) * 0.05 }} />
        ))}
      </div>
    </div>
  );
}
