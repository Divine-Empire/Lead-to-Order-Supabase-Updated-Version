import React from 'react';
import FilterTabs from "../FilterTabs";
import SearchableDropdown from "../SearchableDropdown";
import ColumnSelector from "../ColumnSelector";
import { FilterSearch, FilterChips, chipsForValues } from "../FilterBar";

const CallTrackerFilter = ({
  activeTab, setActiveTab,
  searchTerm, setSearchTerm,
  dateFilter, setDateFilter,
  dateFilterCounts,
  filterType, setFilterType,
  showColumnDropdown, setShowColumnDropdown,
  visibleColumns, handleSelectAll, handleColumnToggle, columnOptions,
  visibleColumnsPending, handleSelectAllPending, handleColumnTogglePending, columnOptionsPending,
  pendingFollowUps
}) => {
  const dateOptions = activeTab === "pending" ? [
    { value: "today", label: "Today", count: dateFilterCounts?.today || 0 },
    { value: "overdue", label: "Overdue", count: dateFilterCounts?.overdue || 0 },
    { value: "first-call-pending", label: "First Call Pending", count: dateFilterCounts?.firstCallPending || 0 },
    { value: "upcoming", label: "Upcoming", count: dateFilterCounts?.upcoming || 0 },
    { value: "assigned-today", label: "Assigned Today", count: dateFilterCounts?.assignedToday || 0 }
  ] : [
    { value: "today", label: "Today's Calls", count: dateFilterCounts?.today || 0 },
    { value: "older", label: "Older Calls", count: dateFilterCounts?.older || 0 }
  ];

  const typeOptions = [
    { value: "first", label: "First Followup", count: pendingFollowUps.filter(f => !f.enquiryStatus).length },
    { value: "multi", label: "Expected", count: pendingFollowUps.filter(f => f.enquiryStatus === "expected").length },
    { value: "lost", label: "Lost", count: pendingFollowUps.filter(f => f.enquiryStatus === "not-interested").length }
  ];

  const chips = [
    ...(searchTerm ? [{ key: "search", label: `Search: ${searchTerm}`, onRemove: () => setSearchTerm("") }] : []),
    ...chipsForValues("Date", dateFilter, dateOptions, setDateFilter),
    ...(activeTab === "history" ? chipsForValues("Type", filterType, typeOptions, setFilterType) : []),
  ];

  const clearAll = () => {
    setDateFilter([])
    setFilterType([])
    setSearchTerm("")
  };

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
          placeholder="Search by company, person, or phone"
          className="min-w-[200px]"
        />

        <div className="z-[130] min-w-[150px] flex-1 sm:max-w-[220px]">
          <SearchableDropdown
            isMulti={true}
            value={dateFilter}
            onChange={(val) => setDateFilter(val)}
            options={dateOptions}
            placeholder="All Dates"
            className="dropdown-container"
          />
        </div>

        {activeTab === "history" && (
          <div className="z-[120] min-w-[150px] flex-1 sm:max-w-[220px]">
            <SearchableDropdown
              isMulti={true}
              value={filterType}
              onChange={(val) => setFilterType(val)}
              options={typeOptions}
              placeholder="All Types"
              className="dropdown-container"
            />
          </div>
        )}

        <div className="ml-auto z-[110]">
          {activeTab === "pending" ? (
            <ColumnSelector
              idPrefix="column-pending"
              options={columnOptionsPending}
              visible={visibleColumnsPending}
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
        </div>
      </div>

      <FilterChips chips={chips} onClearAll={clearAll} />
    </div>
  );
};

export default CallTrackerFilter;
