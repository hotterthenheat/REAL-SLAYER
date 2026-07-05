import React from 'react';

/**
 * SectionHeader — the small caps label that titles a panel/list section, with an optional
 * right-hand slot (count, action, badge) and description. Consolidates the
 * `text-[..] font-black uppercase tracking-widest text-[var(--text-tertiary)]` header that was
 * copy-pasted across 25+ components. Same look; one component so spacing/weight stay consistent.
 */

interface SectionHeaderProps {
  label: React.ReactNode;
  /** Right-aligned content — a count, a button, a DataStateBadge. */
  right?: React.ReactNode;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  /** 'sm' matches the dense in-panel headers; 'md' the section titles. */
  size?: 'sm' | 'md';
  className?: string;
}

export function SectionHeader({ label, right, icon, description, size = 'md', className = '' }: SectionHeaderProps) {
  const labelSize = size === 'sm' ? 'text-[8px]' : 'text-[10px]';
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && <span className="text-[var(--text-tertiary)] shrink-0" aria-hidden="true">{icon}</span>}
          <span className={`${labelSize} font-black uppercase tracking-widest text-[var(--text-tertiary)] truncate`}>{label}</span>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {description && (
        <p className="mt-1 text-[10px] leading-snug text-[var(--text-tertiary)]">{description}</p>
      )}
    </div>
  );
}

export default SectionHeader;
