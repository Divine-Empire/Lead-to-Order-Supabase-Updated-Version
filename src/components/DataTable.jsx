import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DragScrollTable from './DragScrollTable';

/**
 * DataTable Component
 * Standardized table with Desktop Table View and Mobile Card View.
 * Includes integrated pagination footer.
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
  itemsPerPageOptions = [50, 100, 200]
}) => {
  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Mobile Card View (Hidden on Desktop) */}
      <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 overflow-y-auto flex-1 bg-slate-50/50 scrollbar-hide content-start">
        {data.length > 0 && (
          data.map((item, index) => renderCard(item, index))
        )}
      </div>

      {/* Desktop Table View (Hidden on Mobile) */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 overflow-hidden">
        <DragScrollTable className="w-full flex-1 min-h-0">
          <table className={`w-full relative border-separate border-spacing-0 ${minWidth}`}>
            <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
              <tr>
                {headers.map((header, index) => {
                  const label = typeof header === 'object' ? header.label : header;
                  const customClass = typeof header === 'object' ? header.className : '';
                  return (
                    <th 
                      key={index} 
                      className={`px-4 py-3 border-b border-gray-200 text-center text-sm font-semibold text-gray-900 whitespace-nowrap uppercase tracking-wider ${customClass}`}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
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
        </DragScrollTable>
      </div>

      {/* Footer - Unified for both views */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4 rounded-b-lg">
        {/* Left Side: Row Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:border-primary bg-white font-medium text-xs md:text-sm shadow-sm"
          >
            {itemsPerPageOptions.map(val => (
              <option key={val} value={val}>{val}</option>
            ))}
          </select>
          <span className="text-[10px] md:text-sm text-gray-500 whitespace-nowrap font-medium hidden sm:inline">
            {totalResults > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0}-{Math.min(currentPage * itemsPerPage, totalResults)} of {totalResults}
          </span>
        </div>

        {/* Right Side: Pagination Controls */}
        <div className="flex items-center gap-2 md:gap-4 text-gray-700">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 md:px-2 md:py-1 border border-gray-300 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition shadow-sm flex items-center justify-center text-primary"
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <div className="flex items-center text-xs md:text-sm font-semibold text-gray-600">
            {currentPage} / {totalPages || 1}
          </div>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || totalPages === 0}
            className="p-1.5 md:px-2 md:py-1 border border-gray-300 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition shadow-sm flex items-center justify-center text-primary"
          >
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
