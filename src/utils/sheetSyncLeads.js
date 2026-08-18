// Pushes an order-received LEAD to the "FMS" tab of the long-standing
// master order sheet (spreadsheet 19tl7bNwYJjwZkqq7pzFF84encK6VxyeIS8fNzH2BksA)
// via the same Apps Script Web App webhook used for enquiries (see
// sheetSync.js) -- just routed to a different sheet tab. Same
// fire-and-forget contract: call syncLeadToSheetInBackground from the
// save path, never await syncLeadToSheet before showing a "saved" toast.
//
// Leads have a two-stage tracker chain that enquiries don't:
//   lto_call_tracker_for_leads   (stage 1: call qualification)
//   lto_enquiry_tracker_for_leads (stage 2: quotation/order, mirrors
//                                  lto_enquiry_tracker for enquiries)
// Both are append-only (one row per stage event), so each is merged
// chronologically the same way sheetSync.js merges lto_enquiry_tracker --
// later non-empty value wins per field. This sheet names the two
// Planned/Actual/Delay pairs differently than the sheet this replaced:
// the FIRST (call-tracker) stage is the UNNUMBERED "Planned"/"Actual"/
// "Delay", and the SECOND (enquiry-tracker) stage is "Planned1"/"Actual1"/
// "Delay1" -- opposite of what those numbers might suggest at a glance.

import supabase from "./supabase";
import { mergeRowsChronologically } from "./mergeTrackerRows";

const MAX_ITEM_SLOTS = 5;

const toYesNo = (value) => (value ? "Yes" : "No");

const buildItemColumns = (items) => {
  const columns = {};
  const sorted = [...items].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  for (let i = 0; i < MAX_ITEM_SLOTS; i++) {
    const item = sorted[i];
    columns[`Item Name${i + 1}`] = item ? item.item_name : "";
    columns[`Quantity${i + 1}`] = item ? item.quantity : "";
  }

  const overflow = sorted.slice(MAX_ITEM_SLOTS);
  columns["Item/qty"] = overflow.length
    ? JSON.stringify(
        overflow.reduce((acc, item) => {
          acc[item.item_name] = item.quantity;
          return acc;
        }, {})
      )
    : "";

  return columns;
};

const buildPayloadRow = (lead, items, contacts, callTracker, callTrackerActualRow, enquiryTracker, enquiryTrackerQualifyingRow) => {
  const totalOrder = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  const contactColumns = {};
  for (let i = 0; i < 3; i++) {
    const contact = contacts[i];
    contactColumns[`Person name ${i + 1}`] = contact?.person_name || "";
    contactColumns[`Designation ${i + 1}`] = contact?.designation || "";
    contactColumns[`Phone number ${i + 1}`] = contact?.phone_number || "";
  }

  return {
    Timestamp: lead.created_at,
    "Lead No.": lead.lead_no,
    "Lead Receiver Name": lead.lead_receiver_name,
    "Lead Source": lead.lead_source,
    "Company Name": lead.company_name,
    "Phone Number": lead.phone_number,
    "Salesperson Name": lead.person_name,
    Location: lead.location,
    "Email Address": lead.email_address,
    State: lead.state,
    Address: lead.address,
    ...contactColumns,
    NOB: lead.nob,
    "GST Number": lead.gst_number,
    "Customer Registration Form": lead.customer_registration_form,
    "Credit Access": lead.credit_access,
    "Credit Days": lead.credit_days,
    "Credit Limit": lead.credit_limit,
    "Additional Notes": lead.additional_notes,
    Planned: lead.planned_at,
    Actual: callTrackerActualRow?.created_at,
    Delay: callTrackerActualRow?.delay,
    Status: lead.lead_status,
    "What did the customer say?": callTracker.what_did_customer_say,
    "Enquiry Received Status": callTracker.enquiry_received_status,
    "Enquiry Received Date": callTracker.enquiry_received_date,
    "Enquiry for State": callTracker.enquiry_for_state,
    "Project Name": callTracker.project_name,
    "Enquiry Type": callTracker.enquiry_type,
    "Enquiry Approach": callTracker.enquiry_approach,
    "Project Approximate Value": callTracker.project_approximate_value,
    ...buildItemColumns(items),
    "Next Action": callTracker.next_action,
    // The sheet has TWO "Next Call Date"/"Next Call Time" columns (this
    // one for the call-tracker stage, another further down for the
    // enquiry-tracker stage) -- since JS object keys can't repeat, the
    // second occurrence is disambiguated as "(2)". apps-script/Code.gs
    // matches header text occurrence-by-occurrence, so its 2nd "Next Call
    // Date" column looks specifically for this "(2)" key.
    "Next Call Date": callTracker.next_call_date,
    "Next Call Time": callTracker.next_call_time,
    Planned1: callTracker.planned_at,
    Actual1: enquiryTrackerQualifyingRow?.created_at,
    Delay1: enquiryTrackerQualifyingRow?.delay,
    "Enquiry Status": enquiryTracker.enquiry_status,
    "What Did Customer Say": enquiryTracker.what_did_customer_say,
    "Current Stage": enquiryTracker.current_stage,
    "Send Quotation No.": enquiryTracker.send_quotation_no,
    "Quotation Shared By": enquiryTracker.quotation_shared_by,
    "Quotation Number": enquiryTracker.quotation_number,
    "Quotation Value Without Tax": enquiryTracker.quotation_value_without_tax,
    "Quotation Value With Tax": enquiryTracker.quotation_value_with_tax,
    "Quotation Upload": enquiryTracker.quotation_upload,
    "Quotation Remarks": enquiryTracker.quotation_remarks,
    "Quotation Validator Name": enquiryTracker.quotation_validator_name,
    "Quotation Send Status": enquiryTracker.quotation_send_status,
    "Quotation Validation Remark": enquiryTracker.quotation_validation_remark,
    "Send FAQ Video": toYesNo(enquiryTracker.send_faq_video),
    "Send Product Video": toYesNo(enquiryTracker.send_product_video),
    "Send Offer Video": toYesNo(enquiryTracker.send_offer_video),
    "Send Product Catalog": toYesNo(enquiryTracker.send_product_catalog),
    "Send Product Image": toYesNo(enquiryTracker.send_product_image),
    // 2nd occurrence of "Next Call Date"/"Next Call Time" in the sheet --
    // this pair belongs to the enquiry-tracker stage. See the note above
    // the first occurrence for why this needs a disambiguated key.
    "Next Call Date (2)": enquiryTracker.next_call_date,
    "Next Call Time (2)": enquiryTracker.next_call_time,
    "Is Order Received? Status": enquiryTracker.is_order_received_status,
    "Acceptance Via": enquiryTracker.acceptance_via,
    "Payment Mode": enquiryTracker.payment_mode,
    "Payment Terms (In Days)": enquiryTracker.payment_terms_days,
    // This sheet calls the warranty column "Offer" (matching the enquiry
    // sheet's naming for the same underlying field), not "Warranty".
    Offer: enquiryTracker.warranty,
    "Acceptance File Upload": enquiryTracker.acceptance_file_upload,
    REMARK: enquiryTracker.remark,
    "Order Lost Apology Video": enquiryTracker.order_lost_apology_video,
    "If No then get relevant reason Status": enquiryTracker.if_no_reason_status,
    "If No then get relevant reason Remark": enquiryTracker.if_no_reason_remark,
    // No DB column or UI anywhere captures these yet (decided to leave
    // blank rather than build an "order hold" feature for now) — sent as
    // empty strings so the columns exist and are simply never populated.
    "CUSTOMER ORDER HOLD REASON CATEGORY": "",
    "HOLDING DATE": "",
    "HOLD REMARK": "",
    "SC Name": lead.sc_name,
    // This sheet has "Calling Days" TWICE -- once per tracker stage,
    // same pattern as the Next Call Date/Time pair above.
    "Calling Days": callTracker.calling_days,
    "Calling Days (2)": enquiryTracker.calling_days,
    "Leads Tracking Status": enquiryTracker.current_stage,
    "Order No.": enquiryTracker.order_no,
    "Transport Mode": enquiryTracker.transport_mode,
    "CONVEYED FOR REGISTRATION FORM": toYesNo(enquiryTracker.conveyed_for_registration_form),
    "Total Order": totalOrder,
    "Amount With Gst": enquiryTracker.amount_with_tax,
    Destination: enquiryTracker.destination,
    "Po Number": enquiryTracker.po_number,
    "last update": enquiryTrackerQualifyingRow?.created_at,
  };
};

/**
 * Loads the lead + its items + contacts + both tracker stages, and POSTs
 * one sheet-ready row to the Apps Script webhook (routed to the
 * "FMS" tab). Re-checks is_order_received_status === 'yes' on
 * the qualifying lto_enquiry_tracker_for_leads row as a safety net, same
 * pattern as syncEnquiryToSheet.
 *
 * Never throws -- resolves to true/false. Not meant to be awaited on the
 * save path; use syncLeadToSheetInBackground instead.
 */
export const syncLeadToSheet = async ({ leadNo, trackerId }) => {
  const webhookUrl = import.meta.env.VITE_SHEET_SYNC_WEBHOOK_URL;
  const secret = import.meta.env.VITE_SHEET_SYNC_SECRET;

  if (!webhookUrl) {
    console.warn(
      "VITE_SHEET_SYNC_WEBHOOK_URL is not set — skipping Google Sheets sync."
    );
    return false;
  }

  try {
    const { data: lead, error: leadError } = await supabase
      .from("lto_leads")
      .select("*")
      .eq("lead_no", leadNo)
      .maybeSingle();

    if (leadError || !lead) {
      console.error("syncLeadToSheet: could not load lead", leadError);
      return false;
    }

    const { data: enquiryTrackerRows, error: enquiryTrackerError } = await supabase
      .from("lto_enquiry_tracker_for_leads")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true });

    if (enquiryTrackerError || !enquiryTrackerRows?.length) {
      console.error(
        "syncLeadToSheet: could not load enquiry-tracker row(s)",
        enquiryTrackerError
      );
      return false;
    }

    const enquiryTracker = mergeRowsChronologically(enquiryTrackerRows);

    const enquiryTrackerQualifyingRow = trackerId
      ? enquiryTrackerRows.find((r) => r.id === trackerId)
      : enquiryTrackerRows[enquiryTrackerRows.length - 1];

    if (enquiryTrackerQualifyingRow?.is_order_received_status?.toLowerCase() !== "yes") {
      // Safety net — only order-received leads get pushed to the sheet.
      return false;
    }

    const { data: callTrackerRows, error: callTrackerError } = await supabase
      .from("lto_call_tracker_for_leads")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true });

    if (callTrackerError) {
      console.error("syncLeadToSheet: could not load call-tracker row(s)", callTrackerError);
      return false;
    }

    const callTracker = mergeRowsChronologically(callTrackerRows || []);

    // The call-tracker row that actually qualified this lead into the
    // enquiry stage — its own created_at/delay are Actual1/Delay1.
    const qualifyingCallRows = (callTrackerRows || []).filter(
      (r) => r.enquiry_received_status?.toLowerCase() === "yes"
    );
    const callTrackerActualRow = qualifyingCallRows.length
      ? qualifyingCallRows[qualifyingCallRows.length - 1]
      : callTrackerRows?.[callTrackerRows.length - 1];

    const { data: items, error: itemsError } = await supabase
      .from("lto_lead_items")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      console.error("syncLeadToSheet: could not load items", itemsError);
      return false;
    }

    const { data: contacts, error: contactsError } = await supabase
      .from("lto_lead_contacts")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true });

    if (contactsError) {
      console.error("syncLeadToSheet: could not load contacts", contactsError);
      return false;
    }

    const row = buildPayloadRow(
      lead,
      items || [],
      contacts || [],
      callTracker,
      callTrackerActualRow,
      enquiryTracker,
      enquiryTrackerQualifyingRow
    );

    // text/plain avoids a CORS preflight against the Apps Script Web App,
    // matching the enquiry-sync convention. sheetTab tells the shared
    // Apps Script which tab to write into.
    //
    // Same 30s cap as sheetSync.js's syncEnquiryToSheet -- see that file
    // for why: an unbounded fetch here left the persistent "Syncing..."
    // loading toast spinning for as long as the webhook took, with no cap.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret, sheetTab: "FMS", row }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const result = await response.json();
    return !!result.success;
  } catch (error) {
    console.error("syncLeadToSheet: unexpected error", error);
    return false;
  }
};

/**
 * Fire-and-forget wrapper. Kicks off syncLeadToSheet in the background
 * and, once it settles, hands the result to onSettled (e.g. to show a
 * follow-up toast) — without ever blocking the caller's own save flow.
 */
export const syncLeadToSheetInBackground = ({ leadNo, trackerId }, onSettled) => {
  syncLeadToSheet({ leadNo, trackerId })
    .then((success) => onSettled?.(success))
    .catch((error) => {
      console.error("syncLeadToSheetInBackground: unexpected error", error);
      onSettled?.(false);
    });
};
