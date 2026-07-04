import React from 'react';

/** Hairline divider using the app's border token. Horizontal or vertical. */
export function Separator({
  orientation = 'horizontal',
  className = '',
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={
        (orientation === 'horizontal' ? 'h-px w-full ' : 'w-px self-stretch ') +
        'shrink-0 bg-[var(--border)] ' +
        className
      }
    />
  );
}
