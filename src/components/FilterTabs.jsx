import React from 'react';
import StatusTabs from './StatusTabs';

// Kept for existing call sites (CallTrackerFilter, EnquiryTrackerFilter);
// the look and behaviour now come from the shared StatusTabs.
const FilterTabs = ({ tabs, activeTab, setActiveTab }) => (
  <StatusTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} variant="segmented" />
);

export default FilterTabs;
