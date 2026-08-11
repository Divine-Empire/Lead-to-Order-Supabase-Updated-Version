"use client";

import { useState, useEffect } from 'react'; // ← useEffect add करें

const QuotationDetails = ({
  quotationData,
  handleInputChange,
  isRevising,
  existingQuotations,
  selectedQuotation,
  handleQuotationSelect,
  isLoadingQuotation,
  preparedByOptions,
  stateOptions,
  dropdownData,
  onQuotationSearch,
  onLoadMoreQuotations,
  hasMoreQuotations,
  isFetchingMore,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  // ← Add these useEffects after useState declarations
useEffect(() => {
  if (selectedQuotation && isRevising) {
    setSearchTerm(selectedQuotation);
  } else if (!isRevising) {
    setSearchTerm(''); // Clear search when not revising
  }
}, [selectedQuotation, isRevising]);
  const handleStateChange = (e) => {
    const selectedState = e.target.value;
    handleInputChange("consignorState", selectedState);

    if (
      selectedState &&
      dropdownData.states &&
      dropdownData.states[selectedState]
    ) {
      const stateDetails = dropdownData.states[selectedState];

      if (stateDetails.bankDetails) {
        const bankDetailsText = stateDetails.bankDetails;

        const accountNoMatch = bankDetailsText.match(/Account No\.: ([^\n]+)/);
        const bankNameMatch = bankDetailsText.match(/Bank Name: ([^\n]+)/);
        const bankAddressMatch = bankDetailsText.match(
          /Bank Address: ([^\n]+)/
        );
        const ifscMatch = bankDetailsText.match(/IFSC CODE: ([^\n]+)/);
        const emailMatch = bankDetailsText.match(/Email: ([^\n]+)/);
        const websiteMatch = bankDetailsText.match(/Website: ([^\n]+)/);

        if (accountNoMatch) handleInputChange("accountNo", accountNoMatch[1]);
        if (bankNameMatch) handleInputChange("bankName", bankNameMatch[1]);
        if (bankAddressMatch)
          handleInputChange("bankAddress", bankAddressMatch[1]);
        if (ifscMatch) handleInputChange("ifscCode", ifscMatch[1]);
        if (emailMatch) handleInputChange("email", emailMatch[1]);
        if (websiteMatch) handleInputChange("website", websiteMatch[1]);
      }

      if (stateDetails.consignerAddress) {
        handleInputChange("consignorAddress", stateDetails.consignerAddress);
      }

      if (stateDetails.stateCode) {
        handleInputChange("consignorStateCode", stateDetails.stateCode);
      }

      if (stateDetails.gstin) {
        handleInputChange("consignorGSTIN", stateDetails.gstin);
      }

      if (stateDetails.msmeNumber) {
        handleInputChange("msmeNumber", stateDetails.msmeNumber);
      }

      if (stateDetails.pan) {
        handleInputChange("pan", stateDetails.pan);
      }
    } else {
      handleInputChange("accountNo", "");
      handleInputChange("bankName", "");
      handleInputChange("bankAddress", "");
      handleInputChange("ifscCode", "");
      handleInputChange("email", "");
      handleInputChange("website", "");
      handleInputChange("pan", "");
      handleInputChange("consignorAddress", "");
      handleInputChange("consignorStateCode", "");
      handleInputChange("consignorGSTIN", "");
      handleInputChange("msmeNumber", "");
    }
  };

  // ← Add this new function after handleStateChange
const handleQuotationSelection = (quotation) => {
  setSearchTerm(quotation); // Show selected quotation in field
  setIsDropdownOpen(false);
  handleQuotationSelect(quotation); // This will load data and update quotationData.quotationNo
};

const clearSelection = () => {
  setSearchTerm('');
  setIsDropdownOpen(false);
  // Reset search to empty to load latest batch
  onQuotationSearch("");
  handleInputChange('quotationNo', '');
};

const handleScroll = (e) => {
  const { scrollTop, scrollHeight, clientHeight } = e.target;
  // Trigger load more when 20px from bottom
  if (scrollHeight - scrollTop <= clientHeight + 20) {
    onLoadMoreQuotations();
  }
};


  return (
    <>
      <h3 className="text-lg font-medium mb-4">Quotation Details</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Quotation No.</label>
            {isRevising ? (
              <div className="relative">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search quotation number..."
                    value={searchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchTerm(value);
                      onQuotationSearch(value);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                   {searchTerm && (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  )}
                </div>
                                {isDropdownOpen && (
                  <div 
                    className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
                    onScroll={handleScroll}
                  >
                    {existingQuotations && existingQuotations.length > 0 ? (
                      <>
                        {existingQuotations.map((quotation) => (
                          <div 
                            key={quotation}
                            className={`p-2 hover:bg-gray-100 cursor-pointer ${
                              selectedQuotation === quotation ? 'bg-primary/10' : ''
                            }`}                            
                            onMouseDown={() => handleQuotationSelection(quotation)}
                          >
                            {quotation}
                          </div>
                        ))}
                        {isFetchingMore && (
                          <div className="p-2 text-center">
                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                          </div>
                        )}
                        {!hasMoreQuotations && existingQuotations.length > 0 && (
                          <div className="p-2 text-center text-xs text-gray-400">
                            No more quotations to load
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-2 text-gray-500">
                        {isLoadingQuotation ? 'Loading...' : 'No quotations found'}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Hidden select for form submission */}
                <select
                  value={selectedQuotation}
                  onChange={(e) => handleQuotationSelect(e.target.value)}
                  className="hidden"
                >
                  <option value="">Select Quotation to Revise</option>
                  {existingQuotations && existingQuotations.map((quotation) => (
                    <option key={quotation} value={quotation}>
                      {quotation}
                    </option>
                  ))}
                </select>
                              {isLoadingQuotation && (
                <div className="absolute right-2 top-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              </div>
            ) : (
              <input
                type="text"
                value={quotationData.quotationNo}
                readOnly
                className="w-full p-2 border border-gray-300 rounded-md bg-gray-50"
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Date</label>
            <input
              type="date"
              value={quotationData.date.split("/").reverse().join("-")}
              onChange={(e) => {
                const dateValue = e.target.value;
                if (dateValue) {
                  const [year, month, day] = dateValue.split("-");
                  handleInputChange("date", `${day}/${month}/${year}`);
                }
              }}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Prepared By <span className="text-destructive">*</span></label>
          <input
            type="text"
            list="preparedByList"
            value={quotationData.preparedBy}
            onChange={(e) => handleInputChange("preparedBy", e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md"
            placeholder="Enter or select the name of the person preparing this quotation"
            required
          />
          <datalist id="preparedByList">
            {preparedByOptions.map((name, idx) => (
              <option key={idx} value={name} />
            ))}
          </datalist>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">State</label>
          <select
            value={quotationData.consignorState}
            onChange={handleStateChange}
            className="w-full p-2 border border-gray-300 rounded-md"
          >
            {stateOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
};

export default QuotationDetails;
