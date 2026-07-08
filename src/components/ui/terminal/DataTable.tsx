import React from 'react';
import clsx from 'clsx';

/**
 * DataTable — the shared terminal table (uses the .slayer-table styling). Generic
 * over row type; columns declare alignment + a cell renderer. Scrolls inside its
 * own container so the page body never scrolls horizontally.
 */
export type Column<T> = {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  render: (row: T, index: number) => React.ReactNode;
  className?: string;
};

export function DataTable<T>({ columns, rows, rowKey, rowClassName, empty, className }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  rowClassName?: (row: T, index: number) => string | undefined;
  empty?: React.ReactNode;
  className?: string;
}) {
  const alignCls = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
  return (
    <div className={clsx('overflow-x-auto rounded-md border border-[var(--border-subtle)]', className)}>
      <table className="slayer-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={clsx(alignCls(c.align), c.className)}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="text-center text-[var(--text-muted)] py-8">{empty ?? 'No data'}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row, i)} className={rowClassName?.(row, i)}>
                {columns.map((c) => (
                  <td key={c.key} className={clsx(alignCls(c.align), c.className)}>{c.render(row, i)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
