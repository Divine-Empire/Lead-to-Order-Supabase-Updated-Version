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

    const refName = loadedData.consignor_details?.reference_name || "";
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
            flatDiscount: 0,
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
          flatDiscount: 0,
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

    const subtotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalFlatDiscount = 0;
    const cgstRate = 9;
    const sgstRate = 9;
    const taxableAmount = Math.max(0, subtotal - totalFlatDiscount);
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
      consignorState: loadedData.consignor_details?.state || "",
      consignorName: loadedData.consignor_details?.reference_name || "",
      consignorAddress: loadedData.consignor_details?.address || "",
      consignorMobile: loadedData.consignor_details?.contact_num?.toString() || "",
      consignorPhone: loadedData.consignor_details?.contact_num?.toString() || "",
      consignorGSTIN: loadedData.consignor_details?.gstin || "",
      consignorStateCode: loadedData.consignor_details?.state_code || "",
      consigneeName: loadedData.client_master?.company_name || "",
      consigneeAddress: loadedData.client_master?.billing_address || "",
      shipTo: loadedData.ship_to_address || "",
      consigneeState: loadedData.client_master?.state || "",
      consigneeContactName: loadedData.consignee_contact_name || "",
      consigneeContactNo: loadedData.consignee_contact_no || "",
      consigneeGSTIN: loadedData.client_master?.gst_number || "",
      consigneeStateCode: loadedData.client_master?.state_code || "",
      msmeNumber: loadedData.consignor_details?.msme_num || "",
      validity: loadedData.validity || "",
      paymentTerms: loadedData.payment_terms || "",
      delivery: loadedData.delivery || "",
      freight: loadedData.freight || "",
      insurance: loadedData.insurance || "",
      taxes: loadedData.taxes || "",
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
