import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DragScrollTable from './DragScrollTable';
import { EmptyState } from './TableStates';

/**
 * DataTable
 * Standardized table: Desktop table view + Mobile card view, with an integrated footer.
 *
 * Callers keep owning the rows (renderRow / renderCard) and the pagination state.
 * Optional: pass `emptyTitle` (+ `emptyDescription`, `emptyAction`) to show a real empty
 * state when `data` is empty; omit it where the page already handles emptiness itself.
 */
const DataTable = ({
  headers,
  data,
  renderRow,
  renderCard,
  minWidth = "1000px",
  // Pagination Props
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  totalResults,
  itemsPerPageOptions = [50, 100, 200],
  // When true, the footer only shows how many rows are currently loaded --
  // no per-page dropdown, no Prev/Next. For pages that cap themselves to a
  // single fixed-size fetch (e.g. CallTracker/EnquiryTracker's 100-row lazy
  // load) instead of offering real page-N navigation.
  simpleFooter = false,
  emptyTitle,
  emptyDescription,
  emptyAction,
  ariaLabel = 'Data table',
}) => {
  const showEmpty = data.length === 0 && !!emptyTitle;
  const emptyNode = showEmpty ? (
    <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
  ) : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-brand-200 bg-card shadow-sm">
      {/* Mobile Card View (Hidden on Desktop) */}
      <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 overflow-y-auto flex-1 bg-secondary/50 scrollbar-hide content-start">
        {data.length > 0 && (
          data.map((item, index) => renderCard(item, index))
        )}
        {showEmpty && <div className="col-span-full">{emptyNode}</div>}
      </div>

      {/* Desktop Table View (Hidden on Mobile) */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 overflow-hidden">
        <DragScrollTable className="w-full flex-1 min-h-0" ariaLabel={`${ariaLabel}, scrollable`}>
          <table
            aria-label={ariaLabel}
            className={`w-full relative border-separate border-spacing-0 ${minWidth} [&_tbody_tr:hover>td]:bg-secondary`}
          >
            <thead className="sticky top-0 z-20 bg-secondary">
              <tr>
                {headers.map((header, index) => {
                  const label = typeof header === 'object' ? header.label : header;
                  const customClass = typeof header === 'object' ? header.className : '';
                  return (
                    <th
                      key={index}
                      scope="col"
                      className={`whitespace-nowrap border-b border-brand-200 bg-secondary px-4 py-2.5 text-center text-xs font-semibold text-brand-800 ${customClass}`}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y bg-card">
              {data.length > 0 && (
                data.map((item, index) => {
                  const row = renderRow(item, index);
                  if (!row || !item || !item.orderType) return row;

                  const isUrgent = item.orderType.trim().toLowerCase() === 'urgent order';
                  const isStock = item.orderType.trim().toLowerCase() === 'stock order';

                  let customClass = '';
                  if (isUrgent) {
                    customClass = 'order-row-urgent';
                  } else if (isStock) {
                    customClass = 'order-row-stock';
                  }

                  if (customClass) {
                    return React.cloneElement(row, {
                      className: `${row.props.className || ''} ${customClass}`
                    });
                  }
                  return row;
                })
              )}
            </tbody>
          </table>
          {emptyNode}
        </DragScrollTable>
      </div>

      {/* Footer - Unified for both views */}
      <div className="flex flex-col gap-2 rounded-b-lg border-t bg-card px-3 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        {simpleFooter ? (
          <span className="whitespace-nowrap tabular-nums" aria-live="polite">
            {data.length} {data.length === 1 ? 'row' : 'rows'}
          </span>
        ) : (
          <>
            <p className="tabular-nums" aria-live="polite">
              {totalResults === 0
                ? 'No rows'
                : `Showing ${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, totalResults)} of ${totalResults}`}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 whitespace-nowrap">
              <label className="flex items-center gap-2">
                Rows per page
                <select
                  value={itemsPerPage}
                  onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                  className="h-8 w-[72px] rounded-md border border-input bg-card px-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  {itemsPerPageOptions.map(val => (
                    <option key={val} value={val}>{val}</option>
                  ))}
                </select>
              </label>
              <span className="tabular-nums">
                Page {Math.min(currentPage, totalPages || 1)} of {totalPages || 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage >= (totalPages || 1)}
                  aria-label="Next page"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DataTable;
