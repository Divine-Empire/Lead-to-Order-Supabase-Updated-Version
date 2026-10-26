"use client";

const TermsAndConditions = ({
  quotationData,
  handleInputChange,
  hiddenFields,
  toggleFieldVisibility,
}) => {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-medium mb-4">Terms & Conditions</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries({
          validity: "Validity",
          paymentTerms: "Payment Terms",
          delivery: "Delivery",
          freight: "Freight",
          insurance: "Insurance",
          taxes: "Taxes",
          warranty: "Warranty",
          afterReceiptOfMaterial: "After Receipt of Material",
          technicalSupport: "Technical Support",
        }).map(([field, label]) => (
          <div key={field} className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-medium">{label}</label>
              <button
                type="button"
                onClick={() => toggleFieldVisibility(field)}
                className="text-xs text-primary hover:opacity-80"
              >
                {hiddenFields[field] ? "Show" : "Hide"}
              </button>
            </div>
            {!hiddenFields[field] && (
              field === "warranty" ? (
                <div className="space-y-2">
                  <select
                    value={quotationData[field] || "The equipment is warranted against manufacturing defects for a period of 6 months from the date of invoice. An unconditional warranty of 1 month is provided, during which service and spare parts will be provided free of charge."}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md bg-white text-sm"
                  >
                    <option value="The equipment is warranted against manufacturing defects for a period of 6 months from the date of invoice. An unconditional warranty of 1 month is provided, during which service and spare parts will be provided free of charge.">
                      Standard 6 Months Warranty
                    </option>
                    <option value="The equipment is warranted against manufacturing defects for a period of 12 months from the date of invoice. whichever is earlier. The rubber parts, wire rope and electric components are not covered under this warranty. Warranty is specifically for manufacturing defects only.">
                      Extended 12 Months Warranty (Detailed)
                    </option>
                  </select>
                  <textarea
                    value={quotationData[field] || ""}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    rows={4}
                    className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 text-xs"
                    placeholder="Enter warranty details"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={quotationData[field] || 
                    (field === 'freight' ? 'Extra as per actual' : 
                     field === 'taxes' ? 'Extra as per actual.' :
                     '')}
                  onChange={(e) => handleInputChange(field, e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  placeholder={field === 'freight' ? 'Enter freight details' : 
                             field === 'taxes' ? 'Enter tax details' :
                             ''}
                />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TermsAndConditions;
