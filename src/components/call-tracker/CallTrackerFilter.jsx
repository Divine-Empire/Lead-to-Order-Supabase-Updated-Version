import React from 'react';
import { SearchIcon } from "../Icons";
import FilterTabs from "../FilterTabs";
import SearchableDropdown from "../SearchableDropdown";

const CallTrackerFilter = ({
  activeTab, setActiveTab,
  searchTerm, setSearchTerm,
  companyFilter, setCompanyFilter,
  personFilter, setPersonFilter,
  phoneFilter, setPhoneFilter,
  dateFilter, setDateFilter,
  dateFilterCounts,
  filterType, setFilterType,
  showColumnDropdown, setShowColumnDropdown,
  visibleColumns, handleSelectAll, handleColumnToggle, columnOptions,
  visibleColumnsPending, handleSelectAllPending, handleColumnTogglePending, columnOptionsPending,
  pendingFollowUps
}) => {
  return (
    <div className="flex flex-nowrap items-center gap-2 mb-2 shrink-0 pb-1 w-full">
      <FilterTabs 
        tabs={[
          { id: 'pending', label: 'Pending' },
          { id: 'history', label: 'History' }
        ]}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <div className="flex gap-1.5 flex-nowrap items-center flex-1 min-w-0">
        <div className="relative flex-1 min-w-[120px]">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="search"
            placeholder="Search Call Tracker..."
            className="pl-8 w-full px-3 h-9 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {activeTab === "pending" && (
          <>
            <div className="flex-1 min-w-[100px] z-[160]">
              <SearchableDropdown
                isMulti={true}
                value={companyFilter}
                onChange={(val) => setCompanyFilter(val)}
                options={Array.from(new Set(pendingFollowUps.map(c => c.companyName).filter(Boolean))).map(l => ({ value: l, label: l, count: pendingFollowUps.filter(d => d.companyName === l).length }))}
                placeholder="All Companies"
                height="h-9"
                rounded="rounded-md"
                className="dropdown-container"
              />
            </div>

            <div className="flex-1 min-w-[100px] z-[150]">
              <SearchableDropdown
                isMulti={true}
                value={personFilter}
                onChange={(val) => setPersonFilter(val)}
                options={Array.from(new Set(pendingFollowUps.map(c => c.personName).filter(Boolean))).map(l => ({ value: l, label: l, count: pendingFollowUps.filter(d => d.personName === l).length }))}
                placeholder="All Persons"
                height="h-9"
                rounded="rounded-md"
                className="dropdown-container"
              />
            </div>

            <div className="flex-1 min-w-[100px] z-[140]">
              <SearchableDropdown
                isMulti={true}
                value={phoneFilter}
                onChange={(val) => setPhoneFilter(val)}
                options={Array.from(new Set(pendingFollowUps.map(c => c.phoneNumber).filter(Boolean))).map(l => ({ value: l, label: l, count: pendingFollowUps.filter(d => d.phoneNumber === l).length }))}
                placeholder="All Numbers"
                height="h-9"
                rounded="rounded-md"
                className="dropdown-container"
              />
            </div>
          </>
        )}

        <div className="flex-1 min-w-[100px] z-[130]">
          <SearchableDropdown
            isMulti={true}
            value={dateFilter}
            onChange={(val) => setDateFilter(val)}
            options={activeTab === "pending" ? [
              { value: "today", label: "Today", count: dateFilterCounts?.today || 0 },
              { value: "overdue", label: "Overdue", count: dateFilterCounts?.overdue || 0 },
              { value: "upcoming", label: "Upcoming", count: dateFilterCounts?.upcoming || 0 }
            ] : [
              { value: "today", label: "Today's Calls", count: dateFilterCounts?.today || 0 },
              { value: "older", label: "Older Calls", count: dateFilterCounts?.older || 0 }
            ]}
            placeholder="All Dates"
            height="h-9"
            rounded="rounded-md"
            className="dropdown-container"
          />
        </div>

        {activeTab === "pending" ? (
          <div className="relative dropdown-container flex-1 min-w-[100px] z-[120]">
            <button
              onClick={() => setShowColumnDropdown(!showColumnDropdown)}
              className="w-full h-9 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white flex justify-between items-center text-sm"
            >
              <span>Select Columns</span>
              <svg
                className={`w-4 h-4 ml-2 transition-transform ${showColumnDropdown ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showColumnDropdown && (
              <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="p-2">
                  <div className="flex items-center p-2 hover:bg-gray-50 rounded">
                    <input
                      type="checkbox"
                      id="select-all-pending"
                      checked={Object.values(visibleColumnsPending).every(Boolean)}
                      onChange={handleSelectAllPending}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor="select-all-pending" className="ml-2 text-sm font-medium text-gray-900 cursor-pointer">
                      All Columns
                    </label>
                  </div>

                  <hr className="my-2" />

                  {columnOptionsPending.map((option) => (
                    <div key={option.key} className="flex items-center p-2 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        id={`column-pending-${option.key}`}
                        checked={visibleColumnsPending[option.key]}
                        onChange={() => handleColumnTogglePending(option.key)}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                      <label htmlFor={`column-pending-${option.key}`} className="ml-2 text-sm text-gray-700 cursor-pointer flex-1">
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 min-w-[100px] z-[120]">
            <SearchableDropdown
              isMulti={true}
              value={filterType}
              onChange={(val) => setFilterType(val)}
              options={[
                { value: "first", label: "First Followup", count: pendingFollowUps.filter(f => !f.enquiryStatus).length },
                { value: "multi", label: "Expected", count: pendingFollowUps.filter(f => f.enquiryStatus === "expected").length }
              ]}
              placeholder="All Types"
              height="h-9"
              rounded="rounded-md"
              className="dropdown-container"
            />
          </div>
        )}

        {activeTab === "history" && (
          <div className="relative dropdown-container shrink-0 z-[110]">
            <button
              onClick={() => setShowColumnDropdown(!showColumnDropdown)}
              className="px-3 h-9 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white flex items-center text-sm"
            >
              <span>Select Columns</span>
              <svg
                className={`w-4 h-4 ml-2 transition-transform ${showColumnDropdown ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showColumnDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="p-2">
                  <div className="flex items-center p-2 hover:bg-gray-50 rounded">
                    <input
                      type="checkbox"
                      id="select-all"
                      checked={Object.values(visibleColumns).every(Boolean)}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor="select-all" className="ml-2 text-sm font-medium text-gray-900 cursor-pointer">
                      All Columns
                    </label>
                  </div>
                  <hr className="my-2" />
                  {columnOptions.map((option) => (
                    <div key={option.key} className="flex items-center p-2 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        id={`column-${option.key}`}
                        checked={visibleColumns[option.key]}
                        onChange={() => handleColumnToggle(option.key)}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                      <label htmlFor={`column-${option.key}`} className="ml-2 text-sm text-gray-700 cursor-pointer flex-1">
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {((companyFilter && companyFilter.length > 0) || (personFilter && personFilter.length > 0) || (phoneFilter && phoneFilter.length > 0) || (dateFilter && dateFilter.length > 0) || (filterType && filterType.length > 0)) && (
          <button
            className="px-3 h-9 text-sm text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-md transition-colors shrink-0"
            onClick={() => {
              setCompanyFilter([])
              setPersonFilter([])
              setPhoneFilter([])
              setDateFilter([])
              setFilterType([])
              setSearchTerm("")
            }}
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
};

export default CallTrackerFilter;
