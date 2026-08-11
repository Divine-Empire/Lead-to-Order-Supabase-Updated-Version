import React from 'react';

const FilterTabs = ({ tabs, activeTab, setActiveTab }) => {
  return (
    <div className="inline-flex h-9 rounded-md shadow-sm shrink-0 bg-white items-stretch">
      {tabs.map((tab, index) => {
        const isFirst = index === 0;
        const isLast = index === tabs.length - 1;
        const isActive = activeTab === tab.id;

        // Base classes that apply to all tabs
        let className = "px-4 text-sm font-medium border-gray-200 transition-colors ";

        // Determine border logic to prevent double borders
        if (isFirst) {
          className += "border rounded-l-md ";
        } else if (isLast) {
          className += "border-t border-b border-r rounded-r-md ";
        } else {
          className += "border-t border-b border-r ";
        }

        // Active vs Inactive styles
        if (isActive) {
          className += "bg-sky-100 text-sky-800 border-sky-200 z-10 ";
        } else {
          className += "bg-white text-slate-700 hover:bg-slate-50 ";
        }

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={className}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default FilterTabs;
