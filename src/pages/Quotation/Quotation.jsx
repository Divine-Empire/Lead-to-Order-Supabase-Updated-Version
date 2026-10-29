"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { DownloadIcon, SaveIcon, ShareIcon } from "../../components/Icons";
import image1 from "../../assests/WhatsApp Image 2025-05-14 at 4.11.43 PM.jpeg";
import imageform from "../../assests/banner.jpeg";
import QuotationHeader from "./quotation-header";
import QuotationForm from "./quotation-form";
import QuotationPreview from "./quotation-preview";
import { generatePDFFromData } from "./pdf-generator";
import { getNextQuotationNumber, isQuotationNoTaken, insertQuotationWithFreshNumber } from "./quotation-service";
import ModalAlert from "../../components/ModalAlert";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useQuotationData } from "./use-quotation-data";
import supabase from "../../utils/supabase";
import { notifyReferenceNameChanged } from "../../utils/quotationWhatsapp";
import { loadQuotationDataByNumber } from "../../utils/quotationDataLoader";
import { putPackagingAndFreightLast } from "../../utils/quotationItemsOrder";

function Quotation() {
  const [activeTab, setActiveTab] = useState("edit");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Centered result popup (replaces the browser alert()): { type, title, message }
  const [popup, setPopup] = useState(null);
  const showPopup = (type, title, message) => setPopup({ type, title, message });
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
  const DEFAULT_HIDDEN_COLUMNS = {
    hideDisc: false,
    hideFlatDisc: false,
    hideTotalFlatDisc: false,
    hideSpecialDiscount: false,
  };
  const [hiddenColumns, setHiddenColumns] = useState(DEFAULT_HIDDEN_COLUMNS);

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

  // A page left open for a while can hold a number that another quotation has
  // taken since. When the tab comes back into focus, re-check it and move to
  // the next free number (with a notice) instead of failing later on Submit.
  const quotationNoRef = useRef(quotationData.quotationNo);
  useEffect(() => {
    quotationNoRef.current = quotationData.quotationNo;
  }, [quotationData.quotationNo]);
  const isSubmittingRef = useRef(false);
  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useEffect(() => {
    if (isRevising || isViewMode) return undefined;
    let busy = false;
    const check = async () => {
      if (busy || isSubmittingRef.current || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const current = quotationNoRef.current;
        const prefix = (current ? current.split("-")[0] : "") || "NBD";
        if (!current) {
          const fresh = await getNextQuotationNumber(prefix);
          setQuotationData((prev) => (prev.quotationNo ? prev : { ...prev, quotationNo: fresh }));
        } else if (await isQuotationNoTaken(current)) {
          const fresh = await getNextQuotationNumber(prefix);
          if (isSubmittingRef.current) return; // a save started while we were checking
          setQuotationData((prev) => (prev.quotationNo === current ? { ...prev, quotationNo: fresh } : prev));
          showPopup("warning", "Quotation number updated", `${current} was already used by another quotation. This quotation now uses ${fresh}.`);
        }
      } catch (error) {
        console.error("Quotation number check failed:", error);
      } finally {
        busy = false;
      }
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [isRevising, isViewMode, setQuotationData]);

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
        // Same leak as handleQuotationSelect's reset below, but for the
        // "start a fresh new quotation" path: a "Hide Description" (or any
        // other column) toggle left on from the previous quotation must not
        // silently carry over into this one.
        setHiddenColumns(DEFAULT_HIDDEN_COLUMNS);
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
        showPopup("error", "Could not load quotation", "Failed to load the quotation data. Please try again.");
        return;
      }

      const { quotationData: loadedQuotationData, selectedReferences, specialDiscount: loadedSpecialDiscount, items } = result;

      // Column-visibility toggles (e.g. "Hide Description") are page-level
      // UI state, not per-quotation data -- without this reset, a toggle left
      // on from a PREVIOUS quotation silently carries over and gets baked
      // into this one's generated/saved PDF (e.g. a hidden Description
      // column disappearing from the uploaded file even though the item's
      // description is saved correctly in the DB).
      setHiddenColumns(DEFAULT_HIDDEN_COLUMNS);

      setSelectedReferences(selectedReferences);
      setQuotationData(loadedQuotationData);
      setSpecialDiscount(loadedSpecialDiscount);

      handleSpecialDiscountChangeWrapper(loadedSpecialDiscount);
      handleInputChange("consignorState", loadedQuotationData.consignorState);
      handleInputChange("consigneeState", loadedQuotationData.consigneeState);
      handleInputChange("items", items);
    } catch (error) {
      console.error("Error fetching quotation data:", error);
      showPopup("error", "Could not load quotation", "Failed to load the quotation data. Please try again.");
    } finally {
      setIsLoadingQuotation(false);
    }
  };

  // A new (non-revision) quotation's number is picked when the page loads, so
  // it can go stale if other quotations were saved meanwhile. Re-checks it
  // against the DB and, if it's already used, switches the form to the next
  // free number. Returns the number to use.
  const ensureFreshQuotationNo = async () => {
    const current = quotationData.quotationNo;
    try {
      if (current && !(await isQuotationNoTaken(current))) return current;
      const fresh = await getNextQuotationNumber((current ? current.split("-")[0] : "") || "NBD");
      setQuotationData((prev) => ({ ...prev, quotationNo: fresh }));
      return fresh;
    } catch (error) {
      console.error("Could not verify the quotation number:", error);
      return current;
    }
  };

  const handleGeneratePDF = async () => {
    setIsGenerating(true);

    try {
      // Prefer backend number if present, otherwise fall back
      const existingNo =
        quotationData.Quotation_No ||
        quotationData.finalQuotationNo ||
        quotationData.quotationNo;
      const preferredNo = isRevising || isViewMode ? existingNo : await ensureFreshQuotationNo();
      const numberChanged = preferredNo && preferredNo !== existingNo;

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
      if (numberChanged) {
        showPopup(
          "warning",
          "PDF downloaded with a new number",
          `${existingNo} was already used by another quotation, so this PDF (and the form) now use ${preferredNo}.`
        );
      } else {
        showPopup("success", "PDF downloaded", `Quotation_${preferredNo}.pdf has been downloaded.`);
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      showPopup("error", "PDF not generated", "Failed to generate PDF: " + error.message);
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

      showPopup("success", "Link generated", "The quotation link is ready to share.");
    } catch (error) {
      console.error("Error generating link:", error);
      showPopup("error", "Link not generated", "Failed to generate link: " + error.message);
      setIsGenerating(false);
    }
  };

  const handleSaveQuotation = async () => {
    if (!quotationData.consigneeName) {
      showPopup("warning", "Company name missing", "Please select a company name.");
      return;
    }

    if (!quotationData.preparedBy) {
      showPopup("warning", "Prepared by missing", "Please enter the prepared by name.");
      return;
    }

    setIsSubmitting(true);
    let insertedNo = null; // set once the quotation row exists in the DB
    let itemsProblem = null; // set if the line items could not be saved

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

      // Convert special offers array to string for database storage
      const specialOffersString = quotationData.specialOffers
        ? quotationData.specialOffers.filter((offer) => offer.trim()).join("|")
        : "";

      // Try insert with retries on unique constraint (concurrent save)
      let authoritativeQuotationNo = null;
      let authoritativeQuotationId = null;

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

      // The number shown in the form was picked when the page loaded (or after
      // the previous save) and may be stale by now -- other quotations can have
      // been saved since. So the number actually used is always read from the
      // DB at submit time; the form's number only supplies the prefix.
      let candidateNo = quotationData.quotationNo || (await getNextQuotationNumber());
      const currentPrefix = extractPrefix(candidateNo);
      const prefixCode = currentPrefix.split("-")[0] || "NBD";

      // Number allocation + insert in one place (quotation-service.jsx): the
      // number is read from the DB now, and a conflict re-reads it. For a
      // revision the true max revision is used, not the one picked in the list.
      const { data: insertedRow, quotationNo: finalNo } = await insertQuotationWithFreshNumber({
        prefixCode,
        revisingFrom: isRevising && selectedQuotation ? candidateNo : null,
        buildRecord: (quotationNo) => {
        const quotationRecord = {
          enquiry_reference_no: quotationData.enquiryReferenceNo || null,
          quotation_no: quotationNo,
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

          return quotationRecord;
        },
      });
      authoritativeQuotationNo = insertedRow.quotation_no || finalNo;
      authoritativeQuotationId = insertedRow.id || null;
      insertedNo = authoritativeQuotationNo;

      // Insert line items into make_quotation_items. item_order persists the
      // exact save-time position (lto_make_quotation_items has no ordering
      // guarantee of its own -- a bulk insert all lands under the same
      // transaction `now()`, so created_at ties and the DB hands rows back
      // in arbitrary order) -- quotationDataLoader.js sorts by this column
      // on every load/revision so items always come back in the order they
      // were saved, with Packaging & Forwarding then Freight always pinned
      // last (see putPackagingAndFreightLast).
      if (authoritativeQuotationId) {
        const itemsPayload = putPackagingAndFreightLast(quotationData.items || [])
          .filter((it) => it && (it.name || it.code || Number(it.amount) > 0))
          .map((it, index) => ({
            quotation_id: authoritativeQuotationId,
            quotation_no: authoritativeQuotationNo,
            item_code: it.code || null,
            item_name: it.name || "Item",
            technical_specs: it.description || null,
            type: "basic",
            quantity: Number(it.qty) || 0,
            unit: it.units || "Nos",
            rate: Number(it.rate) || 0,
            gst_percent: Number(it.gst) || 0,
            discount: Number(it.discount) || 0,
            flat_discount: Number(it.flatDiscount) || 0,
            amount: Number(it.amount) || 0,
            is_freight: Boolean(it.isFreight),
            item_order: index,
          }));

        if (itemsPayload.length > 0) {
          const { error: itemsError } = await supabase
            .from("lto_make_quotation_items")
            .insert(itemsPayload);

          if (itemsError) {
            console.error("Error saving quotation line items:", itemsError.message);
            itemsProblem = itemsError.message;
          }
        }
      }

      // Now generate PDF using the authoritative number. The quotation row is
      // already saved at this point, so a PDF problem is reported as such (not
      // as a failed submission) and the form is still reset below.
      let uploadedPdfUrl = null;
      let pdfProblem = null;
      try {
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
      try {
        const fileName = `Quotation_${authoritativeQuotationNo}.pdf`;
        uploadedPdfUrl = await uploadPDFToSupabase(pdfBlob, fileName);
      } catch (pdfErr) {
        console.warn("PDF Storage upload failed, proceeding with DB save:", pdfErr);
      }
      } catch (pdfFlowErr) {
        console.error("PDF generation failed after the quotation was saved:", pdfFlowErr);
        pdfProblem = pdfFlowErr.message || "the PDF could not be generated";
      }

      if (uploadedPdfUrl) {
        await supabase
          .from("lto_make_quotations")
          .update({ pdf_url: uploadedPdfUrl })
          .eq("quotation_no", authoritativeQuotationNo);

        setPdfUrl(uploadedPdfUrl);
      }

      // A revision may have changed the Reference Name: the Edge Function
      // compares with the previous revision and WhatsApps the recipients
      // only if it did. Best-effort, never blocks the save.
      if (isRevising && selectedQuotation) {
        await notifyReferenceNameChanged(authoritativeQuotationNo);
      }

      if (isRevising && selectedQuotation) {
        setQuotationData((prev) => ({
          ...prev,
          quotationNo: authoritativeQuotationNo,
        }));
      }

      // Reset form for new quotation. If the next number can't be read right
      // now it is left empty and picked at submit time (never a made-up one).
      let nextQuotationNumber = "";
      try {
        nextQuotationNumber = await getNextQuotationNumber();
      } catch (numErr) {
        console.error("Could not read the next quotation number:", numErr);
      }
      resetQuotationData(nextQuotationNumber);
      setSpecialDiscount(0);
      setSelectedReferences([]);
      // Same leak as handleQuotationSelect's reset: a column-visibility
      // toggle (e.g. "Hide Description") left on from the just-saved
      // quotation must not silently carry into the next one typed in the
      // same sitting.
      setHiddenColumns(DEFAULT_HIDDEN_COLUMNS);

      if (itemsProblem) {
        showPopup(
          "error",
          "Quotation saved WITHOUT its items",
          `Quotation ${authoritativeQuotationNo} was saved, but its line items could not be saved (${itemsProblem}). Please check it and re-create the quotation if needed.`
        );
      } else if (uploadedPdfUrl && !pdfProblem) {
        showPopup("success", "Quotation submitted", `Quotation ${authoritativeQuotationNo} was saved and its PDF uploaded.`);
      } else {
        showPopup(
          "warning",
          "Quotation saved, PDF missing",
          `Quotation ${authoritativeQuotationNo} was saved, but its PDF could not be ${pdfProblem ? "generated" : "uploaded"}` +
            `${pdfProblem ? ` (${pdfProblem})` : ""}. Load it from Revise to download the PDF again.`
        );
      }
    } catch (error) {
      console.error("Error in handleSaveQuotation:", error);
      if (insertedNo) {
        showPopup("warning", "Quotation saved, but something failed", `Quotation ${insertedNo} is saved. Afterwards: ${error.message}`);
      } else {
        showPopup("error", "Quotation NOT submitted", error.message);
      }
      // Whatever went wrong, don't leave the form holding a used / stale number.
      if (!isRevising) {
        try {
          const fresh = await getNextQuotationNumber(
            (quotationData.quotationNo ? quotationData.quotationNo.split("-")[0] : "") || "NBD"
          );
          setQuotationData((prev) => ({ ...prev, quotationNo: fresh }));
        } catch (numErr) {
          console.error("Could not refresh the quotation number:", numErr);
        }
      }
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

      {/* Full-screen loader while a quotation is being saved (number, DB rows, PDF, upload). */}
      {isSubmitting && (
        <LoadingSpinner fullPage message="Saving quotation and generating its PDF. Please don't close or refresh this page." />
      )}

      <ModalAlert
        isOpen={Boolean(popup)}
        type={popup?.type}
        title={popup?.title}
        message={popup?.message}
        onClose={() => setPopup(null)}
      />
    </div>
  );
}

export default Quotation;
