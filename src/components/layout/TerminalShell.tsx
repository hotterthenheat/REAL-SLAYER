import React from 'react';
import { cx } from '../../lib/cx';

/**
 * TerminalShell — the page frame from the terminal renders: icon-rail sidebar,
 * top bar, and a scrollable content column, all on the brand shell gradient.
 * Owns only presentation; navigation stays store-driven via the sidebar props.
 */
type TerminalShellProps = {
  sidebar: React.ReactNode;
  topBar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function TerminalShell({ sidebar, topBar, children, className }: TerminalShellProps) {
  return (
    <div className={cx('slayer-terminal h-screen overflow-hidden p-2 md:p-4', className)}>
      <div className="grid h-full min-h-0 grid-cols-[64px_minmax(0,1fr)] gap-[var(--gap)] md:grid-cols-[88px_minmax(0,1fr)]">
        {sidebar}
        <div className="flex min-h-0 flex-col gap-[var(--gap)]">
          {topBar}
          <main className="slayer-scrollbar min-h-0 flex-1 overflow-auto rounded-[10px]">
            <div className="flex min-h-full flex-col gap-[var(--gap)]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default TerminalShell;
