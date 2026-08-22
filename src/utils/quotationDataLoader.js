// Pure data-loading logic extracted from Quotation.jsx's handleQuotationSelect
// (the "revise an existing quotation" flow) so it can be reused anywhere a
// quotation's full data needs to be loaded WITHOUT mounting the Quotation
// builder page or touching its React state -- specifically, for
// regenerateQuotationPdf.js's "heal a broken PDF link" feature.
//
// Keep this in sync with Quotation.jsx's handleQuotationSelect if that
// mapping ever changes -- there is currently no automated check that the
// two stay identical.

import supabase from "./supabase";
import { getStateCodeFromName } from "./gstStateCodes";
import { putFreightLast } from "./quotationItemsOrder";

// Re-resolves the quotation's linked lead/enquiry (if any), keyed by the
// quotation's own enquiry_reference_no ("LD-..."/"EN-..."), so consignee
// GST/address/state/state-code can be sourced LIVE from that record on every
// revision -- the same source a brand-new quotation gets them from via the
// Lead No. selection in quotation-form.jsx's handleLeadNoSelect -- instead of
// solely from whatever currently sits in lto_client_master. client_master
// remains the fallback below for quotations never tied to a specific
// lead/enquiry (e.g. created via direct Company Name entry with "Show Lead
// No." left off), or where the reference no longer resolves (record deleted
// since, or blank on quotations saved before this field existed).
const resolveLinkedLeadOrEnquiry = async (referenceNo) => {
  const ref = String(referenceNo || "").trim();
  if (!ref) return null;

  const isLead = ref.toUpperCase().startsWith("LD-");
  const isEnquiry = ref.toUpperCase().startsWith("EN-");
  if (!isLead && !isEnquiry) return null;

  try {
    const { data, error } = await supabase
      .from(isLead ? "lto_leads" : "lto_enquiries")
      .select("*")
      .ilike(isLead ? "lead_no" : "enquiry_no", ref)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (err) {
    console.error("loadQuotationDataByNumber: error resolving linked lead/enquiry", err);
    return null;
  }
};

/**
 * Loads a quotation by its quotation_no and maps it into the exact
 * `quotationData` shape generatePDFFromData() (pdf-generator.jsx) expects,
 * plus the selectedReferences/specialDiscount values that go alongside it.
 *
 * Returns null if the quotation isn't found or the query fails (logs the
 * error; callers decide how to surface that). Never throws.
 */
export const loadQuotationDataByNumber = async (quotationNo) => {
  if (!quotationNo) return null;

  try {
    const { data: loadedData, error } = await supabase
      .from("lto_make_quotations")
      .select(`
        *,
        consignor_details:lto_consignor_details (
          reference_name, state, address, contact_num, gstin, state_code, msme_num
        ),
        client_master:lto_client_master (
          company_name, billing_address, state, gst_number, state_code
        ),
        make_quotation_items:lto_make_quotation_items (*)
      `)
      .eq("quotation_no", quotationNo)
      .single();

    if (error || !loadedData) {
      console.error("loadQuotationDataByNumber: could not load quotation", error);
      return null;
    }

    const linkedRecord = await resolveLinkedLeadOrEnquiry(loadedData.enquiry_reference_no);

    const refName = loadedData.reference_name || "";
    const selectedReferences = refName
      ? refName.split(",").map((r) => r.trim()).filter((r) => r)
      : [];

    // make_quotation_items is the sole source of truth for line items --
    // every quotation in this DB already has its items normalized there.
    const sourceItems = loadedData.make_quotation_items || [];
    let items = [];

    if (sourceItems.length > 0) {
      items = sourceItems.map((item, index) => {
        const isFreight = item.is_freight || item.isFreight || item.item_name === "Freight" || item.name === "Freight";
        const itemName = item.item_name || item.name || "";
        const itemCode = item.item_code || item.code || "";
        const desc = item.description || "";
        const qty = item.quantity !== undefined ? item.quantity : (item.qty !== undefined ? item.qty : 1);
        const units = item.unit || item.units || "Nos";
        const rate = item.rate || 0;
        const gst = item.gst_percent !== undefined ? item.gst_percent : (item.gst !== undefined ? item.gst : 18);
        const discount = item.discount !== undefined ? item.discount : (item.disc !== undefined ? item.disc : 0);
        const flatDiscount = item.flat_discount !== undefined && item.flat_discount !== null ? item.flat_discount : 0;
        const amount = item.amount || 0;

        if (isFreight) {
          const shouldBeEmpty = desc.toLowerCase().trim().startsWith("extra as per");
          return {
            id: index + 1,
            code: itemCode,
            name: itemName || "Freight",
            description: shouldBeEmpty ? "" : desc,
            gst: 0,
            qty,
            units,
            rate,
            discount,
            flatDiscount,
            amount,
            isFreight: true,
          };
        }

        return {
          id: index + 1,
          code: itemCode,
          name: itemName,
          description: desc,
          gst,
          qty,
          units,
          rate,
          discount,
          flatDiscount,
          amount,
          isFreight: false,
        };
      });
    }

    // Ensure at least one default item and one Freight item exist if items is empty
    if (items.length === 0) {
      items = [
        { id: 1, code: "", name: "", description: "", gst: 18, qty: 1, units: "Nos", rate: 0, discount: 0, flatDiscount: 0, amount: 0 },
        { id: 2, code: "", name: "Freight", description: "", gst: 0, qty: 1, units: "Nos", rate: 0, discount: 0, flatDiscount: 0, amount: 0, isFreight: true },
      ];
    }

    // Freight was saved wherever it happened to sit in quotationData.items
    // at save time (see Quotation.jsx's insert) -- PostgREST/the DB gives
    // no ordering guarantee back, so re-derive "Freight last" here rather
    // than trusting the fetched order. Ids are reassigned sequentially
    // afterward so they stay 1..N in the new order (handleAddItem's
    // `Math.max(...ids) + 1` and React's `key` both rely on that).
    items = putFreightLast(items).map((item, index) => ({ ...item, id: index + 1 }));

    const subtotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    // flat_discount is a fixed currency amount (not a %), already baked
    // into each item's `amount` at save time -- this is purely the display
    // rollup for the "Total Flat Discount" summary row, not fed back into
    // taxableAmount (item.amount already reflects it, so subtracting it from
    // subtotal again here would double-count it).
    const totalFlatDiscount = items.reduce((sum, item) => sum + Number(item.flatDiscount || 0), 0);
    const cgstRate = 9;
    const sgstRate = 9;
    const taxableAmount = Math.max(0, subtotal);
    const cgstAmount = Number((taxableAmount * (cgstRate / 100)).toFixed(2));
    const sgstAmount = Number((taxableAmount * (sgstRate / 100)).toFixed(2));
    const specialDiscount = 0; // Same "will be calculated from items if needed" placeholder as the original flow
    const total = Number((taxableAmount + cgstAmount + sgstAmount - specialDiscount).toFixed(2));

    let specialOffers = [""];
    if (loadedData.special_offer) {
      if (typeof loadedData.special_offer === "string") {
        specialOffers = loadedData.special_offer.split("|").filter((offer) => offer.trim());
        if (specialOffers.length === 0) specialOffers = [""];
      } else if (Array.isArray(loadedData.special_offer)) {
        specialOffers = loadedData.special_offer;
      }
    }

    const quotationData = {
      enquiryReferenceNo: loadedData.enquiry_reference_no || "",
      quotationNo: loadedData.quotation_no || "",
      date: loadedData.quotation_date || "",
      preparedBy: loadedData.prepared_by || "",
      // consignor_details is now guaranteed (for quotations saved after the
      // consignor_id fix) to be the real branch entity matching the State
      // that was selected, not a reference row -- so state/address/GSTIN
      // come from that join. Reference name/number are a different concept
      // (the sales-staff referrer) and are stored directly on this record
      // instead, since consignor_id previously (mis)used for this can't
      // reliably represent both at once.
      consignorState: loadedData.consignor_details?.state || "",
      consignorName: loadedData.reference_name || "",
      consignorAddress: loadedData.consignor_details?.address || "",
      consignorMobile: loadedData.reference_number || "",
      consignorPhone: loadedData.reference_number || "",
      consignorGSTIN: loadedData.consignor_details?.gstin || "",
      consignorStateCode: loadedData.consignor_details?.state_code || "",
      // Priority: the linked lead/enquiry's OWN current fields (same source
      // a brand-new quotation uses), falling back to client_master only
      // when there's no resolvable lead/enquiry behind this quotation.
      consigneeName: linkedRecord?.company_name || loadedData.client_master?.company_name || "",
      consigneeAddress: linkedRecord
        ? (linkedRecord.address || linkedRecord.location || linkedRecord.shipping_address || "")
        : (loadedData.client_master?.billing_address || ""),
      shipTo: loadedData.ship_to_address || "",
      consigneeState: linkedRecord
        ? (linkedRecord.state || linkedRecord.enquiry_for_state || "")
        : (loadedData.client_master?.state || ""),
      consigneeContactName: loadedData.consignee_contact_name || "",
      consigneeContactNo: loadedData.consignee_contact_no || "",
      consigneeGSTIN: linkedRecord?.gst_number || loadedData.client_master?.gst_number || "",
      // Leads/enquiries have no state_code column of their own -- derive it
      // from the resolved state name (same fallback quotation-form.jsx's
      // handleLeadNoSelect uses), only falling back to client_master's
      // stored code if that derivation comes up empty.
      consigneeStateCode: (linkedRecord && getStateCodeFromName(linkedRecord.state || linkedRecord.enquiry_for_state || ""))
        || loadedData.client_master?.state_code
        || "",
      msmeNumber: loadedData.consignor_details?.msme_num || "",
      validity: loadedData.validity || "",
      paymentTerms: loadedData.payment_terms || "",
      delivery: loadedData.delivery || "",
      freight: loadedData.freight || "",
      insurance: loadedData.insurance || "",
      taxes: loadedData.taxes || "",
      // Blank means either this quotation predates the column (created
      // before it existed) or the field was never touched -- either way,
      // TermsAndConditions/pdf-generator.jsx already fall back to the same
      // hardcoded default text used for a brand-new quotation.
      warranty: loadedData.warranty || "",
      accountNo: loadedData.account_no || "",
      bankName: loadedData.bank_name || "",
      bankAddress: loadedData.bank_address || "",
      ifscCode: loadedData.ifsc_code || "",
      email: "",
      website: "",
      pan: "",
      items,
      subtotal,
      totalFlatDiscount,
      cgstRate,
      sgstRate,
      cgstAmount,
      sgstAmount,
      total,
      specialOffers,
      notes: loadedData.notes ? loadedData.notes.split("|").filter((note) => note.trim()) : [""],
    };

    return { quotationData, selectedReferences, specialDiscount, items };
  } catch (error) {
    console.error("loadQuotationDataByNumber: unexpected error", error);
    return null;
  }
};
