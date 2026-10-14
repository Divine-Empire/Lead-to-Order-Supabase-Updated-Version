import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * PaginationBar: "Showing a–b of N", rows-per-page, "Page x of y" and Prev/Next.
 * Same markup the DataTable footer uses, for pages that render their own table.
 * Pages are 1-based.
 */
const PaginationBar = ({
  currentPage,
  totalPages,
  itemsPerPage,
  totalResults,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions = [10, 20, 50],
  className = '',
}) => {
  const pages = totalPages || 1;
  return (
    <div className={`flex flex-col gap-2 border-t bg-card px-3 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <p className="tabular-nums" aria-live="polite">
        {totalResults === 0
          ? 'No rows'
          : `Showing ${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, totalResults)} of ${totalResults}`}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 whitespace-nowrap">
        {onItemsPerPageChange && (
          <label className="flex items-center gap-2">
            Rows per page
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="h-8 w-[72px] rounded-md border border-input bg-card px-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {itemsPerPageOptions.map((val) => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </label>
        )}
        <span className="tabular-nums">
          Page {Math.min(currentPage, pages)} of {pages}
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
            disabled={currentPage >= pages}
            aria-label="Next page"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaginationBar;
