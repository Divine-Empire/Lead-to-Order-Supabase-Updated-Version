import { useQuery } from "@tanstack/react-query";
import supabase from "../../utils/supabase";

// Today's date as a local YYYY-MM-DD string. NOT `date.toISOString().split("T")[0]`
// -- toISOString() converts to UTC first, so in any timezone ahead of UTC
// (IST, +5:30) local midnight becomes the previous day's evening in UTC,
// silently shifting every "today" cutoff (Today/Overdue/Upcoming/First Call
// Pending) back by a day.
export function getLocalTodayStr() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

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

      // Company/Person/Phone are matched by the free-text search box (via
      // search_text, which already includes all three) rather than
      // dedicated dropdowns -- see applyCommonFilters above.
      query = applyCommonFilters(query, { searchTerm, scNameFilter, isAdmin, usernamesToFilter });

      // dateFilter is an array (checkbox multi-select) -- OR the selected
      // buckets together rather than comparing the whole array to a single
      // string, which is what silently no-op'd this filter before.
      //
      // "First Call Pending" is purely pending_group='new' (no_of_follow_ups
      // = 0, i.e. never called even once) -- NOT date-scoped, so a lead sits
      // here until its first call happens no matter how overdue its TAT
      // deadline gets. Today/Overdue/Upcoming are therefore scoped to
      // pending_group='existing' only (already called at least once, so
      // next_call_date is a real logged follow-up date rather than the
      // lead's own planned_at) -- otherwise a never-called lead whose
      // deadline happens to fall today/in the future/in the past would also
      // leak into one of those three, on top of First Call Pending.
      if (Array.isArray(dateFilter) && dateFilter.length > 0) {
        const todayStr = getLocalTodayStr();
        const clauses = [];
        if (dateFilter.includes("today")) clauses.push(`and(pending_group.eq.existing,next_call_date.eq.${todayStr})`);
        if (dateFilter.includes("overdue")) clauses.push(`and(pending_group.eq.existing,next_call_date.lt.${todayStr})`);
        if (dateFilter.includes("first-call-pending")) clauses.push(`pending_group.eq.new`);
        if (dateFilter.includes("upcoming")) clauses.push(`and(pending_group.eq.existing,next_call_date.gt.${todayStr})`);
        // "Assigned Today" isn't a column on the view -- it comes from the
        // separate (nightly-wiped) lto_call_tracker_today_assignments table,
        // so resolve it to a list of lead ids first. An empty list still adds
        // a never-matching clause rather than silently no-op'ing the filter.
        if (dateFilter.includes("assigned-today")) {
          const { data: assignedRows } = await supabase.from("lto_call_tracker_today_assignments").select("lead_id");
          const ids = (assignedRows || []).map((r) => r.lead_id);
          clauses.push(ids.length > 0 ? `record_id.in.(${ids.join(",")})` : `record_id.eq.00000000-0000-0000-0000-000000000000`);
        }
        if (clauses.length > 0) query = query.or(clauses.join(","));
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

      // Company is matched by the free-text search box (via search_text)
      // rather than a dedicated dropdown -- see applyCommonFilters above.
      query = applyCommonFilters(query, { searchTerm, scNameFilter, isAdmin, usernamesToFilter });

      if (filterType === "first") {
        query = query.or('status.is.null,status.eq."",status.eq."New"');
      } else if (filterType === "multi") {
        query = query.ilike("status", "%expected%");
      } else if (filterType === "lost") {
        query = query.eq("status", "not-interested");
      }
      // History matches on Timestamp (created_at), not next_call_date --
      // and, same as Pending above, dateFilter is an array so the selected
      // buckets are OR'd together instead of compared as a whole to a string.
      if (Array.isArray(dateFilter) && dateFilter.length > 0) {
        const todayStr = getLocalTodayStr();
        const clauses = [];
        if (dateFilter.includes("today")) clauses.push(`created_at.gte.${todayStr}`);
        if (dateFilter.includes("older")) clauses.push(`created_at.lt.${todayStr}`);
        if (clauses.length > 0) query = query.or(clauses.join(","));
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
export async function fetchCallTrackerFilterTypeCounts({ activeTab, scNameFilter, isAdmin, usernamesToFilter }) {
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

// Today/overdue/first-call-pending/upcoming badge counts for the Pending
// tab's date filter -- scoped by the same search/SC-name filters currently
// applied, matching what the old client-side count (derived from the
// fully-loaded pending array) used to reflect.
//
// "First Call Pending" is purely pending_group='new' (never contacted,
// no_of_follow_ups=0) -- NOT date-scoped, so a lead stays here however
// overdue its TAT deadline gets. Today/Overdue/Upcoming are therefore all
// scoped to pending_group='existing' only -- see the matching split in
// usePendingCallTracker above.
export async function fetchCallTrackerDateFilterCounts({ searchTerm, scNameFilter, isAdmin, usernamesToFilter }) {
  try {
    const todayStr = getLocalTodayStr();

    const base = () => applyCommonFilters(
      supabase.from("call_tracker_pending_view").select("*", { count: "exact", head: true }),
      { searchTerm, scNameFilter, isAdmin, usernamesToFilter }
    );

    const [todayRes, overdueRes, firstCallPendingRes, upcomingRes] = await Promise.all([
      base().eq("pending_group", "existing").eq("next_call_date", todayStr),
      base().eq("pending_group", "existing").lt("next_call_date", todayStr),
      base().eq("pending_group", "new"),
      base().eq("pending_group", "existing").gt("next_call_date", todayStr),
    ]);
    return {
      today: todayRes.count || 0,
      overdue: overdueRes.count || 0,
      firstCallPending: firstCallPendingRes.count || 0,
      upcoming: upcomingRes.count || 0,
    };
  } catch (error) {
    console.error("Error fetching call tracker date filter counts:", error);
    return { today: 0, overdue: 0, firstCallPending: 0, upcoming: 0 };
  }
}

export async function fetchCallTrackerHistoryDateCounts({ scNameFilter, isAdmin, usernamesToFilter }) {
  try {
    const todayStr = getLocalTodayStr();

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

// CallTrackerFilter.jsx derives the History tab's "First Followup"/"Expected"
// counts from a `pendingFollowUps`-shaped array prop, reading only
// enquiryStatus off it (Company/Person/Phone dropdowns that used to read the
// other 3 fields here were removed -- that filtering now goes through the
// free-text search box instead, via search_text). Chunked past the 1000-row
// cap since the real pending data is paginated and only the current page
// ever loads.
export async function fetchPendingFilterOptionsSource() {
  const rows = [];
  let from = 0;
  const step = 1000;
  let fetchMore = true;
  try {
    while (fetchMore) {
      const { data, error } = await supabase
        .from("call_tracker_pending_view")
        .select("enquiry_status")
        .range(from, from + step - 1);
      if (error) throw error;
      (data || []).forEach((r) => {
        rows.push({ enquiryStatus: r.enquiry_status || "" });
      });
      if (!data || data.length < step) fetchMore = false;
      else from += step;
    }
  } catch (error) {
    console.error("Error fetching pending filter options source:", error);
  }
  return rows;
}

// Admin-only bulk "assign for today" overlay. Each lead is always assigned
// to ITS OWN existing assigned_to/sc_name (passed in per-row, never picked
// in the UI) -- so this never changes RBAC scoping, only adds a same-day
// tag. The whole table is wiped every night by a pg_cron job (see
// Database/08_call_tracker_today_assignments.sql), so there's no history to
// manage here -- a row existing in it always means "assigned for today".
// `lead_id` is UNIQUE, so re-assigning the same lead the same day upserts
// (refreshes assigned_by/assigned_at) instead of erroring or duplicating.
export async function assignLeadsForToday(rows, assignedBy) {
  const payload = rows.map((r) => ({
    lead_id: r.id,
    assigned_to: r.assignedTo,
    assigned_by: assignedBy,
    assigned_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("lto_call_tracker_today_assignments")
    .upsert(payload, { onConflict: "lead_id" });
  if (error) throw error;
}

// The whole table is tiny (wiped nightly), so fetching it in full is cheap
// -- an admin sees every SC's assignments, a non-admin SC sees only her own
// (scoped the same way as every other query here, by assigned_to).
export async function fetchTodayAssignments({ isAdmin, usernamesToFilter }) {
  try {
    let q = supabase.from("lto_call_tracker_today_assignments").select("*");
    if (!isAdmin && usernamesToFilter && usernamesToFilter.length > 0) {
      q = q.in("assigned_to", usernamesToFilter);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching today's assignments:", error);
    return [];
  }
}

// "Called today" for the assigned-today summary -- deliberately a direct
// created_at >= todayStr string comparison against the SAME local date
// string used everywhere else in this file (getLocalTodayStr), matching the
// existing (not timezone-perfect, but consistent) convention already used
// for the History tab's Today/Older split rather than introducing a
// different comparison method just for this feature. Only ever called with
// the small set of today's assigned lead_ids, so this is cheap regardless of
// how big lto_call_tracker_for_leads itself is.
export async function fetchCalledTodayLeadIds(leadIds) {
  if (!leadIds || leadIds.length === 0) return new Set();
  try {
    const todayStr = getLocalTodayStr();
    const { data, error } = await supabase
      .from("lto_call_tracker_for_leads")
      .select("lead_id")
      .in("lead_id", leadIds)
      .gte("created_at", todayStr);
    if (error) throw error;
    return new Set((data || []).map((r) => r.lead_id));
  } catch (error) {
    console.error("Error fetching called-today lead ids:", error);
    return new Set();
  }
}

