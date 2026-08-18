"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { DownloadIcon, SaveIcon, ShareIcon } from "../../components/Icons";
import image1 from "../../assests/WhatsApp Image 2025-05-14 at 4.11.43 PM.jpeg";
import imageform from "../../assests/banner.jpeg";
import QuotationHeader from "./quotation-header";
import QuotationForm from "./quotation-form";
import QuotationPreview from "./quotation-preview";
import { generatePDFFromData } from "./pdf-generator";
import { getNextQuotationNumber } from "./quotation-service";
import { useQuotationData } from "./use-quotation-data";
import supabase from "../../utils/supabase";
import { loadQuotationDataByNumber } from "../../utils/quotationDataLoader";

function Quotation() {
  const [activeTab, setActiveTab] = useState("edit");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quotationLink, setQuotationLink] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [isRevising, setIsRevising] = useState(false);
  const [existingQuotations, setExistingQuotations] = useState([]);
  const [selectedQuotation, setSelectedQuotation] = useState("");
  const [isLoadingQuotation, setIsLoadingQuotation] = useState(false);
  const [specialDiscount, setSpecialDiscount] = useState(0);
  const [selectedReferences, setSelectedReferences] = useState([]);
  
  // Pagination and Search states for Quotation Dropdown
  const [queryTerm, setQueryTerm] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const lastFetchedTerm = useRef(null);

  // Add hidden columns state
  const [hiddenColumns, setHiddenColumns] = useState({
    hideDisc: false,
    hideFlatDisc: false,
    hideTotalFlatDisc: false,
    hideSpecialDiscount: false,
  });

  // Helper function to convert date format
  const convertDateToISO = (dateString) => {
    if (!dateString) return null;

    // If already in ISO format (YYYY-MM-DD), return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }

    // If in DD/MM/YYYY format, convert to YYYY-MM-DD
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
      const [day, month, year] = dateString.split("/");
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    // Try to parse as Date object and convert
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0]; // Returns YYYY-MM-DD
      }
    } catch (error) {
      console.error("Error converting date:", error);
    }

    return null;
  };

  // Helper function to upload PDF to Supabase bucket
  const uploadPDFToSupabase = async (pdfBlob, fileName) => {
    try {
      const { error } = await supabase.storage
        .from("quotation_image")
        .upload(fileName, pdfBlob, {
          contentType: "application/pdf",
          upsert: true, // This will overwrite if file exists
        });

      if (error) {
        console.error("Error uploading PDF:", error);
        throw error;
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from("quotation_image")
        .getPublicUrl(fileName);

      return publicUrlData?.publicUrl || null;
    } catch (error) {
      console.error("Error in PDF upload:", error);
      return null;
    }
  };

  // Check if we're in view mode
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const isViewMode = params.has("view");

  // Use the custom hook for quotation data
  const {
    quotationData,
    setQuotationData,
    handleInputChange,
    handleItemChange,
    handleFlatDiscountChange,
    handleSpecialDiscountChange,
    handleAddItem,
    handleNoteChange,
    addNote,
    removeNote,
    hiddenFields,
    toggleFieldVisibility,
    addSpecialOffer,
    removeSpecialOffer,
    handleSpecialOfferChange,
    resetQuotationData,
  } = useQuotationData(specialDiscount);

  const handleSpecialDiscountChangeWrapper = (value) => {
    const discount = Number(value) || 0;
    setSpecialDiscount(discount);
    handleSpecialDiscountChange(discount);
  };

  // Fetch quotations from Supabase with search and pagination
  const fetchExistingQuotations = useCallback(async (search = "", currentOffset = 0, append = false) => {
    try {
      if (currentOffset === 0) {
          setIsLoadingQuotation(true);
          setExistingQuotations([]); // Clear previous results for fresh search
      } else {
          setIsFetchingMore(true);
      }


      let query = supabase
        .from("lto_make_quotations")
        .select("quotation_no");

      if (search) {
        query = query.ilike("quotation_no", `%${search}%`);
      }

      query = query
        .order("created_at", { ascending: false })
        .range(currentOffset, currentOffset + 49);

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching quotation numbers:", error);
        if (!append) setExistingQuotations([]);
        setHasMore(false);
        return;
      }

      const newQuotations = data ? data.map((row) => row.quotation_no || row.Quotation_No).filter(Boolean) : [];
      
      setExistingQuotations(prev => append ? [...prev, ...newQuotations] : newQuotations);
      setHasMore(newQuotations.length === 50);
      setOffset(currentOffset + newQuotations.length);
    } catch (error) {
      console.error("Error fetching quotation numbers:", error);
    } finally {
      setIsLoadingQuotation(false);
      setIsFetchingMore(false);
    }
  }, []);

  // Consolidated search effect for all terms (including empty)
  useEffect(() => {
    // Avoid redundant fetches if term hasn't changed
    if (queryTerm === lastFetchedTerm.current && lastFetchedTerm.current !== null) return;
    
    let isCancelled = false;
    const delay = queryTerm === "" ? 0 : 500;
    
    const timer = setTimeout(async () => {
      if (!isCancelled) {
          lastFetchedTerm.current = queryTerm;
          await fetchExistingQuotations(queryTerm, 0, false);
      }
    }, delay);
    
    return () => {
        isCancelled = true;
        clearTimeout(timer);
    };
  }, [queryTerm, fetchExistingQuotations]);

  // Handle Search input change from child
  const triggerDropdownSearch = useCallback((term) => {
    setQueryTerm(term);
    setOffset(0);
  }, []);

  // Handle Load More
  const handleLoadMoreQuotations = useCallback(() => {
    if (!isFetchingMore && hasMore) {
      fetchExistingQuotations(queryTerm, offset, true);
    }
  }, [isFetchingMore, hasMore, queryTerm, offset, fetchExistingQuotations]);

  // Initialize quotation number
  // Initialize quotation number - RUN ONLY ONCE
  useEffect(() => {
    const initializeQuotationNumber = async () => {
      try {
        const nextQuotationNumber = await getNextQuotationNumber();
        setQuotationData((prev) => ({
          ...prev,
          quotationNo: nextQuotationNumber,
        }));
      } catch (error) {
        console.error("Error initializing quotation number:", error);
      }
    };

    initializeQuotationNumber();
  }, [setQuotationData]); // Stabilized: only runs when setQuotationData (stable) or mount

  // Load quotation data from URL if in view mode
  useEffect(() => {
    const viewId = params.get("view");

    if (viewId) {
      const savedQuotation = localStorage.getItem(viewId);

      if (savedQuotation) {
        try {
          const parsedData = JSON.parse(savedQuotation);
          setQuotationData(parsedData);
          setActiveTab("preview");
        } catch (error) {
          console.error("Error loading quotation data:", error);
        }
      }
    }
  }, [setQuotationData, params]);

  const toggleRevising = async () => {
    const newIsRevising = !isRevising;
    setIsRevising(newIsRevising);

    if (newIsRevising) {
      setSelectedQuotation("");
    } else {
      try {
        const nextQuotationNumber = await getNextQuotationNumber();
        resetQuotationData(nextQuotationNumber);
        setSpecialDiscount(0);
        setSelectedReferences([]);
        setPdfUrl("");
        setQuotationLink("");
      } catch (error) {
        console.error("Error resetting form on cancel revise:", error);
      }
    }
  };

  const handleQuotationSelect = async (quotationNo) => {
    if (!quotationNo) return;

    setIsLoadingQuotation(true);
    setSelectedQuotation(quotationNo);

    try {
      const result = await loadQuotationDataByNumber(quotationNo);

      if (!result) {
        alert("Failed to load quotation data");
        return;
      }

      const { quotationData: loadedQuotationData, selectedReferences, specialDiscount: loadedSpecialDiscount, items } = result;

      setSelectedReferences(selectedReferences);
      setQuotationData(loadedQuotationData);
      setSpecialDiscount(loadedSpecialDiscount);

      handleSpecialDiscountChangeWrapper(loadedSpecialDiscount);
      handleInputChange("consignorState", loadedQuotationData.consignorState);
      handleInputChange("consigneeState", loadedQuotationData.consigneeState);
      handleInputChange("items", items);
    } catch (error) {
      console.error("Error fetching quotation data:", error);
      alert("Failed to load quotation data");
    } finally {
      setIsLoadingQuotation(false);
    }
  };

  const handleGeneratePDF = async () => {
    setIsGenerating(true);

    try {
      // Prefer backend number if present, otherwise fall back
      const preferredNo =
        quotationData.Quotation_No ||
        quotationData.finalQuotationNo ||
        quotationData.quotationNo;

      const pdfDataUri = await generatePDFFromData(
        { ...quotationData, Quotation_No: preferredNo },
        selectedReferences,
        specialDiscount,
        hiddenColumns,
        hiddenFields
      );

      // Extract base64 data from data URI
      const base64Data = pdfDataUri.split(",")[1];

      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Quotation_${preferredNo}.pdf`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(link.href);

      setIsGenerating(false);
      alert("PDF generated and downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF: " + error.message);
      setIsGenerating(false);
    }
  };

  const handleGenerateLink = async () => {
    setIsGenerating(true);

    try {
      // Create local storage link for your reference
      const quotationId = `quotation_${Date.now()}`;
      localStorage.setItem(quotationId, JSON.stringify(quotationData));
      const localLink = `${window.location.origin}${window.location.pathname}?view=${quotationId}`;

      setQuotationLink(localLink);
      setIsGenerating(false);

      alert(
        "Quotation link has been successfully generated and is ready to share."
      );
    } catch (error) {
      console.error("Error generating link:", error);
      alert("Failed to generate link: " + error.message);
      setIsGenerating(false);
    }
  };

  const handleSaveQuotation = async () => {
    if (!quotationData.consigneeName) {
      alert("Please select a company name");
      return;
    }

    if (!quotationData.preparedBy) {
      alert("Please enter prepared by name");
      return;
    }

    setIsSubmitting(true);

    try {
      // Calculate grand total
      const taxableAmount = Math.max(
        0,
        quotationData.subtotal - quotationData.totalFlatDiscount
      );
      let grandTotal = 0;

      if (quotationData.isIGST) {
        const igstAmt = taxableAmount * (quotationData.igstRate / 100);
        grandTotal = taxableAmount + igstAmt - (Number(specialDiscount) || 0);
      } else {
        const cgstAmt = taxableAmount * (quotationData.cgstRate / 100);
        const sgstAmt = taxableAmount * (quotationData.sgstRate / 100);
        grandTotal =
          taxableAmount + cgstAmt + sgstAmt - (Number(specialDiscount) || 0);
      }

      const finalGrandTotal = Math.max(0, grandTotal).toFixed(2);

      // Helper to create next revision value based on a base number
      const nextRevision = (baseNo) => {
        const parts = baseNo.split("-");
        if (parts.length === 5) {
          const last = parts[4];
          const next = (parseInt(last, 10) + 1).toString().padStart(2, "0");
          parts[4] = next;
          return parts.join("-");
        }
        if (parts.length === 4) return `${baseNo}-01`;
        return `${baseNo}-01`;
      };

      // Convert special offers array to string for database storage
      const specialOffersString = quotationData.specialOffers
        ? quotationData.specialOffers.filter((offer) => offer.trim()).join("|")
        : "";

      // Try insert with retries on unique constraint (concurrent save)
      let authoritativeQuotationNo = null;
      let authoritativeQuotationId = null;
      let lastError = null;

      // Look up consignor and consignee UUIDs.
      // consignor_id must point at the real consignor/branch entity (the one
      // matching the selected State on the left panel) -- it previously
      // matched against reference_name instead, which meant it almost always
      // resolved to a "reference" row (sales-staff referrer) rather than the
      // actual branch used, silently breaking revision prefill of the
      // consignor's own state/address/GSTIN. Reference name/number are now
      // stored directly on this record (see reference_name/reference_number
      // below) rather than via this FK at all.
      let consignorId = null;
      if (quotationData.consignorState) {
        const { data: cData } = await supabase
          .from("lto_consignor_details")
          .select("uuid")
          .ilike("state", quotationData.consignorState)
          .maybeSingle();
        consignorId = cData?.uuid || null;
      }

      let consigneeId = null;
      if (quotationData.consigneeName) {
        const { data: clData } = await supabase
          .from("lto_client_master")
          .select("uuid")
          .ilike("company_name", quotationData.consigneeName)
          .maybeSingle();
        consigneeId = clData?.uuid || null;
      }

      // Extract prefix from current quotation number to maintain consistency
      const extractPrefix = (quotationNo) => {
        const parts = quotationNo.split("-");
        if (parts.length >= 4) {
          return parts.slice(0, 3).join("-"); // e.g., "CRR-25-26"
        }
        return quotationNo.split("-")[0]; // fallback to first part
      };

      // Initialize candidate number
      let candidateNo = quotationData.quotationNo;
      const currentPrefix = extractPrefix(candidateNo);

      if (isRevising && selectedQuotation) {
        const partsInit = candidateNo.split("-");
        if (partsInit.length === 4) {
          candidateNo = `${candidateNo}-01`;
        }
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          if (isRevising && selectedQuotation) {
            candidateNo = nextRevision(candidateNo);
          } else {
            const parts = candidateNo.split("-");
            if (parts.length === 4) {
              const lastNumber = parseInt(parts[3], 10);
              const newNumber = (lastNumber + 1).toString().padStart(3, "0");
              candidateNo = `${currentPrefix}-${newNumber}`;
            } else {
              candidateNo = await getNextQuotationNumber(currentPrefix.split("-")[0]);
            }
          }
        }

        // Prepare snake_case data for refactored make_quotations table
        const quotationRecord = {
          enquiry_reference_no: quotationData.enquiryReferenceNo || null,
          quotation_no: candidateNo,
          quotation_date: convertDateToISO(quotationData.date),
          prepared_by: quotationData.preparedBy || null,
          consignor_id: consignorId,
          reference_name: quotationData.consignorName || null,
          reference_number: quotationData.consignorMobile || null,
          consignee_client_id: consigneeId,
          ship_to_address: quotationData.shipTo || quotationData.consigneeAddress || null,
          consignee_contact_name: quotationData.consigneeContactName || null,
          consignee_contact_no: quotationData.consigneeContactNo || null,
          validity: quotationData.validity || null,
          payment_terms: quotationData.paymentTerms || null,
          delivery: quotationData.delivery || null,
          freight: quotationData.freight || null,
          insurance: quotationData.insurance || null,
          taxes: quotationData.taxes || null,
          warranty: quotationData.warranty || null,
          notes: quotationData.notes ? quotationData.notes.filter((note) => note && note.trim()).join("|") : null,
          account_no: quotationData.accountNo || null,
          bank_name: quotationData.bankName || null,
          bank_address: quotationData.bankAddress || null,
          ifsc_code: quotationData.ifscCode || null,
          special_offer: specialOffersString || null,
          grand_total: parseFloat(finalGrandTotal) || 0,
        };

        const { data, error } = await supabase
          .from("lto_make_quotations")
          .insert([quotationRecord])
          .select();

        if (!error && data && data.length > 0) {
          authoritativeQuotationNo = data[0].quotation_no || candidateNo;
          authoritativeQuotationId = data[0].id || null;
          break;
        }

        lastError = error;
        const isUniqueViolation =
          (error?.code && error.code === "23505") ||
          (error?.message && error.message.toLowerCase().includes("duplicate key value")) ||
          (error?.message && error.message.includes("quotation_no_unique"));
        if (!isUniqueViolation) {
          throw new Error("Error saving quotation: " + (error?.message || "Database insert failed"));
        }

        await new Promise((res) => setTimeout(res, 100 + Math.random() * 200));
      }

      if (!authoritativeQuotationNo) {
        throw new Error("Error saving quotation: " + (lastError?.message || "unique constraint conflict"));
      }

      // Insert line items into make_quotation_items
      if (authoritativeQuotationId) {
        const itemsPayload = (quotationData.items || [])
          .filter((it) => it && (it.name || it.code || Number(it.amount) > 0))
          .map((it) => ({
            quotation_id: authoritativeQuotationId,
            quotation_no: authoritativeQuotationNo,
            item_code: it.code || null,
            item_name: it.name || "Item",
            description: it.description || null,
            quantity: Number(it.qty) || 0,
            unit: it.units || "Nos",
            rate: Number(it.rate) || 0,
            gst_percent: Number(it.gst) || 0,
            discount: Number(it.discount) || 0,
            flat_discount: Number(it.flatDiscount) || 0,
            amount: Number(it.amount) || 0,
            is_freight: Boolean(it.isFreight),
          }));

        if (itemsPayload.length > 0) {
          const { error: itemsError } = await supabase
            .from("lto_make_quotation_items")
            .insert(itemsPayload);

          if (itemsError) {
            console.error("Error saving quotation line items:", itemsError.message);
          }
        }
      }

      // Now generate PDF using the authoritative number
      const pdfDataUri = await generatePDFFromData(
        { ...quotationData, Quotation_No: authoritativeQuotationNo, quotation_no: authoritativeQuotationNo },
        selectedReferences,
        specialDiscount,
        hiddenColumns,
        hiddenFields,
      );

      // Validate that we have a proper data URI
      if (!pdfDataUri || !pdfDataUri.startsWith("data:application/pdf")) {
        throw new Error("Invalid PDF data generated");
      }

      // Extract base64 data correctly from data URI
      const base64Data = pdfDataUri.split(",")[1];
      if (!base64Data) {
        throw new Error("Could not extract PDF data from generated content");
      }

      // Convert base64 to blob
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pdfBlob = new Blob([bytes], { type: "application/pdf" });

      // Upload PDF to Supabase bucket with authoritative number in filename
      let uploadedPdfUrl = null;
      try {
        const fileName = `Quotation_${authoritativeQuotationNo}.pdf`;
        uploadedPdfUrl = await uploadPDFToSupabase(pdfBlob, fileName);
      } catch (pdfErr) {
        console.warn("PDF Storage upload failed, proceeding with DB save:", pdfErr);
      }

      if (uploadedPdfUrl) {
        await supabase
          .from("lto_make_quotations")
          .update({ pdf_url: uploadedPdfUrl })
          .eq("quotation_no", authoritativeQuotationNo);

        setPdfUrl(uploadedPdfUrl);
      }

      if (isRevising && selectedQuotation) {
        setQuotationData((prev) => ({
          ...prev,
          quotationNo: authoritativeQuotationNo,
        }));
      }

      if (uploadedPdfUrl) {
        alert("Quotation saved successfully with PDF uploaded to Supabase!");
      } else {
        alert("Quotation saved to database successfully! (Note: PDF storage upload failed or bucket permissions restricted)");
      }

      // Reset form for new quotation
      const nextQuotationNumber = await getNextQuotationNumber();
      resetQuotationData(nextQuotationNumber);
      setSpecialDiscount(0);
      setSelectedReferences([]);
    } catch (error) {
      console.error("Error in handleSaveQuotation:", error);
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <QuotationHeader
        image={image1}
        isRevising={isRevising}
        toggleRevising={toggleRevising}
      />

      <div className="bg-white rounded-lg shadow border">
        <div className="border-b">
          <div className="flex">
            <button
              className={`px-4 py-2 font-medium ${activeTab === "edit"
                ? "brand-gradient text-white rounded-tl-lg"
                : "text-gray-600"
                }`}
              onClick={() => setActiveTab("edit")}
              disabled={isViewMode}
            >
              Edit Quotation
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === "preview"
                ? "brand-gradient text-white"
                : "text-gray-600"
                }`}
              onClick={() => setActiveTab("preview")}
            >
              Preview
            </button>
          </div>
        </div>

        <div className="p-4">
          {activeTab === "edit" ? (
            <QuotationForm
              quotationData={quotationData}
              handleInputChange={handleInputChange}
              handleItemChange={handleItemChange}
              handleFlatDiscountChange={handleFlatDiscountChange}
              handleAddItem={handleAddItem}
              handleNoteChange={handleNoteChange}
              addNote={addNote}
              removeNote={removeNote}
              hiddenFields={hiddenFields}
              toggleFieldVisibility={toggleFieldVisibility}
              isRevising={isRevising}
              existingQuotations={existingQuotations}
              selectedQuotation={selectedQuotation}
              handleQuotationSelect={handleQuotationSelect}
              isLoadingQuotation={isLoadingQuotation}
              handleSpecialDiscountChange={handleSpecialDiscountChangeWrapper}
              specialDiscount={specialDiscount}
              setSpecialDiscount={setSpecialDiscount}
              selectedReferences={selectedReferences}
              setSelectedReferences={setSelectedReferences}
              imageform={imageform}
              addSpecialOffer={addSpecialOffer}
              removeSpecialOffer={removeSpecialOffer}
              handleSpecialOfferChange={handleSpecialOfferChange}
              setQuotationData={setQuotationData}
              hiddenColumns={hiddenColumns}
              setHiddenColumns={setHiddenColumns}
              onQuotationSearch={triggerDropdownSearch}
              onLoadMoreQuotations={handleLoadMoreQuotations}
              hasMoreQuotations={hasMore}
              isFetchingMore={isFetchingMore}
            />
          ) : (
            <QuotationPreview
              quotationData={quotationData}
              quotationLink={quotationLink}
              pdfUrl={pdfUrl}
              selectedReferences={selectedReferences}
              specialDiscount={specialDiscount}
              imageform={imageform}
              handleGenerateLink={handleGenerateLink}
              handleGeneratePDF={handleGeneratePDF}
              isGenerating={isGenerating}
              isSubmitting={isSubmitting}
              hiddenColumns={hiddenColumns}
              hiddenFields={hiddenFields} // ← यह add करें

            />
          )}
        </div>
      </div>

      {activeTab === "edit" && (
        <div className="flex justify-between mt-4">
          <button
            className="bg-primary hover:opacity-90 text-white px-4 py-2 rounded-md flex items-center"
            onClick={handleSaveQuotation}
            disabled={isSubmitting || isGenerating}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <SaveIcon className="h-4 w-4 mr-2" />
                Save Quotation
              </>
            )}
          </button>
          <div className="space-x-2">
            <button
              className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-md flex items-center inline-flex"
              onClick={handleGenerateLink}
              disabled={isGenerating || isSubmitting}
            >
              <ShareIcon className="h-4 w-4 mr-2" />
              Generate Link
            </button>
            <button
              className="bg-primary hover:opacity-90 text-white px-4 py-2 rounded-md flex items-center inline-flex"
              onClick={handleGeneratePDF}
              disabled={isGenerating || isSubmitting}
            >
              <DownloadIcon className="h-4 w-4 mr-2" />
              {isGenerating ? "Generating..." : "Generate PDF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Quotation;
