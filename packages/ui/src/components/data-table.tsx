'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox, Search } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { Skeleton } from './skeleton';

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Accessible name for the table; required. */
  caption: string;
  loading?: boolean;
  /** Shown instead of rows when loading failed. */
  error?: string;
  onRetry?: () => void;
  /** Copy for the zero-rows state. */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Adds the search box that filters across all columns. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Adds a checkbox column and reports the selection. */
  selectable?: boolean;
  onSelectionChange?: (rows: TData[]) => void;
  /** Called when a row body is clicked — used to open the DetailPanel. */
  onRowClick?: (row: TData) => void;
  /** Rows per page; omit to render every row without pagination. */
  pageSize?: number;
  /** Extra controls rendered beside the search box. */
  toolbar?: React.ReactNode;
  className?: string;
}

/**
 * The console table (spec section 2: sortable, filterable, row-select).
 *
 * On narrow viewports the table scrolls horizontally inside its own container
 * so the page itself never scrolls sideways.
 */
export function DataTable<TData>({
  columns,
  data,
  caption,
  loading = false,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  searchable = false,
  searchPlaceholder = 'Search…',
  selectable = false,
  onSelectionChange,
  onRowClick,
  pageSize,
  toolbar,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const resolvedColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!selectable) return columns;
    const selectColumn: ColumnDef<TData, unknown> = {
      id: '__select',
      enableSorting: false,
      enableGlobalFilter: false,
      size: 40,
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Select all rows on this page"
          checked={table.getIsAllPageRowsSelected()}
          ref={(element) => {
            if (element) element.indeterminate = table.getIsSomePageRowsSelected();
          }}
          onChange={(event) => table.toggleAllPageRowsSelected(event.target.checked)}
          className="accent-gold h-4 w-4 cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label="Select row"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
          className="accent-gold h-4 w-4 cursor-pointer"
        />
      ),
    };
    return [selectColumn, ...columns];
  }, [columns, selectable]);

  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: { sorting, columnFilters, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(pageSize ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: pageSize ? { pagination: { pageIndex: 0, pageSize } } : {},
  });

  // Report selection upward, keyed on the selection state rather than the
  // derived rows so we do not loop on every render.
  React.useEffect(() => {
    if (!onSelectionChange) return;
    onSelectionChange(table.getSelectedRowModel().rows.map((row) => row.original));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection]);

  const columnCount = resolvedColumns.length;
  const rows = table.getRowModel().rows;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                aria-hidden="true"
                className="text-muted-light pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              />
              <input
                type="search"
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={`Filter ${caption}`}
                disabled={loading || Boolean(error)}
                className={cn(
                  'border-border-strong bg-surface h-10 w-full rounded-lg border pl-9 pr-3',
                  'text-ink placeholder:text-muted-light/70 text-base md:text-sm',
                  'focus:ring-gold focus:ring-offset-bg focus:outline-none focus:ring-2 focus:ring-offset-1',
                  'disabled:bg-border/40',
                )}
              />
            </div>
          )}
          {toolbar}
        </div>
      )}

      <div className="border-border bg-surface overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <caption className="sr-only">{caption}</caption>

          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-border border-b">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        !canSort || !sorted
                          ? undefined
                          : sorted === 'asc'
                            ? 'ascending'
                            : 'descending'
                      }
                      className="px-3 py-2.5 first:pl-4 last:pr-4"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            'text-micro text-muted-light flex items-center gap-1 rounded font-bold uppercase',
                            'hover:text-ink transition-colors',
                            'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3 w-3" aria-hidden="true" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        <span className="text-micro text-muted-light font-bold uppercase">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, rowIndex) => (
                <tr key={rowIndex} className="border-border border-b last:border-0">
                  {Array.from({ length: columnCount }).map((__, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-3 first:pl-4 last:pr-4">
                      <Skeleton className="h-4 w-full max-w-[10rem]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={columnCount} className="p-4">
                  <EmptyState
                    tone="error"
                    size="sm"
                    title="Could not load this table"
                    description={error}
                    {...(onRetry ? { action: { label: 'Try again', onClick: onRetry } } : {})}
                  />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="p-4">
                  <EmptyState
                    size="sm"
                    icon={<Inbox className="h-5 w-5" />}
                    title={globalFilter ? 'No matches' : emptyTitle}
                    description={
                      globalFilter
                        ? `Nothing matches “${globalFilter}”. Try a different search.`
                        : emptyDescription
                    }
                    {...(globalFilter
                      ? { action: { label: 'Clear search', onClick: () => setGlobalFilter('') } }
                      : {})}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'border-border border-b last:border-0',
                    row.getIsSelected() && 'bg-gold-soft',
                    onRowClick && 'hover:bg-bg cursor-pointer',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="text-ink px-3 py-3 text-sm first:pl-4 last:pr-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageSize && !loading && !error && rows.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-light text-xs">
            {selectable && Object.keys(rowSelection).length > 0
              ? `${table.getSelectedRowModel().rows.length} selected · `
              : ''}
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { ColumnDef } from '@tanstack/react-table';
