import { useQuery } from "@tanstack/react-query";
import supabase from "../../utils/supabase";

// Applies the filters shared by both the pending and history views. Every
// filter is a real WHERE clause against the view, not a client-side re-scan
// of whatever rows happen to already be loaded -- this is what lets a
// filter surface matches that haven't been paged into the UI yet.
function applySharedFilters(query, { searchTerm, currentStageFilter, enquiryNoFilter, callingDaysFilter, scNameFilter, isAdmin, usernamesToFilter }) {
  let q = query;

  if (searchTerm) {
    q = q.ilike("search_text", `%${searchTerm.toLowerCase()}%`);
  }
  if (currentStageFilter && currentStageFilter.length > 0) {
    q = q.in("current_stage", currentStageFilter);
  }
  if (enquiryNoFilter && enquiryNoFilter.length > 0) {
    q = q.in("display_no", enquiryNoFilter);
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
  enquiryNoFilter,
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
      enquiryNoFilter,
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

      query = applySharedFilters(query, { searchTerm, currentStageFilter, enquiryNoFilter, callingDaysFilter, scNameFilter, isAdmin, usernamesToFilter });

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data || [], totalCount: count || 0 };
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
  enquiryNoFilter,
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
      enquiryNoFilter,
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

      query = applySharedFilters(query, { searchTerm, currentStageFilter, enquiryNoFilter, callingDaysFilter, scNameFilter, isAdmin, usernamesToFilter });

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
