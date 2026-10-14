import React from 'react';
import { Columns3 } from 'lucide-react';

/**
 * ColumnSelector: "Columns n/m" button with a checklist popover.
 *
 * Controlled by the page: `open` / `onOpenChange` (pages close it on outside click via the
 * `dropdown-container` class this wrapper carries), `visible` is { [key]: boolean }.
 *
 * options: [{ key, label }]
 */
const ColumnSelector = ({
  options,
  visible,
  onToggle,
  onSelectAll,
  open,
  onOpenChange,
  idPrefix = 'col',
  align = 'right',
  className = '',
}) => {
  const shown = options.filter((o) => !!visible[o.key]).length;
  const allChecked = Object.values(visible).every(Boolean);

  return (
    <div
      className={`relative dropdown-container shrink-0 ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          onOpenChange(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Columns3 size={16} aria-hidden="true" />
        <span>Columns</span>
        <span className="tabular-nums text-muted-foreground">{shown}/{options.length}</span>
      </button>

      {open && (
        <div
          role="group"
          aria-label="Visible columns"
          className={`absolute top-full z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <label
            htmlFor={`${idPrefix}-select-all`}
            className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/60"
          >
            <input
              type="checkbox"
              id={`${idPrefix}-select-all`}
              checked={allChecked}
              onChange={onSelectAll}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            All columns
          </label>
          <ul className="max-h-72 overflow-y-auto py-1">
            {options.map((option) => (
              <li key={option.key}>
                <label
                  htmlFor={`${idPrefix}-${option.key}`}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent/60"
                >
                  <input
                    type="checkbox"
                    id={`${idPrefix}-${option.key}`}
                    checked={!!visible[option.key]}
                    onChange={() => onToggle(option.key)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  {option.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ColumnSelector;
