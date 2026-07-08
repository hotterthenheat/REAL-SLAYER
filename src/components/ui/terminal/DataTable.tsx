import React from 'react';
import { cx } from '../../../lib/cx';

/**
 * DataTable — the shared terminal data table: sticky uppercase header, hairline
 * row rules, tabular numerics, optional keyboard-accessible row selection. It
 * scrolls inside its own container so the page body never scrolls horizontally.
 *
 * Column API: the canonical shape is `{ id, title, render }`; the legacy shape
 * `{ key, header, render }` from earlier pages is accepted as an alias so the
 * page-by-page migration never breaks a caller.
 */
export type DataColumn<T> = {
  id?: string;
  /** @deprecated compat alias for id */
  key?: string;
  title?: React.ReactNode;
  /** @deprecated compat alias for title */
  header?: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render: (row: T, rowIndex: number) => React.ReactNode;
};

/** Legacy alias kept for existing imports. */
export type Column<T> = DataColumn<T>;

type DataTableProps<T> = {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T, rowIndex: number) => string;
  emptyState?: React.ReactNode;
  /** @deprecated compat alias for emptyState */
  empty?: React.ReactNode;
  className?: string;
  rowClassName?: (row: T, rowIndex: number) => string | undefined;
  /** Optional row-selection handler; rows become clickable + keyboard-operable. */
  onRowClick?: (row: T, rowIndex: number) => void;
  stickyHeader?: boolean;
};

const alignClass = (align?: 'left' | 'center' | 'right') => {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyState,
  empty,
  className,
  rowClassName,
  onRowClick,
  stickyHeader = true,
}: DataTableProps<T>) {
  const emptyNode = emptyState ?? empty ?? 'No data';
  const colId = (column: DataColumn<T>, index: number) =>
    column.id ?? column.key ?? String(index);
  return (
    <div
      className={cx(
        'slayer-scrollbar overflow-auto rounded-[10px] border border-[var(--border-subtle)]',
        className,
      )}
    >
      <table className="slayer-table w-full">
        <thead className={cx(stickyHeader && 'sticky top-0 z-[1] bg-[var(--bg-panel)]')}>
          <tr>
            {columns.map((column, index) => (
              <th
                key={colId(column, index)}
                className={cx(alignClass(column.align), column.className)}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.title ?? column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                className="px-4 py-8 text-center text-[var(--text-muted)]"
                colSpan={columns.length}
              >
                {emptyNode}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr
                key={rowKey(row, rowIndex)}
                className={cx(
                  'transition-colors',
                  onRowClick && 'cursor-pointer',
                  rowClassName?.(row, rowIndex),
                )}
                onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row, rowIndex);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((column, index) => (
                  <td
                    key={colId(column, index)}
                    className={cx(alignClass(column.align), column.className)}
                  >
                    {column.render(row, rowIndex)}
                  </td>
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
