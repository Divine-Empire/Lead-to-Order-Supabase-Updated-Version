"use client"

const ConsignorDetails = ({
  quotationData,
  handleInputChange,
  referenceOptions,
  selectedReferences,
  setSelectedReferences,
  dropdownData,
}) => {
  return (
    <>
      <h3 className="text-lg font-medium mt-6 mb-4">Consignor Details</h3>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Reference Name</label>

          <div className="flex flex-wrap gap-2 mb-2">
            {selectedReferences.map((ref) => (
              <div key={ref} className="flex items-center bg-primary/10 text-primary px-2 py-1 rounded-md text-sm">
                {ref}
                <button
                  type="button"
                  onClick={() => {
                    const updated = selectedReferences.filter((r) => r !== ref)
                    setSelectedReferences(updated)
                    
                    // FIX: Update consignorName properly
                    const newConsignorName = updated.join(", ")
                    handleInputChange("consignorName", newConsignorName)

                    if (updated.length > 0 && dropdownData.references) {
                      const mobileNumbers = updated.map((r) => dropdownData.references[r]?.mobile).filter(Boolean)
                      const phoneNumbers = updated.map((r) => dropdownData.references[r]?.phone).filter(Boolean)
                      handleInputChange("consignorMobile", mobileNumbers.join(", "))
                      handleInputChange("consignorPhone", phoneNumbers.join(", "))
                    } else {
                      handleInputChange("consignorMobile", "")
                      handleInputChange("consignorPhone", "")
                    }
                  }}
                  className="ml-1 text-primary hover:text-primary"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <select
            value=""
            onChange={(e) => {
              const selectedRef = e.target.value
              if (selectedRef && !selectedReferences.includes(selectedRef)) {
                const updated = [...selectedReferences, selectedRef]
                setSelectedReferences(updated)
                
                // FIX: Update consignorName properly AFTER state update
                const newConsignorName = updated.join(", ")
                handleInputChange("consignorName", newConsignorName)

                if (dropdownData.references && dropdownData.references[selectedRef]) {
                  const mobileNumbers = updated.map((ref) => dropdownData.references[ref]?.mobile).filter(Boolean)
                  const phoneNumbers = updated.map((ref) => dropdownData.references[ref]?.phone).filter(Boolean)
                  handleInputChange("consignorMobile", mobileNumbers.join(", "))
                  handleInputChange("consignorPhone", phoneNumbers.join(", "))
                }
              }
            }}
            className="w-full p-2 border border-gray-300 rounded-md"
          >
            <option value="">Select Reference</option>
            {referenceOptions
              .filter((option) => option !== "Select Reference" && !selectedReferences.includes(option))
              .map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Address</label>
          <textarea
            value={quotationData.consignorAddress}
            onChange={(e) => handleInputChange("consignorAddress", e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md"
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Mobile</label>
            <input
              type="text"
              value={quotationData.consignorMobile}
              onChange={(e) => handleInputChange("consignorMobile", e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Phone</label>
            <input
              type="text"
              value={quotationData.consignorPhone || "0771-490-0515"}
              readOnly
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">GSTIN</label>
            <input
              type="text"
              value={quotationData.consignorGSTIN}
              onChange={(e) => handleInputChange("consignorGSTIN", e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">State Code</label>
            <input
              type="text"
              value={quotationData.consignorStateCode}
              onChange={(e) => handleInputChange("consignorStateCode", e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">MSME No.</label>
          <input
            type="text"
            value={quotationData.msmeNumber || ""}
            onChange={(e) => handleInputChange("msmeNumber", e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>
    </>
  )
}

export default ConsignorDetails
