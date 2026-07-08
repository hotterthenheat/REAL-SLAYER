import React from 'react';
import clsx from 'clsx';

/**
 * TerminalPanel — the canonical Slayer Terminal panel: hairline border, brand
 * surface gradient, optional titled header with an actions slot. Wrap existing
 * cards with this so every panel reads as one system.
 */
type Props = {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function TerminalPanel({ title, subtitle, actions, children, className, bodyClassName }: Props) {
  return (
    <section className={clsx('slayer-panel overflow-hidden', className)}>
      {(title || subtitle || actions) && (
        <header className="slayer-panel-header flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="slayer-title truncate">{title}</h2>}
            {subtitle && <p className="slayer-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={clsx('p-[var(--panel-pad)]', bodyClassName)}>{children}</div>
    </section>
  );
}

export default TerminalPanel;
