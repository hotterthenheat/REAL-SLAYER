import { Skeleton } from './ui/Skeleton';

/**
 * PanelSkeleton — a loading placeholder for data panels. The label stays crisp (a
 * pulsing/shimmering title reads as a rendering bug); only the value tiles shimmer
 * via the shared Skeleton primitive. Uses surface tokens so it matches the panel it
 * stands in for. For REAL loading states only, never decorative filler.
 */
export function PanelSkeleton({ label, rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" role="status" aria-label={label ? `${label} loading` : 'Loading'}>
      {label && (
        <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">
          {label}
        </span>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: rows * 2 }).map((_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    </div>
  );
}
