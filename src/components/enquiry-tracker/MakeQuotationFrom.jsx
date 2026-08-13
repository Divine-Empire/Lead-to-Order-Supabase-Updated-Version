import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import supabase from "../../utils/supabase"
import { compressImageFile, validateFileSize } from "../../utils/imageCompression"

function MakeQuotationForm({ enquiryNo, formData, onFieldChange }) {
  const [sharedByOptions, setSharedByOptions] = useState([])
  const [fileError, setFileError] = useState(null)
  const [generatedQuotations, setGeneratedQuotations] = useState([])
  
  useEffect(() => {
    const fetchSharedByOptions = async () => {
      try {
        const { data, error } = await supabase
          .from("lto_dropdown")
          .select("value")
          .eq("category", "quotation_shared_by");

        if (error) throw error;
        
        if (data) {
          const uniqueOptions = [...new Set(data.map(item => item.value).filter(Boolean))].sort();
          setSharedByOptions(uniqueOptions);
        }
      } catch (err) {
        console.error("Error fetching quotation_shared_by options:", err);
      }
    };
    
    fetchSharedByOptions();
  }, [])

  useEffect(() => {
    const fetchGeneratedQuotations = async () => {
      if (!enquiryNo) {
        setGeneratedQuotations([]);
        return;
      }
      try {
        // Revisions are just additional rows here -- a revision reuses the
        // same enquiry_reference_no and gets a "-01", "-02"... suffix
        // appended to the base quotation_no (see Quotation.jsx's
        // nextRevision helper) -- so this fetch already returns the root
        // AND every revision for this enquiry, oldest first.
        const { data, error } = await supabase
          .from("lto_make_quotations")
          .select("quotation_no, grand_total, pdf_url, created_at")
          .eq("enquiry_reference_no", enquiryNo)
          .order("created_at", { ascending: true });

        if (error) throw error;
        setGeneratedQuotations(data || []);
      } catch (err) {
        console.error("Error fetching generated quotations for enquiry:", err);
        setGeneratedQuotations([]);
      }
    };

    fetchGeneratedQuotations();
  }, [enquiryNo]);

  // "Send Quotation No." tracks how many times a quotation has already been
  // sent (i.e. submitted through this "Make Quotation" stage) for THIS
  // specific enquiry/lead. It's derived from the tracker history rather
  // than from lto_make_quotations, since sending the same quotation number
  // twice still counts as a separate "send". Looks up this enquiry/lead's
  // UUID, finds the most recent tracker row whose current_stage is the
  // make-quotation stage, and shows last send_quotation_no + 1 (or 1 if
  // no prior send exists).
  useEffect(() => {
    const fetchNextSendQuotationNo = async () => {
      if (!enquiryNo) return;

      try {
        const isLead = enquiryNo.toUpperCase().startsWith("LD-");
        const parentTable = isLead ? "lto_leads" : "lto_enquiries";
        const parentIdColumn = isLead ? "lead_no" : "enquiry_no";
        const trackerTable = isLead ? "lto_enquiry_tracker_for_leads" : "lto_enquiry_tracker";
        const trackerFkColumn = isLead ? "lead_id" : "enquiry_id";

        const { data: parentRecord, error: parentError } = await supabase
          .from(parentTable)
          .select("id")
          .eq(parentIdColumn, enquiryNo)
          .maybeSingle();

        if (parentError || !parentRecord?.id) {
          onFieldChange("sendQuotationNo", "1");
          return;
        }

        // current_stage has been written as both "make-quotation" (current)
        // and "Make Quotation" (legacy) across rows -- check both.
        const { data: lastMakeQuotationRow, error: trackerError } = await supabase
          .from(trackerTable)
          .select("send_quotation_no")
          .eq(trackerFkColumn, parentRecord.id)
          .in("current_stage", ["make-quotation", "Make Quotation"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (trackerError) throw trackerError;

        const lastNo = parseInt(lastMakeQuotationRow?.send_quotation_no, 10);
        onFieldChange(
          "sendQuotationNo",
          String(Number.isFinite(lastNo) && lastNo > 0 ? lastNo + 1 : 1)
        );
      } catch (err) {
        console.error("Error computing next Send Quotation No.:", err);
        onFieldChange("sendQuotationNo", "1");
      }
    };

    fetchNextSendQuotationNo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiryNo]);

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === "quotationNumber") {
      onFieldChange(name, value);

      // Fill "With Tax" from the cached grand_total
      const matchedQuotation = generatedQuotations.find((q) => q.quotation_no === value);
      if (matchedQuotation) {
        if (matchedQuotation.grand_total !== undefined && matchedQuotation.grand_total !== null) {
          onFieldChange("valueWithTax", String(matchedQuotation.grand_total));
        }
        if (matchedQuotation.pdf_url) {
          onFieldChange("quotationFileUrl", matchedQuotation.pdf_url);
        }
      }

      // Fill "Without Tax" by summing line-item amounts from lto_make_quotation_items
      if (value) {
        supabase
          .from("lto_make_quotation_items")
          .select("amount, is_freight")
          .eq("quotation_no", value)
          .then(({ data: items, error }) => {
            if (!error && items && items.length > 0) {
              // Sum all non-freight amounts (pre-tax subtotal)
              const subtotal = items.reduce((sum, it) => {
                if (it.is_freight) return sum;
                return sum + (Number(it.amount) || 0);
              }, 0);
              onFieldChange("valueWithoutTax", String(Math.round(subtotal * 100) / 100));
            }
          });
      }
    } else {
      onFieldChange(name, value);
    }
  }


  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Images get resized/re-encoded before the size check, so a large phone
    // photo doesn't need to be rejected outright -- PDFs/docs pass through.
    const processedFile = await compressImageFile(file)

    const sizeError = validateFileSize(processedFile, 10)
    if (sizeError) {
      setFileError(sizeError)
      onFieldChange('quotationFile', null)
    } else {
      setFileError(null)
      onFieldChange('quotationFile', processedFile)
    }
  }

  return (
    <div className="mt-6">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="enquiryNo" className="block text-sm font-medium">
              Enquiry No.
            </label>
            <input
              id="enquiryNo"
              name="enquiryNo"
              type="text"
              placeholder="En-001"
              value={enquiryNo}
              className="w-full p-2 border border-gray-300 rounded-md bg-gray-100"
              readOnly
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="sendQuotationNo" className="block text-sm font-medium">
              Send Quotation No.
             <span className="text-destructive">*</span></label>
            <input
              id="sendQuotationNo"
              name="sendQuotationNo"
              type="text"
              placeholder="001"
              value={formData.sendQuotationNo}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md bg-gray-100"
              readOnly
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="quotationSharedBy" className="block text-sm font-medium">
              Quotation Shared By
             <span className="text-destructive">*</span></label>
            <select
              id="quotationSharedBy"
              name="quotationSharedBy"
              value={formData.quotationSharedBy}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md"
              required
            >
              <option value="">Select person</option>
              {sharedByOptions.map((option, index) => (
                <option key={index} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="quotationNumber" className="block text-sm font-medium">
              Quotation Number
             <span className="text-destructive">*</span></label>
            <select
              id="quotationNumber"
              name="quotationNumber"
              value={formData.quotationNumber}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md"
              required
            >
              <option value="">Select quotation number</option>
              {generatedQuotations.map((q) => (
                <option key={q.quotation_no} value={q.quotation_no}>
                  {q.quotation_no}{q.grand_total ? ` — ₹${q.grand_total}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="valueWithoutTax" className="block text-sm font-medium">
              Quotation Value Without Tax
             <span className="text-destructive">*</span></label>
            <input
              id="valueWithoutTax"
              name="valueWithoutTax"
              type="text"
              placeholder="₹10,000"
              value={formData.valueWithoutTax}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="valueWithTax" className="block text-sm font-medium">
              Quotation Value With Tax
             <span className="text-destructive">*</span></label>
            <input
              id="valueWithTax"
              name="valueWithTax"
              type="text"
              placeholder="₹11,800"
              value={formData.valueWithTax}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="quotationFile" className="block text-sm font-medium">
            Quotation Upload <span className="text-destructive">*</span>
          </label>
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                </svg>
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500">PDF, Word, Excel, or image files (MAX. 10MB)</p>
              </div>
              <input
                id="quotationFile"
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                required={!formData.quotationFile && !formData.quotationFileUrl}
              />
            </label>
          </div>
          {fileError && (
            <p className="mt-1 text-sm text-destructive">{fileError}</p>
          )}
          {formData.quotationFile && (
            <div className="flex items-center mt-2 p-2 bg-gray-50 rounded-md">
              <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm text-gray-600 flex-1">{formData.quotationFile.name}</span>
              <button
                type="button"
                onClick={() => onFieldChange('quotationFile', null)}
                className="text-destructive hover:text-destructive"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          {formData.quotationFileUrl && !formData.quotationFile && (
            <div className="flex items-center mt-2 p-2 bg-primary/5 rounded-md border border-primary/10">
              <svg className="w-5 h-5 mr-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <a href={formData.quotationFileUrl} target="_blank" rel="noreferrer" className="text-sm text-primary flex-1 hover:underline truncate">
                {formData.quotationFileUrl.split('/').pop()}
              </a>
              <button
                type="button"
                onClick={() => onFieldChange('quotationFileUrl', "")}
                className="text-destructive hover:text-destructive ml-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="remarks" className="block text-sm font-medium">
            REMARK
          </label>
          <textarea
            id="remarks"
            name="remarks"
            placeholder="Enter any remarks about this quotation"
            value={formData.remarks}
            onChange={handleChange}
            rows="4"
            className="w-full p-2 border border-gray-300 rounded-md"
          ></textarea>
        </div>
      </div>
    </div>
  )
}

export default MakeQuotationForm