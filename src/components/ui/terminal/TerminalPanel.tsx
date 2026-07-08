import React from 'react';
import { cx } from '../../../lib/cx';

/**
 * TerminalPanel — the standard panel frame: hairline border, brand surface
 * gradient, optional titled header with an actions slot, optional footer.
 * `bodyClassName` is kept as a compat alias of `contentClassName`.
 */
type TerminalPanelProps = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** @deprecated compat alias for contentClassName */
  bodyClassName?: string;
  padded?: boolean;
};

export function TerminalPanel({
  title,
  subtitle,
  actions,
  footer,
  children,
  className,
  contentClassName,
  bodyClassName,
  padded = true,
}: TerminalPanelProps) {
  const hasHeader = title || subtitle || actions;
  return (
    <section className={cx('slayer-panel flex min-h-0 flex-col', className)}>
      {hasHeader ? (
        <header className="slayer-panel-header flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <div className="slayer-title">{title}</div> : null}
            {subtitle ? <div className="slayer-subtitle">{subtitle}</div> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div
        className={cx(
          'min-h-0 flex-1',
          padded ? 'p-[var(--panel-pad)]' : '',
          contentClassName ?? bodyClassName,
        )}
      >
        {children}
      </div>
      {footer ? (
        <footer className="border-t border-[var(--border-subtle)] px-[var(--panel-pad)] py-3">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

export default TerminalPanel;
