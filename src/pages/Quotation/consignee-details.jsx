"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

const ConsigneeDetails = ({
  quotationData,
  handleInputChange,
  companyOptions,
  dropdownData,
  onAutoFillItems,
  showLeadNoDropdown,
  setShowLeadNoDropdown,
  leadNoOptions,
  onSearchLeadNo,
  handleLeadNoSelect,
}) => {
  // ── Lead No. combobox state ────────────────────────────────────────────
  // `leadNoOptions` is the initial "latest 25 pending leads + 25 pending
  // enquiries" list from the parent. Once the user types, we debounce and
  // query the DB directly (onSearchLeadNo) instead of filtering a giant
  // preloaded list -- see quotation-form.jsx's searchLeadNumbers.
  const [isLeadNoOpen, setIsLeadNoOpen] = useState(false)
  const [leadNoSuggestions, setLeadNoSuggestions] = useState(leadNoOptions || [])
  const [isSearchingLeadNo, setIsSearchingLeadNo] = useState(false)
  const leadNoWrapperRef = useRef(null)
  const leadNoDebounceRef = useRef(null)
  const leadNoInputValue = quotationData.enquiryReferenceNo || ""

  // Keep the shown suggestions in sync with the initial pending list while
  // the field is empty (e.g. once the async initial load resolves).
  useEffect(() => {
    if (!leadNoInputValue.trim()) {
      setLeadNoSuggestions(leadNoOptions || [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadNoOptions])

  // Close the suggestion panel on outside click.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (leadNoWrapperRef.current && !leadNoWrapperRef.current.contains(event.target)) {
        setIsLeadNoOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    return () => {
      if (leadNoDebounceRef.current) clearTimeout(leadNoDebounceRef.current)
    }
  }, [])
  const handleCompanyChange = async (e) => {
    const selectedCompany = e.target.value
    handleInputChange("consigneeName", selectedCompany)

    if (selectedCompany && dropdownData.companies && dropdownData.companies[selectedCompany]) {
      const companyDetails = dropdownData.companies[selectedCompany]

      handleInputChange("consigneeAddress", companyDetails.address)
      handleInputChange("consigneeState", companyDetails.state)
      handleInputChange("consigneeContactName", companyDetails.contactName)
      handleInputChange("consigneeContactNo", companyDetails.contactNo)
      handleInputChange("consigneeGSTIN", companyDetails.gstin)
      handleInputChange("consigneeStateCode", companyDetails.stateCode)

      // Get company prefix and update quotation number
      // try {
      //   const companyPrefix = await getCompanyPrefix(selectedCompany)
      //   const newQuotationNumber = await getNextQuotationNumber(companyPrefix)

      //   if (onQuotationNumberUpdate) {
      //     onQuotationNumberUpdate(newQuotationNumber)
      //   }
      // } catch (error) {
      //   console.error("Error updating quotation number:", error)
      // }

      // Auto-fill items based on company selection
      if (onAutoFillItems) {
        try {
          await onAutoFillItems(selectedCompany)
        } catch (error) {
          console.error("Error auto-filling items:", error)
        }
      }
    } else {
      handleInputChange("consigneeAddress", "")
      handleInputChange("consigneeState", "")
      handleInputChange("consigneeContactName", "")
      handleInputChange("consigneeContactNo", "")
      handleInputChange("consigneeGSTIN", "")
      handleInputChange("consigneeStateCode", "")
    }
  }

  const handleLeadNoInputChange = (e) => {
    const typedValue = e.target.value
    handleInputChange("enquiryReferenceNo", typedValue)
    setIsLeadNoOpen(true)

    if (leadNoDebounceRef.current) clearTimeout(leadNoDebounceRef.current)
    const trimmed = typedValue.trim()

    if (!trimmed) {
      setIsSearchingLeadNo(false)
      setLeadNoSuggestions(leadNoOptions || [])
      return
    }

    leadNoDebounceRef.current = setTimeout(async () => {
      if (!onSearchLeadNo) return
      setIsSearchingLeadNo(true)
      try {
        const results = await onSearchLeadNo(trimmed)
        setLeadNoSuggestions(results === null ? (leadNoOptions || []) : results)
      } finally {
        setIsSearchingLeadNo(false)
      }
    }, 350)
  }

  const handleLeadNoOptionPick = (option) => {
    handleInputChange("enquiryReferenceNo", option.value)
    setIsLeadNoOpen(false)
    if (handleLeadNoSelect) {
      handleLeadNoSelect(option.value, option)
    }
  }

  // Enter/blur: if the typed text exactly matches a currently-shown
  // suggestion, treat it the same as clicking that suggestion.
  const commitLeadNoIfExactMatch = () => {
    const match = leadNoSuggestions.find((opt) => opt.value === leadNoInputValue)
    if (match && handleLeadNoSelect) {
      handleLeadNoSelect(match.value, match)
    }
  }

  const handleLeadNoKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      commitLeadNoIfExactMatch()
      setIsLeadNoOpen(false)
    } else if (e.key === "Escape") {
      setIsLeadNoOpen(false)
    }
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Consignee Details</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLeadNoDropdown(!showLeadNoDropdown)}
            className="px-3 py-1 text-sm bg-primary text-white rounded hover:opacity-90"
          >
            {showLeadNoDropdown ? "Remove" : "Show"} Lead No.
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {showLeadNoDropdown && (
          <div className="space-y-2 p-3 bg-gray-50 rounded-md">
            <label className="block text-sm font-medium">Lead No.</label>
            <div className="relative" ref={leadNoWrapperRef}>
              <div className="relative">
                <input
                  type="text"
                  value={leadNoInputValue}
                  onChange={handleLeadNoInputChange}
                  onFocus={() => setIsLeadNoOpen(true)}
                  onKeyDown={handleLeadNoKeyDown}
                  onBlur={() => {
                    // Slight delay so a click on a suggestion registers first.
                    setTimeout(() => commitLeadNoIfExactMatch(), 100)
                  }}
                  className="w-full p-2 pr-8 border border-gray-300 rounded-md"
                  placeholder="Select or type a pending lead/enquiry number"
                  autoComplete="off"
                />
                {isSearchingLeadNo && (
                  <Loader2 size={16} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-primary" />
                )}
              </div>

              {isLeadNoOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-56 overflow-y-auto">
                  {leadNoSuggestions.length > 0 ? (
                    leadNoSuggestions.map((option) => (
                      <div
                        key={option.value}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleLeadNoOptionPick(option)}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{option.label}</span>
                        <span className="text-xs text-gray-400 shrink-0 uppercase">{option.sourceType}</span>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-400 italic">
                      {isSearchingLeadNo ? "Searching…" : "No pending matches found"}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400">Showing pending leads/enquiries only. Type to search all pending records.</p>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium">Company Name <span className="text-destructive">*</span></label>
          <input
            list="companyOptions"
            value={quotationData.consigneeName}
            onChange={handleCompanyChange}
            className="w-full p-2 border border-gray-300 rounded-md"
            required
          />
          <datalist id="companyOptions">
            {companyOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Address</label>
          <textarea
            value={quotationData.consigneeAddress}
            onChange={(e) => handleInputChange("consigneeAddress", e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md"
            rows={3}
            placeholder="Enter address"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Ship To</label>
          <textarea
            value={quotationData.shipTo || ""}
            onChange={(e) => handleInputChange("shipTo", e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md"
            rows={3}
            placeholder="Enter shipping address if different from billing address"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">State</label>
          <input
            type="text"
            value={quotationData.consigneeState}
            onChange={(e) => handleInputChange("consigneeState", e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md"
            placeholder="Enter State"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Contact Name</label>
            <input
              type="text"
              value={quotationData.consigneeContactName}
              onChange={(e) => handleInputChange("consigneeContactName", e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Contact No.</label>
            <input
              type="text"
              value={quotationData.consigneeContactNo}
              onChange={(e) => handleInputChange("consigneeContactNo", e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">GSTIN</label>
            <input
              type="text"
              value={quotationData.consigneeGSTIN}
              onChange={(e) => handleInputChange("consigneeGSTIN", e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">State Code</label>
            <input
              type="text"
              value={quotationData.consigneeStateCode}
              onChange={(e) => handleInputChange("consigneeStateCode", e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>
      </div>
    </>
  )
}

export default ConsigneeDetails
