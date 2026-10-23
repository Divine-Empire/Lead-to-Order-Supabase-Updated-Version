import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, X, Download, ChevronDown, Loader2 } from 'lucide-react';
import FilterTabs from "../FilterTabs";
import SearchableDropdown from "../SearchableDropdown";
import ColumnSelector from "../ColumnSelector";
import { FilterSearch, FilterChips, chipsForValues, filterControlClass } from "../FilterBar";

const VALUE_OPTIONS = [
  { value: "", label: "Value: All" },
  { value: "gte100000", label: "Value greater than 1,00,000" },
  { value: "lt100000", label: "Value less than 1,00,000" },
];

const EMPTY_DRAFT = { callingDays: [], value: "", stage: [], item: [], copy: "" };

const EnquiryTrackerFilter = ({
  activeTab, setActiveTab,
  searchTerm, setSearchTerm,
  callingDaysFilter, setCallingDaysFilter,
  valueFilter, setValueFilter,
  currentStageFilter, setCurrentStageFilter,
  itemFilter = [], setItemFilter = () => {}, itemOptions = [],
  quotationCopyFilter = "", setQuotationCopyFilter = () => {},
  filterCounts,
  showColumnDropdown, setShowColumnDropdown,
  visibleColumns, handleSelectAll, handleColumnToggle, columnOptions,
  visiblePendingColumns = {}, handleSelectAllPending = () => {}, handleColumnTogglePending = () => {}, pendingColumnOptions = [],
  setShowNewCallTrackerForm,
  pendingCallTrackers = [],
  historyCallTrackers = [],
  currentStageOptions = null,
  exportTotal = 0, onExport = () => {}, exporting = false, exportLoaded = 0,
}) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(true);
  // Filters are edited as a draft in the dialog and only applied (and the
  // table refetched) on "Apply Filters".
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const openFilters = () => {
    setDraft({ callingDays: callingDaysFilter, value: valueFilter, stage: currentStageFilter, item: itemFilter, copy: quotationCopyFilter });
    setFilterOpen(true);
  };
  const applyDraft = () => {
    setCallingDaysFilter(draft.callingDays);
    setValueFilter(draft.value);
    setCurrentStageFilter(draft.stage);
    setItemFilter(draft.item);
    setQuotationCopyFilter(draft.copy);
    setFilterOpen(false);
  };

  useEffect(() => {
    if (!filterOpen && !exportOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setFilterOpen(false); setExportOpen(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [filterOpen, exportOpen]);

  const activeData = activeTab === "pending"
    ? pendingCallTrackers
    : historyCallTrackers;

  const callingDaysOptions = activeTab === "history"
    ? [
      { value: "today", label: "Today's Calls", count: filterCounts?.today || 0 },
      { value: "older", label: "Older Calls", count: filterCounts?.older || 0 }
    ]
    : [
      { value: "today", label: "Today", count: filterCounts?.today || 0 },
      { value: "overdue", label: "Overdue", count: filterCounts?.overdue || 0 },
      { value: "upcoming", label: "Upcoming", count: filterCounts?.upcoming || 0 }
    ];

  // A fixed, complete list (passed in) so a stage that only
  // exists on not-yet-loaded rows is still selectable -- falls
  // back to deriving from loaded rows if not provided.
  const stageOptions = currentStageOptions
    ? currentStageOptions.map(l => ({ value: l, label: l, count: activeData.filter(d => d.currentStage === l).length }))
    : Array.from(new Set(activeData.map(c => c.currentStage).filter(Boolean))).map(l => ({ value: l, label: l, count: activeData.filter(d => d.currentStage === l).length }));

  // Item names actually used on enquiries/leads (see useItemNameOptions).
  const itemDropdownOptions = itemOptions.map(n => ({ value: n, label: n }));

  const valueLabel = VALUE_OPTIONS.find(o => o.value === valueFilter)?.label;

  // The quotation-copy filter only applies on the Pending tab.
  const copyActive = activeTab === "pending" && quotationCopyFilter === "blank";
  const activeFilterCount = callingDaysFilter.length + (valueFilter ? 1 : 0) + currentStageFilter.length + itemFilter.length + (copyActive ? 1 : 0);

  const chips = [
    ...(searchTerm ? [{ key: "search", label: `Search: ${searchTerm}`, onRemove: () => setSearchTerm("") }] : []),
    ...chipsForValues("Calling days", callingDaysFilter, callingDaysOptions, setCallingDaysFilter),
    ...(valueFilter ? [{ key: "value", label: valueLabel || valueFilter, onRemove: () => setValueFilter("") }] : []),
    ...chipsForValues("Stage", currentStageFilter, stageOptions, setCurrentStageFilter),
    ...chipsForValues("Item", itemFilter, itemDropdownOptions, setItemFilter),
    ...(copyActive ? [{ key: "copy", label: "Quotation copy: Blank", onRemove: () => setQuotationCopyFilter("") }] : []),
  ];

  const clearAll = () => { setCallingDaysFilter([]); setValueFilter(""); setCurrentStageFilter([]); setItemFilter([]); setQuotationCopyFilter(""); setSearchTerm(""); };

  return (
    <div className="mb-3 flex w-full shrink-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterTabs
          tabs={[
            { id: 'pending', label: 'Pending' },
            { id: 'history', label: 'History' }
          ]}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        <FilterSearch
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search enquiry trackers"
        />

        <button
          type="button"
          onClick={openFilters}
          aria-haspopup="dialog"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeFilterCount}</span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-2">
          {activeTab === "pending" ? (
            <ColumnSelector
              idPrefix="column-pending"
              options={pendingColumnOptions}
              visible={visiblePendingColumns}
              onToggle={handleColumnTogglePending}
              onSelectAll={handleSelectAllPending}
              open={showColumnDropdown}
              onOpenChange={setShowColumnDropdown}
            />
          ) : (
            <ColumnSelector
              idPrefix="column"
              options={columnOptions}
              visible={visibleColumns}
              onToggle={handleColumnToggle}
              onSelectAll={handleSelectAll}
              open={showColumnDropdown}
              onOpenChange={setShowColumnDropdown}
            />
          )}

          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={exporting || exportTotal === 0}
            aria-busy={exporting}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <Download size={16} aria-hidden="true" />}
            {exporting ? `Exporting${exportLoaded ? ` ${exportLoaded.toLocaleString("en-IN")}/${exportTotal.toLocaleString("en-IN")}` : "..."}` : "Export"}
          </button>

          {activeTab !== "history" && setShowNewCallTrackerForm && (
            <button
              type="button"
              className="h-9 shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              onClick={() => setShowNewCallTrackerForm(true)}
            >
              Direct Enquiry
            </button>
          )}
        </div>
      </div>

      <FilterChips chips={chips} onClearAll={clearAll} />

      {exportOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => setExportOpen(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm export"
            className="w-full max-w-sm rounded-xl bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground">Export to CSV</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{exportTotal.toLocaleString("en-IN")}</span> records match the current
              filters. The visible columns will be exported. Are you ready to export?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setExportOpen(false)} className="h-9 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent">
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => { setExportOpen(false); onExport(); }}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      {filterOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => setFilterOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="text-lg font-semibold text-foreground">Filters</h2>
              <button type="button" onClick={() => setFilterOpen(false)} aria-label="Close filters" className="rounded-md p-1 text-muted-foreground hover:bg-accent">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* overflow-visible on >=sm so the dropdown menus aren't clipped */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:overflow-visible">
              <section className="space-y-3 rounded-lg bg-secondary/40 p-3">
                <h3 className="text-sm font-semibold text-foreground">Basic Filters</h3>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Current Stage</label>
                  <SearchableDropdown isMulti options={stageOptions} value={draft.stage} onChange={(v) => setDraft((d) => ({ ...d, stage: v }))} placeholder="Select Stage" className="dropdown-container" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Item</label>
                  <SearchableDropdown isMulti options={itemDropdownOptions} value={draft.item} onChange={(v) => setDraft((d) => ({ ...d, item: v }))} placeholder="Select Item" className="dropdown-container" />
                </div>
                <div>
                  <label htmlFor="enquiry-filter-copy" className="mb-1 block text-xs font-medium text-muted-foreground">Quotation Copy</label>
                  <select
                    id="enquiry-filter-copy"
                    value={draft.copy}
                    disabled={activeTab !== "pending"}
                    onChange={(e) => setDraft((d) => ({ ...d, copy: e.target.value }))}
                    className={`${filterControlClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <option value="">All</option>
                    <option value="blank">Blank (no quotation copy)</option>
                  </select>
                  {activeTab !== "pending" && (
                    <p className="mt-1 text-xs text-muted-foreground">Works on the Pending tab only.</p>
                  )}
                </div>
              </section>

              <section className="space-y-3 rounded-lg bg-secondary/40 p-3">
                <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="flex w-full items-center justify-between text-sm font-semibold text-foreground">
                  More Filters
                  <ChevronDown size={16} className={moreOpen ? "rotate-180" : ""} aria-hidden="true" />
                </button>
                {moreOpen && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Calling Days</label>
                      <SearchableDropdown isMulti options={callingDaysOptions} value={draft.callingDays} onChange={(v) => setDraft((d) => ({ ...d, callingDays: v }))} placeholder="Calling Days" className="dropdown-container" />
                    </div>
                    <div>
                      <label htmlFor="enquiry-filter-value" className="mb-1 block text-xs font-medium text-muted-foreground">Value</label>
                      <select
                        id="enquiry-filter-value"
                        value={draft.value}
                        onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                        className={filterControlClass}
                      >
                        {VALUE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                      </select>
                    </div>
                  </>
                )}
              </section>
            </div>

            <div className="flex items-center justify-between border-t px-5 py-3">
              <button
                type="button"
                onClick={() => { setDraft(EMPTY_DRAFT); setCallingDaysFilter([]); setValueFilter(""); setCurrentStageFilter([]); setItemFilter([]); setQuotationCopyFilter(""); setFilterOpen(false); }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Clear All
              </button>
              <button type="button" onClick={applyDraft} className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnquiryTrackerFilter;
