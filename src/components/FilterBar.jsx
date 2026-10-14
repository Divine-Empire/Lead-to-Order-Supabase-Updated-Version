import React from 'react';
import { Search, X } from 'lucide-react';

/** Shared look for plain filter controls (native selects etc.) so they match SearchableDropdown. */
export const filterControlClass =
  'h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

/** Search box used at the start of every filter toolbar. */
export const FilterSearch = ({ value, onChange, placeholder, className = '' }) => (
  <div className={`relative min-w-[180px] flex-1 ${className}`}>
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    <input
      type="search"
      aria-label={placeholder}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    />
  </div>
);

/**
 * Removable chips for the active filters, plus "Clear all".
 * chips: [{ key, label, onRemove }]
 */
export const FilterChips = ({ chips, onClearAll }) => {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex h-7 items-center gap-1 rounded border border-brand-200 bg-brand-50 pl-2 pr-1 text-xs font-medium text-brand-800"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove filter ${chip.label}`}
            className="flex h-5 w-5 items-center justify-center rounded-sm text-brand-600 transition-colors hover:bg-brand-100 hover:text-brand-900"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      {onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="h-7 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Clear all
        </button>
      )}
    </div>
  );
};

/** Chips for a multi-select filter: one chip per selected value, labelled from `options`. */
export const chipsForValues = (prefix, values, options, onChange) =>
  (Array.isArray(values) ? values : []).map((v) => {
    const opt = options.find((o) => o.value === v);
    return {
      key: `${prefix}-${v}`,
      label: `${prefix}: ${opt ? opt.label : v}`,
      onRemove: () => onChange(values.filter((x) => x !== v)),
    };
  });
