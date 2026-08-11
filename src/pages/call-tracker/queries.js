import { useQuery } from "@tanstack/react-query";
import supabase from "../../utils/supabase";

// Shared by both tabs: search + SC-name scoping.
function applyCommonFilters(query, { searchTerm, scNameFilter, isAdmin, usernamesToFilter }) {
  let q = query;
  if (searchTerm) {
    q = q.ilike("search_text", `%${searchTerm.toLowerCase()}%`);
  }
  if (!isAdmin && usernamesToFilter && usernamesToFilter.length > 0) {
    q = q.in("assigned_to", usernamesToFilter);
  } else if (isAdmin && scNameFilter && scNameFilter.length > 0) {
    q = q.in("assigned_to", scNameFilter);
  }
  return q;
}

export function usePendingCallTracker({
  page,
  itemsPerPage,
  searchTerm,
  scNameFilter,
  personFilter,
  phoneFilter,
  dateFilter,
  isAdmin,
  usernamesToFilter,
  enabled = true,
}) {
  return useQuery({
    queryKey: [
      "callTracker",
      "pending",
      page,
      itemsPerPage,
      searchTerm,
      scNameFilter,
      personFilter,
      phoneFilter,
      dateFilter,
      isAdmin,
      usernamesToFilter,
    ],
    queryFn: async () => {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from("call_tracker_pending_view")
        .select("*", { count: "exact" });

      query = applyCommonFilters(query, { searchTerm, scNameFilter, isAdmin, usernamesToFilter });

      if (personFilter && personFilter.length > 0) {
        query = query.in("person_name", personFilter);
      }
      if (phoneFilter && phoneFilter.length > 0) {
        query = query.in("phone_number", phoneFilter);
      }
      if (dateFilter && dateFilter !== "all") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split("T")[0];
        if (dateFilter === "today") {
          query = query.eq("next_call_date", todayStr);
        } else if (dateFilter === "overdue") {
          query = query.lt("next_call_date", todayStr);
        } else if (dateFilter === "upcoming") {
          query = query.gt("next_call_date", todayStr);
        }
      }

      // Ascending by display_no -- matches the numeric-aware leadId sort the
      // old client-side sort used for the Pending tab.
      query = query.order("display_no", { ascending: true }).range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data || [], totalCount: count || 0 };
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useHistoryCallTracker({
  page,
  itemsPerPage,
  searchTerm,
  scNameFilter,
  companyFilter,
  filterType,
  dateFilter,
  startDate,
  endDate,
  isAdmin,
  usernamesToFilter,
  enabled = true,
}) {
  return useQuery({
    queryKey: [
      "callTracker",
      "history",
      page,
      itemsPerPage,
      searchTerm,
      scNameFilter,
      companyFilter,
      filterType,
      dateFilter,
      startDate,
      endDate,
      isAdmin,
      usernamesToFilter,
    ],
    queryFn: async () => {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from("call_tracker_history_view")
        .select("*", { count: "exact" });

      query = applyCommonFilters(query, { searchTerm, scNameFilter, isAdmin, usernamesToFilter });

      if (companyFilter && companyFilter.length > 0) {
        query = query.in("company_name", companyFilter);
      }
      if (filterType === "first") {
        query = query.or('status.is.null,status.eq."",status.eq."New"');
      } else if (filterType === "multi") {
        query = query.ilike("status", "%expected%");
      }
      if (dateFilter === "today") {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        query = query.gte("created_at", todayStr);
      } else if (dateFilter === "older") {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        query = query.lt("created_at", todayStr);
      }
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data || [], totalCount: count || 0 };
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

// Lightweight count-only queries for the tab/filter badge numbers, so those
// don't require pulling every row into memory just to count them.
export async function fetchCallTrackerFilterTypeCounts({ activeTab, scNameFilter, companyFilter, isAdmin, usernamesToFilter }) {
  try {
    if (activeTab === "pending") {
      let q = supabase.from("call_tracker_pending_view").select("*", { count: "exact", head: true });
      if (!isAdmin && usernamesToFilter && usernamesToFilter.length > 0) {
        q = q.in("assigned_to", usernamesToFilter);
      } else if (isAdmin && scNameFilter && scNameFilter.length > 0) {
        q = q.in("assigned_to", scNameFilter);
      }
      const { count } = await q;
      return { all: count || 0, first: count || 0, multi: count || 0 };
    }

    const base = () => {
      let q = supabase.from("call_tracker_history_view").select("*", { count: "exact", head: true });
      if (companyFilter && companyFilter.length > 0) q = q.in("company_name", companyFilter);
      if (!isAdmin && usernamesToFilter && usernamesToFilter.length > 0) {
        q = q.in("assigned_to", usernamesToFilter);
      } else if (isAdmin && scNameFilter && scNameFilter.length > 0) {
        q = q.in("assigned_to", scNameFilter);
      }
      return q;
    };

    const [allRes, firstRes, multiRes] = await Promise.all([
      base(),
      base().or('status.is.null,status.eq."",status.eq."New"'),
      base().ilike("status", "%expected%"),
    ]);
    return { all: allRes.count || 0, first: firstRes.count || 0, multi: multiRes.count || 0 };
  } catch (error) {
    console.error("Error fetching call tracker filter type counts:", error);
    return { all: 0, first: 0, multi: 0 };
  }
}

// Today/overdue/upcoming badge counts for the Pending tab's date filter --
// scoped by the same search/SC-name filters currently applied, matching what
// the old client-side count (derived from the fully-loaded pending array)
// used to reflect.
export async function fetchCallTrackerDateFilterCounts({ searchTerm, scNameFilter, isAdmin, usernamesToFilter }) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    const base = () => applyCommonFilters(
      supabase.from("call_tracker_pending_view").select("*", { count: "exact", head: true }),
      { searchTerm, scNameFilter, isAdmin, usernamesToFilter }
    );

    const [todayRes, overdueRes, upcomingRes] = await Promise.all([
      base().eq("next_call_date", todayStr),
      base().lt("next_call_date", todayStr),
      base().gt("next_call_date", todayStr),
    ]);
    return { today: todayRes.count || 0, overdue: overdueRes.count || 0, upcoming: upcomingRes.count || 0 };
  } catch (error) {
    console.error("Error fetching call tracker date filter counts:", error);
    return { today: 0, overdue: 0, upcoming: 0 };
  }
}

export async function fetchCallTrackerHistoryDateCounts({ scNameFilter, isAdmin, usernamesToFilter }) {
  try {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const base = () => {
      let q = supabase.from("call_tracker_history_view").select("*", { count: "exact", head: true });
      if (!isAdmin && usernamesToFilter && usernamesToFilter.length > 0) {
        q = q.in("assigned_to", usernamesToFilter);
      } else if (isAdmin && scNameFilter && scNameFilter.length > 0) {
        q = q.in("assigned_to", scNameFilter);
      }
      return q;
    };

    const [todayRes, olderRes] = await Promise.all([
      base().gte("created_at", todayStr),
      base().lt("created_at", todayStr),
    ]);
    return { today: todayRes.count || 0, older: olderRes.count || 0 };
  } catch (error) {
    console.error("Error fetching call tracker history date counts:", error);
    return { today: 0, older: 0 };
  }
}

// Lightweight distinct-value fetches for filter dropdowns -- separate from
// the paginated row data, so the dropdown options don't depend on what
// happens to be on the current page.
export async function fetchCallTrackerScNameOptions() {
  try {
    const [{ data: pendingRows }, { data: historyRows }] = await Promise.all([
      supabase.from("call_tracker_pending_view").select("assigned_to"),
      supabase.from("call_tracker_history_view").select("assigned_to"),
    ]);
    const pending = Array.from(new Set((pendingRows || []).map((r) => r.assigned_to).filter(Boolean))).sort();
    const history = Array.from(new Set((historyRows || []).map((r) => r.assigned_to).filter(Boolean))).sort();
    return { pending, history };
  } catch (error) {
    console.error("Error fetching SC name options:", error);
    return { pending: [], history: [] };
  }
}

// CallTrackerFilter.jsx derives its Company/Person/Phone dropdown options
// (with counts) from a `pendingFollowUps`-shaped array prop. Now that the
// real pending data is paginated (only the current page ever loads), this
// fetches just the 4 fields that component actually reads, chunked past the
// 1000-row cap, as a separate lightweight source -- so that component needs
// no changes at all.
export async function fetchPendingFilterOptionsSource() {
  const rows = [];
  let from = 0;
  const step = 1000;
  let fetchMore = true;
  try {
    while (fetchMore) {
      const { data, error } = await supabase
        .from("call_tracker_pending_view")
        .select("company_name, person_name, phone_number, enquiry_status")
        .range(from, from + step - 1);
      if (error) throw error;
      (data || []).forEach((r) => {
        rows.push({
          companyName: r.company_name || "",
          personName: r.person_name || "",
          phoneNumber: r.phone_number || "",
          enquiryStatus: r.enquiry_status || "",
        });
      });
      if (!data || data.length < step) fetchMore = false;
      else from += step;
    }
  } catch (error) {
    console.error("Error fetching pending filter options source:", error);
  }
  return rows;
}

