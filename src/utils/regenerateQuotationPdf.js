// Heals a broken quotation PDF link on demand. Some quotations' PDFs were
// uploaded to a Supabase Storage bucket that no longer exists (an earlier
// project was deleted) -- the file is gone, but every field needed to
// reproduce an equivalent PDF (items, consignor, client, bank details)
// still lives in lto_make_quotations/lto_make_quotation_items, so instead
// of a dead link, the PDF gets regenerated from that data on the first
// click after it breaks, then persisted so it's not regenerated again.
//
// This is reactive, not a bulk migration -- only ever runs for a specific
// quotation_no when isUrlReachable() reports its current stored URL is
// dead. Deliberately does NOT touch "Acceptance File" links elsewhere in
// the app -- those are user-uploaded original documents with no
// structured data to rebuild from, so a lost one is unrecoverable.

import supabase from "./supabase";
import { generatePDFFromData } from "../pages/Quotation/pdf-generator";
import { loadQuotationDataByNumber } from "./quotationDataLoader";

const QUOTATION_BUCKET = "quotation_image";

const dataUriToBlob = (dataUri) => {
  const base64Data = dataUri.split(",")[1];
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: "application/pdf" });
};

/**
 * Checks whether a URL currently resolves. Used before deciding to
 * regenerate -- most links still work, so this keeps the common case fast
 * (a HEAD request) and only falls back to a full GET if HEAD itself fails
 * at the network level (some storage/CDN configs reject HEAD outright).
 */
export const isUrlReachable = async (url) => {
  if (!url) return false;
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    return response.ok;
  } catch {
    try {
      const response = await fetch(url, { method: "GET", cache: "no-store" });
      return response.ok;
    } catch {
      return false;
    }
  }
};

const uploadRegeneratedPdf = async (blob, quotationNo) => {
  // Same bucket + filename convention as Quotation.jsx's uploadPDFToSupabase
  // -- upsert:true means re-uploading under the same quotation_no overwrites
  // the same object rather than creating a second one.
  const fileName = `Quotation_${quotationNo}.pdf`;
  const { error } = await supabase.storage
    .from(QUOTATION_BUCKET)
    .upload(fileName, blob, { contentType: "application/pdf", upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from(QUOTATION_BUCKET).getPublicUrl(fileName);
  return data?.publicUrl || null;
};

/**
 * Regenerates a quotation's PDF from its current DB data and uploads it,
 * healing every place that stores a copy of the URL:
 *   - lto_make_quotations.pdf_url (the canonical source)
 *   - lto_enquiry_tracker.quotation_upload (every matching row -- the same
 *     quotation_no can appear on more than one tracker row, since a
 *     quotation can be "sent" more than once)
 *   - lto_enquiry_tracker_for_leads.quotation_upload (same, for leads)
 *
 * Returns { blobUrl, newUrl } -- blobUrl is ready to open immediately (no
 * need to wait on the Storage upload), newUrl is what got persisted for
 * next time (null if the upload/DB update failed, but blobUrl is still
 * valid for this one viewing). Returns null if the quotation itself
 * couldn't be loaded or PDF generation failed outright.
 */
export const regenerateQuotationPdf = async (quotationNo) => {
  if (!quotationNo) return null;

  try {
    const loaded = await loadQuotationDataByNumber(quotationNo);
    if (!loaded) return null;

    const { quotationData, selectedReferences, specialDiscount } = loaded;

    const pdfDataUri = await generatePDFFromData(
      { ...quotationData, Quotation_No: quotationNo, quotation_no: quotationNo },
      selectedReferences,
      specialDiscount
    );

    if (!pdfDataUri || !pdfDataUri.startsWith("data:application/pdf")) {
      throw new Error("Invalid PDF data generated");
    }

    const blob = dataUriToBlob(pdfDataUri);
    const blobUrl = URL.createObjectURL(blob);

    let newUrl = null;
    try {
      newUrl = await uploadRegeneratedPdf(blob, quotationNo);
    } catch (uploadError) {
      console.error("regenerateQuotationPdf: upload failed", uploadError);
    }

    if (newUrl) {
      const [quotationUpdate, trackerUpdate, leadTrackerUpdate] = await Promise.all([
        supabase.from("lto_make_quotations").update({ pdf_url: newUrl }).eq("quotation_no", quotationNo),
        supabase.from("lto_enquiry_tracker").update({ quotation_upload: newUrl }).eq("quotation_number", quotationNo),
        supabase.from("lto_enquiry_tracker_for_leads").update({ quotation_upload: newUrl }).eq("quotation_number", quotationNo),
      ]);

      if (quotationUpdate.error) console.error("regenerateQuotationPdf: could not update lto_make_quotations", quotationUpdate.error);
      if (trackerUpdate.error) console.error("regenerateQuotationPdf: could not update lto_enquiry_tracker", trackerUpdate.error);
      if (leadTrackerUpdate.error) console.error("regenerateQuotationPdf: could not update lto_enquiry_tracker_for_leads", leadTrackerUpdate.error);
    }

    return { blobUrl, newUrl };
  } catch (error) {
    console.error("regenerateQuotationPdf: failed", error);
    return null;
  }
};
