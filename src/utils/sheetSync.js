// Pushes an order-received enquiry to the "ENQUIRY TO ORDER" tab of the
// long-standing master order sheet (spreadsheet
// 19tl7bNwYJjwZkqq7pzFF84encK6VxyeIS8fNzH2BksA) via a Google Apps Script
// Web App webhook. Called explicitly from the insert/update call sites in
// the enquiry-tracker pages — there is no database trigger, so a
// row/tracker record being DELETEd never touches the sheet, and only the
// codebase paths listed below can ever push data.
//
// This replaced an earlier sync target (a different, app-specific sheet)
// once this sheet's own legacy Apps Script (built against old flat
// Supabase tables that no longer exist) was retired in favor of this
// same explicit, app-level push mechanism.
//
// IMPORTANT: this module is designed to be fire-and-forget. Callers should
// NOT `await` syncEnquiryToSheet before showing their "saved" toast — use
// syncEnquiryToSheetInBackground so the sync runs after the response has
// already been shown to the user, and never adds latency to the save path.

import supabase from "./supabase";

const MAX_ITEM_SLOTS = 10;

// Sheet header names (row 1, columns A:CC) — the Apps Script looks up each
// key by header name rather than a fixed column index, so re-ordering
// columns in the sheet later won't silently break this mapping.
const toYesNo = (value) => (value ? "Yes" : "No");

const buildItemColumns = (items) => {
  const columns = {};
  const sorted = [...items].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  for (let i = 0; i < MAX_ITEM_SLOTS; i++) {
    const item = sorted[i];
    columns[`Item Name ${i + 1}`] = item ? item.item_name : "";
    columns[`Quantity ${i + 1}`] = item ? item.quantity : "";
  }

  // Items beyond the 10 fixed slots are merged into a single JSON
  // key/value column instead of growing the sheet's columns further.
  const overflow = sorted.slice(MAX_ITEM_SLOTS);
  columns["Item/Qty"] = overflow.length
    ? JSON.stringify(
        overflow.reduce((acc, item) => {
          acc[item.item_name] = item.quantity;
          return acc;
        }, {})
      )
    : "";

  return columns;
};

const buildPayloadRow = (enquiry, items, tracker) => {
  const totalQty = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  return {
    timestamp: enquiry.created_at,
    "Enquiry No.": enquiry.enquiry_no,
    "Lead Source": enquiry.lead_source,
    "Company Name": enquiry.company_name,
    "Phone Number": enquiry.phone_number,
    "Sales Person Name": enquiry.sales_person_name,
    Location: enquiry.location,
    Email: enquiry.email,
    "Shipping Address": enquiry.shipping_address,
    "Enquiry Receiver Name": enquiry.enquiry_receiver_name,
    "Enquiry Assign to Project": enquiry.enquiry_assign_to_person,
    "GST Number": enquiry.gst_number,
    "Enquiry Date": enquiry.enquiry_date,
    "Enquiry For State": enquiry.enquiry_for_state,
    // Sent under both keys since the sheet's actual header for this column
    // has been seen as "NOB" while the original column spec called it
    // "Project Name" — whichever text row 1 actually has will pick it up.
    "Project Name": enquiry.nob,
    NOB: enquiry.nob,
    "Sales Type": enquiry.sales_type,
    "Enquiry Approach": enquiry.enquiry_approach,
    ...buildItemColumns(items),
    Planned1: enquiry.planned_at,
    Actual1: tracker.created_at,
    Delay1: tracker.delay,
    "Enquiry Status": tracker.enquiry_status,
    "What Did Customer Say": tracker.what_did_customer_say,
    "Current Stage": tracker.current_stage,
    "Send Quotation No.": tracker.send_quotation_no,
    "Quotation Shared By": tracker.quotation_shared_by,
    "Quotation Number": tracker.quotation_number,
    "Quotation Value Without Tax": tracker.quotation_value_without_tax,
    "Quotation Value With Tax": tracker.quotation_value_with_tax,
    "Quotation Upload": tracker.quotation_upload,
    "Quotation Remarks": tracker.quotation_remarks,
    "Quotation Validator Name": tracker.quotation_validator_name,
    "Quotation Send Status": tracker.quotation_send_status,
    "Quotation Validation Remark": tracker.quotation_validation_remark,
    "Send FAQ Video": toYesNo(tracker.send_faq_video),
    "Send Product Video": toYesNo(tracker.send_product_video),
    "Send Offer Video": toYesNo(tracker.send_offer_video),
    "Send Product Catalog": toYesNo(tracker.send_product_catalog),
    "Send Product Image": toYesNo(tracker.send_product_image),
    "Next Call Date": tracker.next_call_date,
    "Next Call Time": tracker.next_call_time,
    "Is Order Received? Status": tracker.is_order_received_status,
    "Acceptance Via": tracker.acceptance_via,
    "Payment Mode": tracker.payment_mode,
    "Payment Terms (In Days)": tracker.payment_terms_days,
    Offer: tracker.warranty,
    "Acceptance File Upload": tracker.acceptance_file_upload,
    REMARK: tracker.remark,
    "Order Lost Apology Video": tracker.order_lost_apology_video,
    "If No then get relevant reason Status": tracker.if_no_reason_status,
    "If No then get relevant reason Remark": tracker.if_no_reason_remark,
    // No DB column or UI anywhere captures these yet (decided to leave
    // blank rather than build an "order hold" feature for now) — sent as
    // empty strings so the columns exist and are simply never populated.
    "CUSTOMER ORDER HOLD REASON CATEGORY": "",
    "HOLDING DATE": "",
    "HOLD REMARK": "",
    "Transport Mode": tracker.transport_mode,
    "CONVEYED FOR REGISTRATION FORM": toYesNo(
      tracker.conveyed_for_registration_form
    ),
    "Sales Cordinator Name": enquiry.sales_coordinator_name,
    "Calling Days": tracker.calling_days,
    "Order No.": tracker.order_no,
    "Amount With Gst": tracker.amount_with_tax,
    "Total qty": totalQty,
    Destination: tracker.destination,
    "Po Number": tracker.po_number,
    "last update": tracker.created_at,
  };
};

/**
 * Loads the enquiry + its items + the relevant tracker row, and POSTs one
 * sheet-ready row to the Apps Script webhook. Re-checks
 * is_order_received_status === 'yes' itself as a safety net even though
 * every call site already guards on it before calling this.
 *
 * Never throws — resolves to true/false. Intentionally NOT meant to be
 * awaited on the save path; use syncEnquiryToSheetInBackground instead.
 */
export const syncEnquiryToSheet = async ({ enquiryNo, trackerId }) => {
  const webhookUrl = import.meta.env.VITE_SHEET_SYNC_WEBHOOK_URL;
  const secret = import.meta.env.VITE_SHEET_SYNC_SECRET;

  if (!webhookUrl) {
    console.warn(
      "VITE_SHEET_SYNC_WEBHOOK_URL is not set — skipping Google Sheets sync."
    );
    return false;
  }

  try {
    const { data: enquiry, error: enquiryError } = await supabase
      .from("lto_enquiries")
      .select("*")
      .eq("enquiry_no", enquiryNo)
      .maybeSingle();

    if (enquiryError || !enquiry) {
      console.error("syncEnquiryToSheet: could not load enquiry", enquiryError);
      return false;
    }

    const { data: trackerRows, error: trackerError } = await supabase
      .from("lto_enquiry_tracker")
      .select("*")
      .eq("enquiry_id", enquiry.id)
      .order("created_at", { ascending: true });

    if (trackerError || !trackerRows?.length) {
      console.error(
        "syncEnquiryToSheet: could not load tracker row(s)",
        trackerError
      );
      return false;
    }

    // lto_enquiry_tracker is append-only — each stage (Make Quotation,
    // Order Expected, Order Status, inline History edits...) inserts its
    // OWN row, so no single row has the full picture. Merge every row for
    // this enquiry chronologically, letting later non-empty values win per
    // field, so e.g. quotation fields set at "Make Quotation" survive into
    // the merged view even though the "Order Status" row that actually
    // triggers this sync never touched them.
    const tracker = trackerRows.reduce((merged, current) => {
      Object.keys(current).forEach((key) => {
        const value = current[key];
        if (value !== null && value !== undefined && value !== "") {
          merged[key] = value;
        }
      });
      return merged;
    }, {});

    // trackerId (passed from a History-tab edit) pins which row must be
    // the one that actually qualifies this sync — the merge above still
    // pulls in older rows' quotation data, but the row being acted on is
    // what has to say "yes".
    const qualifyingRow = trackerId
      ? trackerRows.find((r) => r.id === trackerId)
      : trackerRows[trackerRows.length - 1];

    if (qualifyingRow?.is_order_received_status?.toLowerCase() !== "yes") {
      // Safety net — only order-received enquiries get pushed to the sheet.
      return false;
    }

    const { data: items, error: itemsError } = await supabase
      .from("lto_enquiry_items")
      .select("*")
      .eq("enquiry_id", enquiry.id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      console.error("syncEnquiryToSheet: could not load items", itemsError);
      return false;
    }

    const row = buildPayloadRow(enquiry, items || [], tracker);

    // text/plain avoids a CORS preflight against the Apps Script Web App,
    // matching the content-type already used elsewhere in this codebase.
    //
    // The Apps Script webhook can cold-start or occasionally hang; with no
    // timeout at all, the persistent "Syncing..." loading toast this feeds
    // (see call sites in EnquiryTracker.jsx/EnquiryTrackerForm.jsx) stayed
    // up and visibly spinning for however long that took, unbounded --
    // capping it here means callers always get an answer within 30s either
    // way, resolving false (treated as "sync may be delayed") on timeout.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret, sheetTab: "ENQUIRY TO ORDER", row }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const result = await response.json();
    return !!result.success;
  } catch (error) {
    console.error("syncEnquiryToSheet: unexpected error", error);
    return false;
  }
};

/**
 * Fire-and-forget wrapper. Kicks off syncEnquiryToSheet in the background
 * and, once it settles, hands the result to onSettled (e.g. to show a
 * follow-up toast) — without ever blocking the caller's own save flow.
 */
export const syncEnquiryToSheetInBackground = ({ enquiryNo, trackerId }, onSettled) => {
  syncEnquiryToSheet({ enquiryNo, trackerId })
    .then((success) => onSettled?.(success))
    .catch((error) => {
      console.error("syncEnquiryToSheetInBackground: unexpected error", error);
      onSettled?.(false);
    });
};
