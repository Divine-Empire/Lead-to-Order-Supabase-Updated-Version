import { useState, useEffect } from "react"
import supabase from "../../utils/supabase"
import { compressImageFile, validateFileSize } from "../../utils/imageCompression"

function OrderStatusForm({ formData, onFieldChange, enquiryNo, activeTab }) {
  const [orderStatus, setOrderStatus] = useState(formData.orderStatus || "")
  const [acceptanceViaOptions, setAcceptanceViaOptions] = useState(["email", "phone", "in-person", "other"])
  const [paymentModeOptions, setPaymentModeOptions] = useState(["cash", "check", "bank-transfer", "credit-card"])
  const [reasonStatusOptions, setReasonStatusOptions] = useState([])
  const [paymentTermsOptions, setPaymentTermsOptions] = useState(["30", "45", "60", "90"])
  const [conveyedOptions, setConveyedOptions] = useState(["Yes", "No"])
  const [orderVideoError, setOrderVideoError] = useState("")
  const [acceptanceFileError, setAcceptanceFileError] = useState("")
  const [transportModeOptions, setTransportModeOptions] = useState(["Road", "Air", "Sea", "Rail"])
  const [quotationNumbers, setQuotationNumbers] = useState([])
  const [isLoadingQuotations, setIsLoadingQuotations] = useState(false)
  const [creditDaysOptions, setCreditDaysOptions] = useState(["30", "45", "60", "90"])
  const [approvedByOptions, setApprovedByOptions] = useState([])

  // State for items fetched from Make_Quotation table
  const [quotationItems, setQuotationItems] = useState([])
  const [isLoadingItems, setIsLoadingItems] = useState(false)

  // Helper for normalized dropdown table: fetch values for a given category
  const fetchCategory = (category) =>
    supabase.from("lto_dropdown").select("value").eq("category", category);

  // Fetch approved_by options from dropdown table
  useEffect(() => {
    const fetchApprovedBy = async () => {
      try {
        const { data, error } = await fetchCategory("approved_by");
        if (!error && data) {
          setApprovedByOptions([...new Set(data.map(item => item.value).filter(Boolean))].sort());
        }
      } catch (err) {
        console.error("Error fetching approved_by dropdown:", err);
      }
    };
    fetchApprovedBy();
  }, []);

  // Fetch dynamic dropdown options from dropdown table (normalized category/value schema)
  // conveyd_for_registration_form stays hardcoded Yes/No per task.txt
  useEffect(() => {
    setConveyedOptions(["Yes", "No"]); // hardcoded per task.txt

    const fetchOrderStatusDropdowns = async () => {
      try {
        const [
          { data: avData },
          { data: pmData },
          { data: rsData },
          { data: ptData },
          { data: tmData },
          { data: cdData },
        ] = await Promise.all([
          fetchCategory("acceptance_via"),
          fetchCategory("payment_mode"),
          fetchCategory("if_no_then_get_relavant_status"),
          fetchCategory("payment_terms"),
          fetchCategory("transport_mode"),
          fetchCategory("credit_days"),
        ]);

        const toValues = (arr) =>
          [...new Set((arr || []).map(r => r.value).filter(Boolean))].sort();

        setReasonStatusOptions(toValues(rsData));
        if (avData?.length) setAcceptanceViaOptions(toValues(avData));
        if (pmData?.length) setPaymentModeOptions(toValues(pmData));
        if (ptData?.length) setPaymentTermsOptions(toValues(ptData));
        if (tmData?.length) setTransportModeOptions(toValues(tmData));
        if (cdData?.length) setCreditDaysOptions(toValues(cdData));

      } catch (err) {
        console.error("Error fetching order status dropdowns:", err);
        setAcceptanceViaOptions(["email", "phone", "in-person", "other"]);
        setPaymentModeOptions(["cash", "check", "bank-transfer", "credit-card"]);
        setReasonStatusOptions([]);
        setPaymentTermsOptions(["30", "45", "60", "90"]);
        setTransportModeOptions(["Road", "Air", "Sea", "Rail"]);
        setCreditDaysOptions(["30", "45", "60", "90"]);
      }
    };

    fetchOrderStatusDropdowns();
  }, [])


  // Fetch quotation numbers for the given enquiry number
  useEffect(() => {
    const fetchQuotationNumbers = async () => {
      if (!enquiryNo) return;

      try {
        setIsLoadingQuotations(true);

        const isLead = String(enquiryNo || '').toUpperCase().startsWith('LD-');
        let recordUuid = null;

        if (isLead) {
          const { data: leadData } = await supabase
            .from("lto_leads")
            .select("id")
            .eq("lead_no", enquiryNo)
            .maybeSingle();
          if (leadData) recordUuid = leadData.id;
        } else {
          const { data: enqData } = await supabase
            .from("lto_enquiries")
            .select("id")
            .eq("enquiry_no", enquiryNo)
            .maybeSingle();
          if (enqData) recordUuid = enqData.id;
        }

        if (!recordUuid) {
          setQuotationNumbers([]);
          return;
        }

        const tableName = isLead ? "lto_enquiry_tracker_for_leads" : "lto_enquiry_tracker";
        const foreignKeyCol = isLead ? "lead_id" : "enquiry_id";

        const { data, error } = await supabase
          .from(tableName)
          .select("quotation_number")
          .eq(foreignKeyCol, recordUuid)
          .not("quotation_number", "is", null);

        if (error) {
          console.error(`Supabase error fetching from ${tableName}:`, error);
          return;
        }

        if (data && data.length > 0) {
          const rawQuotations = [...new Set(data.map(item => item.quotation_number).filter(Boolean))];

          // Sort so the latest revision (highest -XX suffix) appears first.
          // Quotation format: PREFIX-YY-YY-NNN or PREFIX-YY-YY-NNN-RR (revision)
          const getRevision = (q) => {
            const parts = q.split("-");
            if (parts.length === 5) return parseInt(parts[4], 10) || 0;
            return -1; // base (no suffix) sorts below any revision
          };
          const uniqueQuotations = rawQuotations.sort((a, b) => getRevision(b) - getRevision(a));

          setQuotationNumbers(uniqueQuotations);

          // Auto-select only if we don't already have a value
          if (uniqueQuotations.length > 0 && !formData.orderStatusQuotationNumber) {
            onFieldChange('orderStatusQuotationNumber', uniqueQuotations[0]);
          }

        } else {
          setQuotationNumbers([]);
        }
      } catch (error) {
        console.error("Error fetching quotation numbers:", error);
      } finally {
        setIsLoadingQuotations(false);
      }
    }

    fetchQuotationNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiryNo, activeTab]);

  //  useEffect(() => {
  //    if (quotationNumbers.length > 0 && !formData.orderStatusQuotationNumber) {
  //      stableOnFieldChange('orderStatusQuotationNumber', quotationNumbers[0]);
  //    }
  //  }, [quotationNumbers, formData.orderStatusQuotationNumber, stableOnFieldChange]);

  // Function to fetch items from Make_Quotation table based on quotation number
  const fetchItemsFromQuotation = async (quotationNumber) => {
    if (!quotationNumber) {
      setQuotationItems([])
      return
    }

    try {
      setIsLoadingItems(true)
      console.log("Fetching items for quotation number:", quotationNumber)

      const { data, error } = await supabase
        .from("lto_make_quotation_items")
        .select("item_name, quantity")
        .eq("quotation_no", quotationNumber)

      if (error) {
        console.error("Error fetching from make_quotation_items:", error)
        setQuotationItems([])
        return
      }

      if (data && data.length > 0) {
        const extractedItems = data.map((item, index) => ({
          id: index + 1,
          name: item.item_name || "",
          qty: item.quantity || 0
        }))

        console.log("Fetched items from make_quotation_items:", extractedItems)
        setQuotationItems(extractedItems)

        // Pass items to parent component
        onFieldChange('quotationItems', extractedItems)
      } else {
        console.log("No items found in make_quotation_items for:", quotationNumber)
        setQuotationItems([])
      }
    } catch (error) {
      console.error("Exception fetching items from make_quotations:", error)
      setQuotationItems([])
    } finally {
      setIsLoadingItems(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === "warranty" || name === "orderVideo") {
      onFieldChange("warranty", value)
      onFieldChange("orderVideo", value)
    } else {
      onFieldChange(name, value)
    }
  }

  const handleFileChange = async (e) => {
    const { name } = e.target
    const file = e.target.files[0]

    if (name === "orderVideo" && !file) {
      setOrderVideoError("Order Video is mandatory")
    } else {
      setOrderVideoError("")
    }

    if (!file) return

    if (name === "acceptanceFile") {
      // Compress if it's a photo of a signed acceptance/PO; other file types
      // (PDF, doc) pass through untouched.
      const processedFile = await compressImageFile(file)
      const sizeError = validateFileSize(processedFile, 10)
      if (sizeError) {
        setAcceptanceFileError(sizeError)
        onFieldChange(name, null)
        e.target.value = ""
        return
      }
      setAcceptanceFileError("")
      onFieldChange(name, processedFile)
      return
    }

    if (name === "apologyVideo") {
      // Video can't be meaningfully compressed client-side -- just cap size.
      const sizeError = validateFileSize(file, 50)
      if (sizeError) {
        setOrderVideoError(sizeError)
        onFieldChange(name, null)
        e.target.value = ""
        return
      }
      onFieldChange(name, file)
      return
    }

    onFieldChange(name, file)
  }

  const handleStatusChange = (status) => {
    setOrderStatus(status)
    onFieldChange('orderStatus', status)

    // When "yes" is selected, fetch items from Make_Quotation table
    if (status === "yes" && formData.orderStatusQuotationNumber) {
      fetchItemsFromQuotation(formData.orderStatusQuotationNumber)
    } else {
      setQuotationItems([])
      onFieldChange('quotationItems', [])
    }
  }

  return (
    <div className="space-y-6 border p-4 rounded-md">
      <h3 className="text-lg font-medium">Order Status</h3>
      <hr className="border-gray-200" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="orderStatusQuotationNumber" className="block text-sm font-medium text-gray-700">
            Quotation Number
           <span className="text-destructive">*</span></label>
          {isLoadingQuotations ? (
            <div className="flex items-center space-x-2">
              <input
                id="orderStatusQuotationNumber"
                name="orderStatusQuotationNumber"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Loading quotation numbers..."
                value={formData.orderStatusQuotationNumber || ""}
                onChange={handleChange}
                disabled
                required
              />
              <div className="text-sm text-gray-500">Loading...</div>
            </div>
          ) : quotationNumbers.length > 0 ? (
            <select
              id="orderStatusQuotationNumber"
              name="orderStatusQuotationNumber"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              value={formData.orderStatusQuotationNumber || ""}
              onChange={handleChange}
              required
            >
              <option value="">Select quotation number</option>
              {quotationNumbers.map((quotation, index) => (
                <option key={index} value={quotation}>{quotation}</option>
              ))}
            </select>
          ) : (
            <input
              id="orderStatusQuotationNumber"
              name="orderStatusQuotationNumber"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter quotation number"
              value={formData.orderStatusQuotationNumber || ""}
              onChange={handleChange}
              required
            />
          )}
          {enquiryNo && quotationNumbers.length > 0 && !isLoadingQuotations && (
            <div className="text-xs text-success mt-1">
              {quotationNumbers.length === 1
                ? "Found matching quotation"
                : `Found ${quotationNumbers.length} matching quotations`}
            </div>
          )}
          {enquiryNo && quotationNumbers.length === 0 && !isLoadingQuotations && (
            <div className="text-xs text-orange-500 mt-1">No matching quotations found for enquiry #{enquiryNo}</div>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Is Order Received? Status <span className="text-destructive">*</span></label>
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <input
              type="radio"
              id="order-yes"
              name="orderStatus"
              value="yes"
              checked={orderStatus === "yes"}
              onChange={() => handleStatusChange("yes")}
              className="h-4 w-4 text-primary focus:ring-primary"
              required={!orderStatus}
            />
            <label htmlFor="order-yes" className="text-sm text-gray-700">
              YES
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="radio"
              id="order-no"
              name="orderStatus"
              value="no"
              checked={orderStatus === "no"}
              onChange={() => handleStatusChange("no")}
              className="h-4 w-4 text-primary focus:ring-primary"
            />
            <label htmlFor="order-no" className="text-sm text-gray-700">
              NO
            </label>
          </div>
        </div>
      </div>

      {orderStatus === "yes" && (
        <div className="space-y-4 border p-4 rounded-md">
          <h4 className="font-medium">Order Received Details</h4>

          {/* Items Display Section */}
          {isLoadingItems ? (
            <div className="p-4 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-500">Loading items from quotation...</p>
            </div>
          ) : quotationItems.length > 0 ? (
            <div className="space-y-3 p-4 bg-info/10 rounded-md border border-info/30">
              <h5 className="font-medium text-info">Items from Quotation</h5>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white rounded-md overflow-hidden">
                  <thead className="bg-info/10">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-info">#</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-info">Item Name</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-info">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotationItems.map((item, index) => (
                      <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-2 text-sm text-gray-700">{index + 1}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{item.name}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-info mt-2">
                Total Items: {quotationItems.length} |
                Total Qty: {quotationItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)}
              </p>
            </div>
          ) : (
            <div className="p-3 bg-warning/5 rounded-md border border-warning/30">
              <p className="text-sm text-warning-foreground">No items found in quotation. Please ensure the quotation number is correct.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="approvedBy" className="block text-sm font-medium text-gray-700">
                Approve By <span className="text-destructive">*</span>
              </label>
              <select
                id="approvedBy"
                name="approvedBy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.approvedBy || ""}
                onChange={handleChange}
                required
              >
                <option value="">Select approver</option>
                {approvedByOptions.map((option, index) => (
                  <option key={index} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="acceptanceVia" className="block text-sm font-medium text-gray-700">
                Acceptance Via
               <span className="text-destructive">*</span></label>
              <select
                id="acceptanceVia"
                name="acceptanceVia"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.acceptanceVia || ""}
                onChange={handleChange}
                required
              >
                <option value="">Select method</option>
                {acceptanceViaOptions.map((option, index) => (
                  <option key={index} value={option.toLowerCase()}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="paymentMode" className="block text-sm font-medium text-gray-700">
                Payment Mode
               <span className="text-destructive">*</span></label>
              <select
                id="paymentMode"
                name="paymentMode"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.paymentMode || ""}
                onChange={handleChange}
                required
              >
                <option value="">Select mode</option>
                {paymentModeOptions.map((option, index) => (
                  <option key={index} value={option.toLowerCase()}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="destination" className="block text-sm font-medium text-gray-700">
                Destination <span className="text-destructive">*</span>
              </label>
              <input
                id="destination"
                name="destination"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Enter destination"
                value={formData.destination || ""}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="poNumber" className="block text-sm font-medium text-gray-700">
                PO Number <span className="text-destructive">*</span>
              </label>
              <input
                id="poNumber"
                name="poNumber"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Enter PO number"
                value={formData.poNumber || ""}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="paymentTerms" className="block text-sm font-medium text-gray-700">
                Payment Terms
               <span className="text-destructive">*</span></label>
              <select
                id="paymentTerms"
                name="paymentTerms"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.paymentTerms || ""}
                onChange={handleChange}
                required
              >
                <option value="">Select payment terms</option>
                {paymentTermsOptions.map((option, index) => (
                  <option key={index} value={option}>{option} days</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="transportMode" className="block text-sm font-medium text-gray-700">
                Transport Mode <span className="text-destructive">*</span>
              </label>
              <select
                id="transportMode"
                name="transportMode"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.transportMode || ""}
                onChange={handleChange}
                required
              >
                <option value="">Select transport mode</option>
                {transportModeOptions.map((option, index) => (
                  <option key={index} value={option.toLowerCase()}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="creditDays" className="block text-sm font-medium text-gray-700">
                Credit Days
              </label>
              <select
                id="creditDays"
                name="creditDays"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.creditDays || ""}
                onChange={handleChange}
              >
                <option value="">Select credit days</option>
                {creditDaysOptions.map((option, index) => (
                  <option key={index} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="creditLimit" className="block text-sm font-medium text-gray-700">
                Credit Limit
              </label>
              <input
                type="number"
                step="1"
                min="0"
                id="creditLimit"
                name="creditLimit"
                placeholder="Enter credit limit"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.creditLimit || ""}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="conveyedForRegistration" className="block text-sm font-medium text-gray-700">
                CONVEYED FOR REGISTRATION FORM <span className="text-destructive">*</span>
              </label>
              <select
                id="conveyedForRegistration"
                name="conveyedForRegistration"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.conveyedForRegistration || ""}
                onChange={handleChange}
                required
              >
                <option value="">Select option</option>
                {conveyedOptions.map((option, index) => (
                  <option key={index} value={option.toLowerCase()}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="warranty" className="block text-sm font-medium text-gray-700">
              Warranty <span className="text-destructive">*</span>
            </label>
            <select
              id="warranty"
              name="warranty"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              value={formData.warranty || formData.orderVideo || ""}
              onChange={handleChange}
              required
            >
              <option value="">Select an option</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="acceptanceFile" className="block text-sm font-medium text-gray-700">
              Acceptance File Upload <span className="text-destructive">*</span>
            </label>
            <input
              id="acceptanceFile"
              name="acceptanceFile"
              type="file"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              onChange={handleFileChange}
              required={!formData.acceptanceFile}
            />
            {acceptanceFileError && (
              <p className="text-sm text-destructive">{acceptanceFileError}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="orderRemark" className="block text-sm font-medium text-gray-700">
              REMARK <span className="text-destructive">*</span>
            </label>
            <textarea
              id="orderRemark"
              name="orderRemark"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter remarks"
              value={formData.orderRemark || ""}
              onChange={handleChange}
              required
            />
          </div>
        </div>
      )}

      {orderStatus === "no" && (
        <div className="space-y-4 border p-4 rounded-md">
          <h4 className="font-medium">Order Lost Details</h4>

          <div className="space-y-2">
            <label htmlFor="apologyVideo" className="block text-sm font-medium text-gray-700">
              Order Lost Apology Video <span className="text-destructive">*</span>
            </label>
            <input
              id="apologyVideo"
              name="apologyVideo"
              type="file"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              onChange={handleFileChange}
              required={!formData.apologyVideo}
            />
            {orderVideoError && (
              <p className="text-sm text-destructive">{orderVideoError}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="reasonStatus" className="block text-sm font-medium text-gray-700">
              If No then get relevant reason Status
             <span className="text-destructive">*</span></label>
            <select
              id="reasonStatus"
              name="reasonStatus"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              value={formData.reasonStatus || ""}
              onChange={handleChange}
              required
            >
              <option value="">Select reason</option>

              {reasonStatusOptions.map((option, index) => (
                <option key={index} value={option.toLowerCase()}>{option}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="reasonRemark" className="block text-sm font-medium text-gray-700">
              If No then get relevant reason Remark <span className="text-destructive">*</span>
            </label>
            <textarea
              id="reasonRemark"
              name="reasonRemark"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter reason remarks"
              value={formData.reasonRemark || ""}
              onChange={handleChange}
              required
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default OrderStatusForm