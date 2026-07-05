import React from 'react';

/**
 * Slayer terminal Table — semantic, dependency-free table primitives with one shared
 * chrome for the app's dense financial lists (order flow, alert ledgers, edge stats).
 * Hairline row rules, a sticky mono header, hover rows, tabular-nums, and `align`
 * helpers so numbers line up. This is NOT for the heat-grid matrices (GreeksMatrix /
 * StrikeMatrix) — those are visualizations, and a plain table would strip the heatmap.
 * Use it where the data is genuinely tabular and the value IS the number.
 */

type Align = 'left' | 'right' | 'center';
const alignCls: Record<Align, string> = { left: 'text-left', right: 'text-right', center: 'text-center' };

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Wrap in a horizontally-scrollable, bordered container. */
  bare?: boolean;
  containerClassName?: string;
}

export function Table({ className = '', bare, containerClassName = '', children, ...rest }: TableProps) {
  const table = (
    <table className={`w-full border-collapse font-mono text-[11px] tabular-nums ${className}`} {...rest}>
      {children}
    </table>
  );
  if (bare) return table;
  return <div className={`w-full overflow-x-auto rounded-lg border border-[var(--border)] ${containerClassName}`}>{table}</div>;
}

export function THead({ className = '', sticky = true, children, ...rest }: React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) {
  return (
    <thead
      className={`${sticky ? 'sticky top-0 z-10' : ''} bg-[var(--surface-2)] ${className}`}
      {...rest}
    >
      {children}
    </thead>
  );
}

export function TBody({ className = '', children, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...rest}>{children}</tbody>;
}

export function TFoot({ className = '', children, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={`sticky bottom-0 z-10 bg-[var(--surface-2)] font-black ${className}`} {...rest}>{children}</tfoot>;
}

interface TRProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Adds hover highlight + pointer affordance for clickable rows. */
  interactive?: boolean;
  /** Highlight this row (e.g. spot / selected). */
  active?: boolean;
}

export function TR({ className = '', interactive, active, children, onClick, onKeyDown, tabIndex, ...rest }: TRProps) {
  // Clickable rows must be keyboard-operable: make them focusable and fire the
  // click on Enter/Space, with a visible focus ring. Non-interactive rows are
  // untouched (no tabIndex, no key handling).
  const handleKeyDown = interactive
    ? (e: React.KeyboardEvent<HTMLTableRowElement>) => {
        onKeyDown?.(e);
        if (!e.defaultPrevented && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.(e as unknown as React.MouseEvent<HTMLTableRowElement>);
        }
      }
    : onKeyDown;
  return (
    <tr
      className={`border-b border-[var(--border)] last:border-0 transition-colors ${
        active ? 'bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)]' : ''
      } ${interactive ? 'cursor-pointer hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-color)]/50' : ''} ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={interactive ? tabIndex ?? 0 : tabIndex}
      {...rest}
    >
      {children}
    </tr>
  );
}

interface CellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
  /** Freeze this column to the left edge during horizontal scroll. */
  stick?: boolean;
}

export function TH({ className = '', align = 'left', stick, children, ...rest }: CellProps) {
  return (
    <th
      className={`${alignCls[align]} whitespace-nowrap px-3 py-2 text-[8.5px] font-black uppercase tracking-[0.12em] text-[var(--text-tertiary)] ${
        stick ? 'sticky left-0 z-20 bg-[var(--surface-2)]' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({ className = '', align = 'left', stick, children, ...rest }: CellProps) {
  return (
    <td
      className={`${alignCls[align]} whitespace-nowrap px-3 py-1.5 text-[var(--text-secondary)] ${
        stick ? 'sticky left-0 z-[1] bg-[var(--surface)]' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
