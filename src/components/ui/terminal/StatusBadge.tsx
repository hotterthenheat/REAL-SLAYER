import clsx from 'clsx';

/**
 * StatusBadge — a compact terminal status chip. Brand-tone only; pairs a color
 * with a label so state never reads as color alone.
 */
export type BadgeTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'call' | 'pin' | 'live';

const tone: Record<BadgeTone, string> = {
  neutral: 'text-[var(--text-secondary)] border-[var(--border-mid)] bg-[var(--bg-panel-soft)]',
  positive: 'text-[#2f9d45] border-[#2f9d45]/40 bg-[var(--positive-soft)]',
  negative: 'text-[#d94646] border-[var(--slayer-red)]/50 bg-[var(--negative-soft)]',
  warning: 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10',
  call: 'text-[var(--call)] border-[var(--call)]/40 bg-[var(--call)]/10',
  pin: 'text-[var(--pin)] border-[var(--pin)]/40 bg-[var(--pin)]/10',
  live: 'text-[#2f9d45] border-[#2f9d45]/40 bg-[var(--positive-soft)]',
};

export function StatusBadge({ tone: t = 'neutral', children, dot, className }: {
  tone?: BadgeTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] slayer-num', tone[t], className)}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', t === 'live' && 'animate-pulse')} style={{ background: 'currentColor' }} />}
      {children}
    </span>
  );
}

export default StatusBadge;
