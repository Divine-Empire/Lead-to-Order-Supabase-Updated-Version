import React from 'react';
import FilterTabs from "../FilterTabs";
import SearchableDropdown from "../SearchableDropdown";
import ColumnSelector from "../ColumnSelector";
import { FilterSearch, FilterChips, chipsForValues, filterControlClass } from "../FilterBar";

const VALUE_OPTIONS = [
  { value: "", label: "Value: All" },
  { value: "gte100000", label: "Value greater than 1,00,000" },
  { value: "lt100000", label: "Value less than 1,00,000" },
];

const EnquiryTrackerFilter = ({
  activeTab, setActiveTab,
  searchTerm, setSearchTerm,
  callingDaysFilter, setCallingDaysFilter,
  valueFilter, setValueFilter,
  currentStageFilter, setCurrentStageFilter,
  filterCounts,
  showColumnDropdown, setShowColumnDropdown,
  visibleColumns, handleSelectAll, handleColumnToggle, columnOptions,
  visiblePendingColumns = {}, handleSelectAllPending = () => {}, handleColumnTogglePending = () => {}, pendingColumnOptions = [],
  setShowNewCallTrackerForm,
  pendingCallTrackers = [],
  historyCallTrackers = [],
  currentStageOptions = null,
}) => {
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

  const valueLabel = VALUE_OPTIONS.find(o => o.value === valueFilter)?.label;

  const chips = [
    ...(searchTerm ? [{ key: "search", label: `Search: ${searchTerm}`, onRemove: () => setSearchTerm("") }] : []),
    ...chipsForValues("Calling days", callingDaysFilter, callingDaysOptions, setCallingDaysFilter),
    ...(valueFilter ? [{ key: "value", label: valueLabel || valueFilter, onRemove: () => setValueFilter("") }] : []),
    ...chipsForValues("Stage", currentStageFilter, stageOptions, setCurrentStageFilter),
  ];

  const clearAll = () => { setCallingDaysFilter([]); setValueFilter(""); setCurrentStageFilter([]); setSearchTerm(""); };

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

        <div className="z-[60] min-w-[150px] flex-1 sm:max-w-[200px]">
          <SearchableDropdown
            isMulti={true}
            options={callingDaysOptions}
            value={callingDaysFilter}
            onChange={setCallingDaysFilter}
            placeholder="Calling Days"
            className="dropdown-container"
          />
        </div>

        <div className="z-[50] min-w-[150px] flex-1 sm:max-w-[220px]">
          <select
            value={valueFilter}
            onChange={(e) => setValueFilter(e.target.value)}
            aria-label="Filter by value"
            className={`${filterControlClass} ${valueFilter ? 'border-brand-300 bg-brand-50' : ''}`}
          >
            {VALUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="z-[40] min-w-[150px] flex-1 sm:max-w-[220px]">
          <SearchableDropdown
            isMulti={true}
            options={stageOptions}
            value={currentStageFilter}
            onChange={setCurrentStageFilter}
            placeholder="Current Stage"
            className="dropdown-container"
          />
        </div>

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
    </div>
  );
};

export default EnquiryTrackerFilter;
