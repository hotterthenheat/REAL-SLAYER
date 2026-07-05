import React from 'react';

/**
 * EmptyStatePanel — the canonical empty-state (Carbon guidance): explain what would appear,
 * why it matters, and give one constructive next action. Replaces the dead scaffolding
 * rather than sitting above it. Keeps the terminal look; standardises the pattern so every
 * empty route reads the same.
 */

interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** One optional next-step action. */
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
  className?: string;
  compact?: boolean;
}

export function EmptyStatePanel({ icon, title, description, action, className = '', compact }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] text-center ${compact ? 'py-10 px-5' : 'py-16 px-6'} ${className}`}>
      {icon && <div className="mb-1 text-[var(--text-tertiary)]" aria-hidden="true">{icon}</div>}
      <span className="text-[12px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">{title}</span>
      {description && (
        <p className="max-w-sm text-[10px] leading-relaxed text-[var(--text-tertiary)]">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        >
          {action.icon}{action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyStatePanel;
