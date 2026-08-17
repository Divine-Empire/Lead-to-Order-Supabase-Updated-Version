import { useQuery } from "@tanstack/react-query";
import supabase from "../../utils/supabase";

// enquiry_pending_view's quotation_number / quotation_value_without_tax /
// quotation_value_with_tax / quotation_upload columns come straight from
// lto_enquiry_tracker, which is only ever written when someone manually
// fills in the "Process" stage form -- a quotation created directly from
// the Quotation module (or a later revision of one) never reaches the
// tracker on its own, so those columns render blank even though a real
// quotation exists. This overlays the true latest quotation (by
// created_at -- always the newest revision, since Quotation.jsx inserts a
// new row per revision rather than updating in place) from
// lto_make_quotations on top of whatever the view already has, per
// enquiry/lead reference number.
async function attachLatestQuotations(rows) {
  const refs = Array.from(new Set(
    rows.map((r) => String(r.display_no || "").trim().toUpperCase()).filter(Boolean)
  ));
  if (refs.length === 0) return rows;

  const { data: quotations, error: qErr } = await supabase
    .from("lto_make_quotations")
    .select("id, quotation_no, enquiry_reference_no, grand_total, pdf_url, created_at")
    .in("enquiry_reference_no", refs);
  if (qErr || !quotations || quotations.length === 0) return rows;

  const latestByRef = new Map();
  quotations.forEach((q) => {
    const ref = String(q.enquiry_reference_no || "").trim().toUpperCase();
    if (!ref) return;
    const existing = latestByRef.get(ref);
    if (!existing || new Date(q.created_at) > new Date(existing.created_at)) {
      latestByRef.set(ref, q);
    }
  });

  // lto_make_quotations has no "value without tax" column of its own
  // (grand_total is post-tax) -- it has to be summed from the line items,
  // same approach Report.jsx uses for the same table.
  const latestIds = Array.from(latestByRef.values()).map((q) => q.id);
  const amountByQId = new Map();
  if (latestIds.length > 0) {
    const { data: items } = await supabase
      .from("lto_make_quotation_items")
      .select("quotation_id, amount")
      .in("quotation_id", latestIds);
    (items || []).forEach((it) => {
      const amt = parseFloat(String(it.amount ?? 0).replace(/,/g, "")) || 0;
      amountByQId.set(it.quotation_id, (amountByQId.get(it.quotation_id) || 0) + amt);
    });
  }

  return rows.map((row) => {
    const ref = String(row.display_no || "").trim().toUpperCase();
    const latest = latestByRef.get(ref);
    if (!latest) return row; // no quotation exists yet -- genuinely blank
    return {
      ...row,
      quotation_number: latest.quotation_no,
      quotation_value_without_tax: amountByQId.get(latest.id) ?? row.quotation_value_without_tax,
      quotation_value_with_tax: latest.grand_total ?? row.quotation_value_with_tax,
      quotation_upload: latest.pdf_url || row.quotation_upload,
    };
  });
}

// Applies the filters shared by both the pending and history views. Every
// filter is a real WHERE clause against the view, not a client-side re-scan
// of whatever rows happen to already be loaded -- this is what lets a
// filter surface matches that haven't been paged into the UI yet.
function applySharedFilters(query, { searchTerm, currentStageFilter, valueFilter, callingDaysFilter, scNameFilter, isAdmin, usernamesToFilter }) {
  let q = query;

  if (searchTerm) {
    q = q.ilike("search_text", `%${searchTerm.toLowerCase()}%`);
  }
  if (currentStageFilter && currentStageFilter.length > 0) {
    q = q.in("current_stage", currentStageFilter);
  }
  if (valueFilter === "gte100000") {
    q = q.gte("quotation_value_without_tax", 100000);
  } else if (valueFilter === "lt100000") {
    q = q.lt("quotation_value_without_tax", 100000);
  }
  if (callingDaysFilter && callingDaysFilter.length > 0) {
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const clauses = [];
    if (callingDaysFilter.includes("today")) clauses.push(`and(next_call_date.gte.${today},next_call_date.lt.${tomorrow})`);
    if (callingDaysFilter.includes("overdue") || callingDaysFilter.includes("older")) clauses.push(`next_call_date.lt.${today}`);
    if (callingDaysFilter.includes("upcoming")) clauses.push(`next_call_date.gte.${tomorrow}`);
    if (clauses.length > 0) q = q.or(clauses.join(","));
  }

  if (!isAdmin && usernamesToFilter && usernamesToFilter.length > 0) {
    q = q.in("assigned_to", usernamesToFilter);
  } else if (isAdmin && scNameFilter && scNameFilter !== "all") {
    q = q.eq("assigned_to", scNameFilter);
  }

  return q;
}

export function usePendingEnquiries({
  page,
  itemsPerPage,
  searchTerm,
  currentStageFilter,
  valueFilter,
  callingDaysFilter,
  scNameFilter,
  isAdmin,
  usernamesToFilter,
  enabled = true,
}) {
  return useQuery({
    queryKey: [
      "enquiryTracker",
      "pending",
      page,
      itemsPerPage,
      searchTerm,
      currentStageFilter,
      valueFilter,
      callingDaysFilter,
      scNameFilter,
      isAdmin,
      usernamesToFilter,
    ],
    queryFn: async () => {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from("enquiry_pending_view")
        .select("*", { count: "exact" })
        .order("last_activity_at", { ascending: false })
        .range(from, to);

      query = applySharedFilters(query, { searchTerm, currentStageFilter, valueFilter, callingDaysFilter, scNameFilter, isAdmin, usernamesToFilter });

      const { data, error, count } = await query;
      if (error) throw error;
      const rows = await attachLatestQuotations(data || []);
      return { rows, totalCount: count || 0 };
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useHistoryEnquiries({
  page,
  itemsPerPage,
  searchTerm,
  currentStageFilter,
  valueFilter,
  callingDaysFilter,
  scNameFilter,
  isAdmin,
  usernamesToFilter,
  enabled = true,
}) {
  return useQuery({
    queryKey: [
      "enquiryTracker",
      "history",
      page,
      itemsPerPage,
      searchTerm,
      currentStageFilter,
      valueFilter,
      callingDaysFilter,
      scNameFilter,
      isAdmin,
      usernamesToFilter,
    ],
    queryFn: async () => {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from("enquiry_history_view")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      query = applySharedFilters(query, { searchTerm, currentStageFilter, valueFilter, callingDaysFilter, scNameFilter, isAdmin, usernamesToFilter });

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data || [], totalCount: count || 0 };
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

// current_stage is written by EnquiryTrackerForm.jsx from a small fixed set
// of radio values (plus "Unknown" for migrated rows with no recorded stage).
// Hardcoded rather than queried DISTINCT -- an unpaginated distinct query
// over a large view risks the exact silent-1000-row-cap bug this whole pass
// is fixing, just relocated to a dropdown.
export const CURRENT_STAGE_OPTIONS = [
  "make-quotation",
  "quotation-validation",
  "order-expected",
  "order-status",
  "Unknown",
];
