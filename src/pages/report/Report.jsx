"use client";

import { useState, useEffect, useContext, useCallback } from "react";
import { AuthContext } from "../../App";
import supabase from "../../utils/supabase";

// import { supabaseVisit } from "../supabaseClientVisit";


// A handful of simultaneous connections to the same host has shown
// occasional transient connect timeouts in practice -- retrying the single
// affected page (not the whole fetch) makes that a non-issue rather than
// failing the entire report load over one flaky connection.
async function fetchPageWithRetry(buildQuery, start, end, attempts = 3) {
    let lastResult = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        lastResult = await buildQuery().range(start, end);
        if (!lastResult.error) return lastResult;
        if (attempt < attempts) await new Promise(r => setTimeout(r, 400 * attempt));
    }
    return lastResult;
}

// Applies any already-built filters to every chunk of a paginated fetch,
// bypassing PostgREST's silent 1000-row cap on unbounded selects -- needed
// here since `enquiries` alone is already well past that count, and
// `lto_enquiry_tracker` (SC Pipeline's biggest fetch) runs ~26k rows.
//
// Pages are fetched in parallel batches rather than one at a time -- with
// ~1-1.5s of latency per request, sequentially paging through 26k rows (27
// requests) took 40+ seconds end to end, during which the SC Pipeline tab
// showed nothing at all. Firing BATCH_SIZE requests per round cuts that to
// roughly (page count / BATCH_SIZE) round trips instead of (page count).
async function fetchAllRows(buildQuery) {
    const step = 1000;
    const BATCH_SIZE = 8;
    let allRows = [];
    let from = 0;
    let done = false;
    let lastError = null;

    while (!done) {
        const batch = Array.from({ length: BATCH_SIZE }, (_, i) => {
            const start = from + i * step;
            return fetchPageWithRetry(buildQuery, start, start + step - 1);
        });
        const results = await Promise.all(batch);

        for (const { data, error } of results) {
            if (error) {
                lastError = error;
                done = true;
                break;
            }
            if (data && data.length > 0) {
                allRows = allRows.concat(data);
                if (data.length < step) done = true; // reached the end mid-batch
            } else {
                done = true; // empty page -- definitely past the end
            }
        }
        from += BATCH_SIZE * step;
    }
    return { data: allRows, error: lastError };
}

// FOS Team Members List
const FOS_RECEIVERS = [
    "PRANAV VINAYAKRAO BHOGAWAR",
    "RANJAN KUMAR PRUSTY",
    "SAMIRAN RAJBONGSHI",
    "ROSHAN DEWANGAN",
    "TUSHAR ATRAM",
    "SUBHRAJIT BEHERA",
    "MANOSH ROY CHOUDHURY",
    "AMAN JHA"
];

const formatMetricValue = (value, format) => {
    // Total Visit is not wired up yet (pending a separate sheet source) --
    // rendered as a placeholder rather than a misleading "0".
    if (format === "blank") return "--";
    if (format === "currency") return (value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    if (format === "percent") return `${(value || 0).toFixed(1)}%`;
    return value || 0;
};

// Green/amber/rose thresholds for at-a-glance conversion health -- applied
// to both % metric cells, consistent across the whole page.
const getPercentColorClass = (pct) => {
    if (pct >= 50) return "text-emerald-700 bg-emerald-50";
    if (pct >= 25) return "text-amber-700 bg-amber-50";
    return "text-rose-600 bg-rose-50";
};

function Spinner({ className = "h-4 w-4" }) {
    return (
        <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    );
}

// Shared Start/End date filter bar for Calling Data + SC Pipeline. Both tabs
// default to a fixed window (per task.txt) with no filter applied -- setting
// either date here switches that tab over to a server-queried custom range
// instead of the default, until "Reset to default" is pressed.
function DateRangeFilterBar({ startDate, endDate, onStartDateChange, onEndDateChange, onReset, defaultRangeLabel }) {
    const hasCustomRange = !!(startDate || endDate);
    return (
        <div className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-100 mb-5 flex flex-col md:flex-row gap-3 items-end md:items-center">
            <div className="w-full md:w-1/5">
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                <input
                    type="date"
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary text-sm p-2 border"
                    value={startDate}
                    onChange={(e) => onStartDateChange(e.target.value)}
                />
            </div>
            <div className="w-full md:w-1/5">
                <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                <input
                    type="date"
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary text-sm p-2 border"
                    value={endDate}
                    onChange={(e) => onEndDateChange(e.target.value)}
                />
            </div>
            <div className="w-full md:w-auto">
                <button
                    onClick={onReset}
                    disabled={!hasCustomRange}
                    className="w-full md:w-auto bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-medium text-sm py-2 px-4 rounded-md transition-colors"
                >
                    Reset to default
                </button>
            </div>
            <div className="text-xs text-gray-400 md:ml-1">
                {hasCustomRange ? "Showing custom range" : defaultRangeLabel}
            </div>
        </div>
    );
}

const PIPELINE_METRIC_ROWS = [
    { key: "enquiries", label: "Total Enquiries / Leads", format: "int" },
    { key: "enquiryValue", label: "Enquiry Value", format: "currency" },
    { key: "pipelineValue", label: "Pipeline Value (60d)", format: "currency" },
    { key: "noOrder", label: "No. of Orders", format: "int" },
    { key: "billValue", label: "Bill Value", format: "currency" },
    { key: "engConv", label: "Conversion %", format: "percent" },
    { key: "valueConv", label: "Value Conversion %", format: "percent" },
    { key: "avgTicket", label: "Avg Ticket Size", format: "currency" },
];

// Renders one SC Pipeline table (Leads or Enquiries): metrics as rows,
// SC/category as columns. `visibleLabels === null` means "no restriction"
// (admin); otherwise only columns whose label is in the array are kept --
// since "TOTAL" is never a real SC name, this naturally hides team-total
// columns from non-admins with no extra special-casing needed.
function PipelineTable({ title, section, visibleLabels, isLoading }) {
    // Was previously a silent `return null` -- both "still loading" (this
    // fetch pages through ~35k tracker rows, so it's genuinely slow) and "the
    // fetch failed" looked identical to the user: a blank page. Now shows an
    // explicit state either way instead of nothing.
    if (!section) {
        return (
            <div className="mb-8">
                <h3 className="text-base font-semibold text-gray-800 mb-3">{title}</h3>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-8 text-center text-sm text-gray-500">
                    {isLoading ? (
                        <span className="inline-flex items-center gap-2 text-primary">
                            <Spinner className="h-4 w-4" /> Loading data for this range...
                        </span>
                    ) : "No data available."}
                </div>
            </div>
        );
    }

    const keep = (label) => visibleLabels === null || visibleLabels.includes(label);

    const allColumns = [];
    section.categoryGroups.forEach(g => {
        const cols = g.columns.filter(c => keep(c.label));
        cols.forEach((c, i) => allColumns.push({ ...c, groupStart: i === 0, groupLabel: g.category, groupSpan: cols.length }));
    });
    const visibleNbdColumns = section.nbdColumns.filter(c => keep(c.label));
    visibleNbdColumns.forEach((c, i) => allColumns.push({ ...c, groupStart: i === 0, groupLabel: i === 0 ? "NBD" : null, groupSpan: visibleNbdColumns.length }));

    return (
        <div className="mb-8">
            <h3 className="text-base font-semibold text-gray-800 mb-3">{title}</h3>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {allColumns.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">No rows to show</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead className="bg-gray-50/80">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50/80">Metric</th>
                                    {allColumns.filter(c => c.groupStart).map(c => (
                                        <th key={`grp-${c.key}`} colSpan={c.groupSpan} className="px-4 py-2 text-center text-xs font-bold text-primary uppercase tracking-wide border-l border-gray-200">
                                            {c.groupLabel}
                                        </th>
                                    ))}
                                </tr>
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs text-gray-400 sticky left-0 bg-gray-50/80"></th>
                                    {allColumns.map(c => (
                                        <th key={c.key} className={`px-4 py-2 text-center text-xs font-semibold text-gray-600 ${c.groupStart ? "border-l border-gray-200" : ""}`}>
                                            {c.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {isLoading ? (
                                    <tr><td colSpan={allColumns.length + 1} className="px-4 py-8 text-center text-sm text-primary"><span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Loading data for this range...</span></td></tr>
                                ) : (
                                    PIPELINE_METRIC_ROWS.map(row => (
                                        <tr key={row.key} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-2.5 text-sm font-medium text-gray-700 whitespace-nowrap sticky left-0 bg-white">{row.label}</td>
                                            {allColumns.map(c => {
                                                const val = c.metrics[row.key];
                                                return (
                                                    <td
                                                        key={c.key}
                                                        className={`px-4 py-2.5 text-center text-sm whitespace-nowrap ${c.groupStart ? "border-l border-gray-200" : ""} ${c.isTotal ? "font-semibold bg-gray-50" : "text-gray-700"} ${row.format === "percent" ? getPercentColorClass(val) : ""}`}
                                                    >
                                                        {formatMetricValue(val, row.format)}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

const FOS_METRIC_COLUMNS = [
    { key: "totalVisit", label: "Total Visit", format: "blank" },
    { key: "enquiries", label: "No. of Enquiries", format: "int" },
    { key: "enquiryValue", label: "Total Enquiry Value", format: "currency" },
    { key: "ordersConverted", label: "Orders Converted", format: "int" },
    { key: "orderConvertedValue", label: "Order Converted Value", format: "currency" },
    { key: "avgTicket", label: "Avg Ticket Size", format: "currency" },
    { key: "pipelineCount", label: "Pipeline (Qty)", format: "int" },
    { key: "pipelineValue", label: "Pipeline (Value)", format: "currency" },
];

// Renders one FOS Report table (Leads or Enquiries): one row per FOS team
// member, metrics as columns -- same two-section split as the SC Pipeline
// tab, just transposed (rows = person, not columns) per the confirmed
// layout. `visibleNames === null` means no restriction (admin sees
// everyone); otherwise only rows whose name is in the array are kept, which
// naturally scopes a non-admin to their own row.
function FosMetricsTable({ title, rows, visibleNames, isLoading }) {
    // `rows === null` means "hasn't loaded yet" (or the fetch failed) --
    // distinct from an empty array, which means "loaded, nothing to show".
    if (!rows) {
        return (
            <div className="mb-8">
                <h3 className="text-base font-semibold text-gray-800 mb-3">{title}</h3>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-8 text-center text-sm text-gray-500">
                    {isLoading ? (
                        <span className="inline-flex items-center gap-2 text-primary">
                            <Spinner className="h-4 w-4" /> Loading data for this range...
                        </span>
                    ) : "No data available."}
                </div>
            </div>
        );
    }

    const visibleRows = rows.filter(r => visibleNames === null || visibleNames.includes(r.name));

    return (
        <div className="mb-8">
            <h3 className="text-base font-semibold text-gray-800 mb-3">{title}</h3>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {visibleRows.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">No rows to show</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead className="bg-gray-50/80">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50/80">Name</th>
                                    {FOS_METRIC_COLUMNS.map(c => (
                                        <th key={c.key} className="px-4 py-2 text-center text-xs font-semibold text-gray-600 whitespace-nowrap">{c.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {isLoading ? (
                                    <tr><td colSpan={FOS_METRIC_COLUMNS.length + 1} className="px-4 py-8 text-center text-sm text-primary"><span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Loading data for this range...</span></td></tr>
                                ) : (
                                    visibleRows.map(row => (
                                        <tr key={row.name} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-2.5 text-sm font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white">{row.name}</td>
                                            {FOS_METRIC_COLUMNS.map(c => (
                                                <td key={c.key} className="px-4 py-2.5 text-center text-sm whitespace-nowrap text-gray-700">
                                                    {formatMetricValue(row[c.key], c.format)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function Report() {
    const { isAdmin, getUsernamesToFilter } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState("calling"); // "calling" or "fos"

    // Non-admins (USER role) are always scoped to their own SC name (plus any
    // delegated alternate access); admins may additionally narrow further via
    // the SC filter dropdown. Returns an array of allowed names, or null when
    // there is no restriction to apply (admin, "All" selected).
    const getScFilterList = (adminSelectedScName) => {
        if (!isAdmin()) return getUsernamesToFilter();
        if (adminSelectedScName && adminSelectedScName !== "all") return [adminSelectedScName];
        return null;
    };

    // Calling Data tab state -- one row per SC (from `login`, admin/user role
    // excluded), always scoped to the current week (Monday 00:00 -> now), no
    // date/SC filters since the whole point is "everyone's current-week
    // snapshot at a glance". Non-admins only ever see their own row (or none,
    // if their name isn't a known SC).
    const [leadsReportRows, setLeadsReportRows] = useState([]);
    const [enquiriesReportRows, setEnquiriesReportRows] = useState([]);
    const [scNames, setScNames] = useState([]);
    // Empty = default window (current week, per task.txt). Setting either
    // date switches this tab's queries over to that custom range instead --
    // fetched server-side (not client-filtered from a full-table pull), so
    // picking a range doesn't cost more than the default view does.
    const [callingFilters, setCallingFilters] = useState({ startDate: "", endDate: "" });

    // FOS report state -- two sections (Leads, Enquiries), one row per
    // FOS_RECEIVERS member per section, mirroring the SC Pipeline tab's
    // layout. null = not loaded yet (or fetch failed); [] = loaded, empty.
    const [fosTableData, setFosTableData] = useState({ leads: null, enquiries: null });
    // Surfaced in the UI if the fetch throws, same convention as SC Pipeline.
    const [fosError, setFosError] = useState(null);

    // SC Pipeline state -- no filters, same "always this week" convention as
    // Calling Data: Geeta/Priya/Nikita are broken out by category (CRR /
    // NBD_CRR, plus a team TOTAL per category); Ganga/Chahat get one column
    // each, scoped to their NBD-category work only (per confirmed template).
    const [scPipelineData, setScPipelineData] = useState({ leads: null, enquiries: null });
    // Surfaced in the UI if the fetch throws -- previously only logged to
    // console, so a real failure looked identical to "still loading": a
    // blank page with zero feedback either way.
    const [scPipelineError, setScPipelineError] = useState(null);
    // Empty = default (this-week window for Enquiry-Value/Orders/Bill-Value,
    // rolling 60 days for Pipeline Value, per task.txt#26-33). Setting either
    // date collapses BOTH of those windows onto the same custom range instead.
    const [scPipelineFilters, setScPipelineFilters] = useState({ startDate: "", endDate: "" });

    const [fosFilters, setFosFilters] = useState({
        receiverName: "all",
        startDate: "",
        endDate: "",
    });

    const [isLoading, setIsLoading] = useState(true);

    // Helper to format date for query if needed, or use directly
    const getEndDateWithTime = (date) => {
        if (!date) return null
        return `${date}T23:59:59`
    }

    // Fetch unique SC names for the filter dropdown
    const fetchSCNames = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from("login")
                .select("username")
                .order("username", { ascending: true });

            if (error) {
                console.error("Error fetching SC names from login:", error);
                return;
            }

            const uniqueNames = (data || [])
                .map(item => item.username)
                .filter(Boolean)
                .filter(name => name.toLowerCase() !== 'admin');
            setScNames(uniqueNames);
        } catch (error) {
            console.error("Error fetching SC names:", error);
        }
    }, []);

    // Monday 00:00 of the current week -> now. "Always started from Monday"
    // per the spec -- this tab has no date picker, it's always this week.
    const getMondayStart = () => {
        const now = new Date();
        const day = now.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
        const diffToMonday = day === 0 ? 6 : day - 1;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
    };

    // Root quotation = no revision suffix. Quotation.jsx's own numbering
    // scheme (see nextRevision in Quotation.jsx) is unambiguous about this:
    // "PREFIX-YY-YY-NNN" (4 hyphen-separated parts) is a root quotation;
    // appending "-01", "-02", ... for each revision makes it 5 parts.
    const isRootQuotationNo = (quotationNo) => String(quotationNo || "").split("-").length === 4;

    const parseMoney = (v) => {
        const value = parseFloat(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        return isNaN(value) ? 0 : value;
    };

    const fetchCallingDataReport = useCallback(async () => {
        if (activeTab !== "calling") return;
        setIsLoading(true);
        try {
            // Default window is the current week (Monday 00:00 -> now), per
            // task.txt. Setting either filter date swaps in that custom range
            // instead -- every "this week" query below is scoped to
            // [rangeStart, rangeEnd], so a filtered view queries the DB for
            // exactly that range rather than fetching everything and
            // re-filtering client-side.
            const monday = getMondayStart();
            const now = new Date();
            const rangeStart = callingFilters.startDate ? new Date(`${callingFilters.startDate}T00:00:00`) : monday;
            const rangeEnd = callingFilters.endDate ? new Date(getEndDateWithTime(callingFilters.endDate)) : now;
            const rangeStartISO = rangeStart.toISOString();
            const rangeEndISO = rangeEnd.toISOString();
            const inThisWeek = (dateStr) => {
                if (!dateStr) return false;
                const d = new Date(dateStr);
                return !isNaN(d.getTime()) && d >= rangeStart && d <= rangeEnd;
            };

            // Visible rows: admin sees every known SC; a non-admin sees only
            // their own row (by exact name match against `login`), or none
            // at all if their name isn't a recognized SC.
            const allowedNames = isAdmin() ? scNames : (getUsernamesToFilter() || []);
            const visibleScNames = scNames.filter(name => allowedNames.includes(name));

            if (visibleScNames.length === 0) {
                setLeadsReportRows([]);
                setEnquiriesReportRows([]);
                return;
            }

            // ---- Base tables (unbounded -- a quotation created this week can
            // reference a lead/enquiry created any time in the past, so the
            // lead_no/enquiry_no -> sc_name lookup needs the full table) ----
            const [{ data: allLeads }, { data: allEnquiries }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_leads").select("id, lead_no, sc_name, created_at")),
                fetchAllRows(() => supabase.from("lto_enquiries").select("id, enquiry_no, sales_coordinator_name, enquiry_approach, created_at")),
            ]);

            // ---- This week's (or the filtered range's) call-tracker rows
            // (leads only -- there is no equivalent call-tracker table for
            // direct enquiries) ----
            const { data: weekCalls } = await fetchAllRows(() =>
                supabase.from("lto_call_tracker_for_leads")
                    .select("lead_id, sc_name, created_at, enquiry_approach")
                    .gte("created_at", rangeStartISO)
                    .lte("created_at", rangeEndISO)
            );

            // ---- Full tracker history per lead, needed to determine
            // "currently pending" regardless of when that history was
            // logged (a lead created this week could have tracker rows
            // from any point up to now) ----
            const { data: allLeadTrackers } = await fetchAllRows(() =>
                supabase.from("lto_enquiry_tracker_for_leads").select("lead_id, is_order_received_status")
            );
            const leadTrackersByLeadId = new Map();
            (allLeadTrackers || []).forEach(t => {
                if (!t.lead_id) return;
                if (!leadTrackersByLeadId.has(t.lead_id)) leadTrackersByLeadId.set(t.lead_id, []);
                leadTrackersByLeadId.get(t.lead_id).push(t);
            });
            const isPending = (rows) => rows.length > 0 && rows.every(r => {
                const s = String(r.is_order_received_status || "").trim().toLowerCase();
                return s !== "yes" && s !== "no";
            });

            // ---- Order conversions in-range (any lead/enquiry, regardless
            // of its own creation date -- "their updation has been done
            // within this week/range") ----
            const [{ data: weekLeadOrders }, { data: weekEnquiryOrders }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_enquiry_tracker_for_leads")
                    .select("lead_id, created_at")
                    .gte("created_at", rangeStartISO)
                    .lte("created_at", rangeEndISO)
                    .eq("is_order_received_status", "yes")),
                fetchAllRows(() => supabase.from("lto_enquiry_tracker")
                    .select("enquiry_id, created_at")
                    .gte("created_at", rangeStartISO)
                    .lte("created_at", rangeEndISO)
                    .eq("is_order_received_status", "yes")),
            ]);

            // ---- Root quotations created in-range, plus their pre-tax
            // item totals (lto_make_quotations has no "value without tax"
            // column of its own -- grand_total is post-tax) ----
            const { data: weekQuotations } = await fetchAllRows(() =>
                supabase.from("lto_make_quotations")
                    .select("id, quotation_no, enquiry_reference_no, created_at")
                    .gte("created_at", rangeStartISO)
                    .lte("created_at", rangeEndISO)
            );
            const rootWeekQuotations = (weekQuotations || []).filter(q => isRootQuotationNo(q.quotation_no));

            const quotationAmountByQId = new Map();
            const quotationIds = rootWeekQuotations.map(q => q.id);
            if (quotationIds.length > 0) {
                const { data: items } = await fetchAllRows(() =>
                    supabase.from("lto_make_quotation_items").select("quotation_id, amount").in("quotation_id", quotationIds)
                );
                (items || []).forEach(it => {
                    quotationAmountByQId.set(it.quotation_id, (quotationAmountByQId.get(it.quotation_id) || 0) + parseMoney(it.amount));
                });
            }

            // ---- Lookups: lead_no / enquiry_no -> owning SC, for tying a
            // quotation back to whichever SC's lead/enquiry it belongs to ----
            const leadById = new Map();
            const leadScByLeadNo = new Map();
            (allLeads || []).forEach(l => {
                leadById.set(l.id, l);
                if (l.lead_no) leadScByLeadNo.set(l.lead_no.trim().toUpperCase(), l.sc_name);
            });
            const enquiryById = new Map();
            const enquiryScByEnquiryNo = new Map();
            (allEnquiries || []).forEach(e => {
                enquiryById.set(e.id, e);
                if (e.enquiry_no) enquiryScByEnquiryNo.set(e.enquiry_no.trim().toUpperCase(), e.sales_coordinator_name);
            });

            // ==================== LEADS SECTION ====================
            const leadStats = {};
            visibleScNames.forEach(name => {
                leadStats[name] = {
                    name, totalLeads: 0, calls: 0, convertedToEnquiry: 0,
                    quotations: 0, quotationAmount: 0, orderConverted: 0, incoming: 0, outgoing: 0,
                };
            });

            const callsByLeadId = new Map();
            (weekCalls || []).forEach(c => {
                if (!c.lead_id) return;
                if (!callsByLeadId.has(c.lead_id)) callsByLeadId.set(c.lead_id, { sc_name: c.sc_name, approaches: new Set() });
                if (c.enquiry_approach) callsByLeadId.get(c.lead_id).approaches.add(String(c.enquiry_approach).trim().toUpperCase());
            });

            (allLeads || []).forEach(lead => {
                if (!inThisWeek(lead.created_at)) return;
                const sc = lead.sc_name;
                if (!sc || !leadStats[sc]) return;
                leadStats[sc].totalLeads++;

                if (isPending(leadTrackersByLeadId.get(lead.id) || [])) leadStats[sc].convertedToEnquiry++;

                const callEntry = callsByLeadId.get(lead.id);
                if (callEntry) {
                    if (callEntry.approaches.has("INCOMING")) leadStats[sc].incoming++;
                    if (callEntry.approaches.has("OUTGOING")) leadStats[sc].outgoing++;
                }
            });

            // No. of Calls: distinct leads (any creation date) called this
            // week, credited to the call's own sc_name, max one per lead.
            callsByLeadId.forEach(entry => {
                if (entry.sc_name && leadStats[entry.sc_name]) leadStats[entry.sc_name].calls++;
            });

            // Order Converted: any lead (any creation date) whose order was
            // marked received this week, credited to the lead's own SC.
            (weekLeadOrders || []).forEach(row => {
                const lead = leadById.get(row.lead_id);
                if (lead?.sc_name && leadStats[lead.sc_name]) leadStats[lead.sc_name].orderConverted++;
            });

            // Quotations: root quotations created this week whose reference
            // no. points at a lead (LD-...), credited to that lead's SC.
            rootWeekQuotations.forEach(q => {
                const ref = String(q.enquiry_reference_no || "").trim().toUpperCase();
                if (!ref.startsWith("LD-")) return;
                const sc = leadScByLeadNo.get(ref);
                if (sc && leadStats[sc]) {
                    leadStats[sc].quotations++;
                    leadStats[sc].quotationAmount += quotationAmountByQId.get(q.id) || 0;
                }
            });

            setLeadsReportRows(visibleScNames.map(name => leadStats[name]));

            // ==================== ENQUIRIES SECTION ====================
            const enquiryStats = {};
            visibleScNames.forEach(name => {
                enquiryStats[name] = {
                    name, totalEnquiries: 0, quotations: 0, quotationAmount: 0,
                    orderConverted: 0, incoming: 0, outgoing: 0,
                };
            });

            (allEnquiries || []).forEach(e => {
                if (!inThisWeek(e.created_at)) return;
                const sc = e.sales_coordinator_name;
                if (!sc || !enquiryStats[sc]) return;
                enquiryStats[sc].totalEnquiries++;
                const approach = String(e.enquiry_approach || "").trim().toUpperCase();
                if (approach === "INCOMING") enquiryStats[sc].incoming++;
                if (approach === "OUTGOING") enquiryStats[sc].outgoing++;
            });

            (weekEnquiryOrders || []).forEach(row => {
                const e = enquiryById.get(row.enquiry_id);
                if (e?.sales_coordinator_name && enquiryStats[e.sales_coordinator_name]) enquiryStats[e.sales_coordinator_name].orderConverted++;
            });

            rootWeekQuotations.forEach(q => {
                const ref = String(q.enquiry_reference_no || "").trim().toUpperCase();
                if (!ref.startsWith("EN-")) return;
                const sc = enquiryScByEnquiryNo.get(ref);
                if (sc && enquiryStats[sc]) {
                    enquiryStats[sc].quotations++;
                    enquiryStats[sc].quotationAmount += quotationAmountByQId.get(q.id) || 0;
                }
            });

            setEnquiriesReportRows(visibleScNames.map(name => enquiryStats[name]));

        } catch (error) {
            console.error("Error fetching calling data report:", error);
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, isAdmin, getUsernamesToFilter, scNames, callingFilters]);

    // Fetch FOS Data -- two sections (Leads, Enquiries), one row per
    // FOS_RECEIVERS member per section. Default window: last Monday 00:00
    // -> now for enquiries/orders columns, rolling 60 days for Pipeline
    // (same convention as SC Pipeline); setting either filter date collapses
    // BOTH windows onto that one custom range instead.
    const fetchFosMetrics = useCallback(async () => {
        if (activeTab !== "fos") return;
        setIsLoading(true);
        setFosError(null);
        try {
            const monday = getMondayStart();
            const now = new Date();
            const defaultSixtyDaysAgo = new Date(now);
            defaultSixtyDaysAgo.setDate(defaultSixtyDaysAgo.getDate() - 60);
            const hasCustomRange = !!(fosFilters.startDate || fosFilters.endDate);

            const rangeStart = hasCustomRange
                ? (fosFilters.startDate ? new Date(`${fosFilters.startDate}T00:00:00`) : defaultSixtyDaysAgo)
                : monday;
            const rangeEnd = hasCustomRange
                ? (fosFilters.endDate ? new Date(getEndDateWithTime(fosFilters.endDate)) : now)
                : now;

            // Widest bound actually needed server-side, same reasoning as SC
            // Pipeline: default mode still needs the full 60-day lookback for
            // Pipeline even though the other columns only need this week;
            // custom mode needs exactly the chosen range since both windows
            // collapse onto it.
            const fetchStart = hasCustomRange ? rangeStart : defaultSixtyDaysAgo;
            const fetchEnd = hasCustomRange ? rangeEnd : now;
            const fetchStartISO = fetchStart.toISOString();
            const fetchEndISO = fetchEnd.toISOString();

            const inRange = (d) => {
                const dt = new Date(d);
                return !isNaN(dt.getTime()) && dt >= rangeStart && dt <= rangeEnd;
            };
            // Under a custom range there is only one window, not two.
            const inPipelineWindow = hasCustomRange ? inRange : (d) => {
                const dt = new Date(d);
                return !isNaN(dt.getTime()) && dt >= defaultSixtyDaysAgo && dt <= now;
            };
            const isYes = (status) => String(status || "").trim().toLowerCase() === "yes";

            // Computes all 8 columns for one FOS person, given the full
            // (already date-bounded) record set for a section and its
            // tracker rows keyed by record id.
            const computePersonMetrics = (name, records, trackerByRecordId) => {
                const mine = records.filter(r => r._receiverName === name);
                let enquiries = 0, enquiryValue = 0, ordersConverted = 0, orderConvertedValue = 0;
                let pipelineCount = 0, pipelineValue = 0;

                mine.forEach(rec => {
                    const trackerRows = trackerByRecordId.get(rec.id) || [];
                    const isConverted = trackerRows.some(t => isYes(t.is_order_received_status));

                    let latestRow = null;
                    trackerRows.forEach(t => {
                        if (!latestRow || new Date(t.created_at) > new Date(latestRow.created_at)) latestRow = t;
                    });
                    const latestValue = latestRow?.quotation_value_without_tax ? parseMoney(latestRow.quotation_value_without_tax) : 0;

                    if (inRange(rec.created_at)) {
                        enquiries++;
                        enquiryValue += latestValue;
                        if (isConverted) {
                            ordersConverted++;
                            orderConvertedValue += latestValue;
                        }
                    }
                    // Pipeline: open (non-converted) work only, per the
                    // confirmed convention shared with SC Pipeline.
                    if (inPipelineWindow(rec.created_at) && !isConverted) {
                        pipelineCount++;
                        pipelineValue += latestValue;
                    }
                });

                return {
                    name,
                    totalVisit: null, // pending -- to be wired to another sheet later
                    enquiries, enquiryValue, ordersConverted, orderConvertedValue,
                    avgTicket: ordersConverted > 0 ? orderConvertedValue / ordersConverted : 0,
                    pipelineCount, pipelineValue,
                };
            };

            // ---- Leads section ----
            const [{ data: allLeads, error: leadsErr }, { data: allLeadTrackers, error: leadTrackersErr }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_leads").select("id, lead_receiver_name, created_at")
                    .gte("created_at", fetchStartISO).lte("created_at", fetchEndISO)),
                fetchAllRows(() => supabase.from("lto_enquiry_tracker_for_leads").select("lead_id, created_at, is_order_received_status, quotation_value_without_tax")
                    .gte("created_at", fetchStartISO)),
            ]);
            if (leadsErr) throw leadsErr;
            if (leadTrackersErr) throw leadTrackersErr;

            const leadTrackerByLeadId = new Map();
            (allLeadTrackers || []).forEach(t => {
                if (!t.lead_id) return;
                if (!leadTrackerByLeadId.has(t.lead_id)) leadTrackerByLeadId.set(t.lead_id, []);
                leadTrackerByLeadId.get(t.lead_id).push(t);
            });
            const leadRecords = (allLeads || []).map(l => ({ ...l, _receiverName: l.lead_receiver_name }));
            const leadsRows = FOS_RECEIVERS.map(name => computePersonMetrics(name, leadRecords, leadTrackerByLeadId));

            // ---- Enquiries section ----
            const [{ data: allEnquiries, error: enqErr }, { data: allEnquiryTrackers, error: enqTrackersErr }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_enquiries").select("id, enquiry_receiver_name, created_at")
                    .gte("created_at", fetchStartISO).lte("created_at", fetchEndISO)),
                fetchAllRows(() => supabase.from("lto_enquiry_tracker").select("enquiry_id, created_at, is_order_received_status, quotation_value_without_tax")
                    .gte("created_at", fetchStartISO)),
            ]);
            if (enqErr) throw enqErr;
            if (enqTrackersErr) throw enqTrackersErr;

            const enquiryTrackerByEnquiryId = new Map();
            (allEnquiryTrackers || []).forEach(t => {
                if (!t.enquiry_id) return;
                if (!enquiryTrackerByEnquiryId.has(t.enquiry_id)) enquiryTrackerByEnquiryId.set(t.enquiry_id, []);
                enquiryTrackerByEnquiryId.get(t.enquiry_id).push(t);
            });
            const enquiryRecords = (allEnquiries || []).map(e => ({ ...e, _receiverName: e.enquiry_receiver_name }));
            const enquiriesRows = FOS_RECEIVERS.map(name => computePersonMetrics(name, enquiryRecords, enquiryTrackerByEnquiryId));

            setFosTableData({ leads: leadsRows, enquiries: enquiriesRows });

        } catch (err) {
            console.error("FOS fetch error:", err);
            setFosError(err?.message || "Failed to load FOS report data.");
            setFosTableData({ leads: [], enquiries: [] });
        } finally {
            setIsLoading(false);
        }
    }, [fosFilters, activeTab]);

    // Fetch SC Pipeline Metrics
    // "Category" = sales_type, normalized -- the raw data has inconsistent
    // spacing/underscores ("NBD CRR" vs "NBD_CRR" vs "NBD " with a trailing
    // space all meaning the same thing) that need collapsing before grouping.
    // Values outside these three (Direct Enquiry, NBD DM, blank) don't fit
    // any of the report's target categories and are simply excluded.
    const normalizeCategory = (rawSalesType) => {
        const s = String(rawSalesType || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
        if (s === "NBD_CRR") return "NBD_CRR";
        if (s === "CRR") return "CRR";
        if (s === "NBD") return "NBD";
        return null;
    };

    // Geeta/Priya/Nikita are broken out by category (CRR / NBD_CRR) with a
    // team TOTAL per category; Ganga/Chahat get a single column each,
    // scoped to their NBD-category work only -- per the confirmed template,
    // this deliberately excludes any CRR/NBD_CRR activity Ganga/Chahat have
    // (Ganga in particular has substantial real CRR volume) from this
    // specific report, it is not a data bug.
    const SC_PIPELINE_MULTI_SCS = ["GEETA", "PRIYA", "NIKITA"];
    const SC_PIPELINE_NBD_ONLY_SCS = ["GANGA", "CHAHAT"];

    const fetchScPipelineMetrics = useCallback(async () => {
        if (activeTab !== "sc_pipeline") return;
        setIsLoading(true);
        setScPipelineError(null);
        try {
            // Default (no filter): task.txt's two windows apply as-is --
            // this-week for Enquiry-Value/Orders/Bill-Value, rolling 60 days
            // for Pipeline Value. Setting either filter date collapses BOTH
            // onto that same custom range instead (confirmed behaviour), and
            // -- critically for performance -- the fetch below is bounded to
            // exactly the widest window actually needed rather than pulling
            // the entire table: previously this fetched all ~26k tracker
            // rows/~8k enquiries unconditionally (42s, later 15-16s even
            // parallelized); the last-60-days default alone cuts that to
            // ~1.3k enquiries / ~4k tracker rows -- the same reduction a
            // custom range gets automatically since it's now a real
            // server-side filter, not a client-side one.
            const monday = getMondayStart();
            const now = new Date();
            const defaultSixtyDaysAgo = new Date(now);
            defaultSixtyDaysAgo.setDate(defaultSixtyDaysAgo.getDate() - 60);
            const hasCustomRange = !!(scPipelineFilters.startDate || scPipelineFilters.endDate);

            const rangeStart = hasCustomRange
                ? (scPipelineFilters.startDate ? new Date(`${scPipelineFilters.startDate}T00:00:00`) : defaultSixtyDaysAgo)
                : monday;
            const rangeEnd = hasCustomRange
                ? (scPipelineFilters.endDate ? new Date(getEndDateWithTime(scPipelineFilters.endDate)) : now)
                : now;

            // Widest bound actually needed server-side: default mode still
            // needs the full 60-day lookback for Pipeline Value even though
            // most metrics only need this week; custom mode needs exactly
            // the chosen range since both windows collapse onto it.
            const fetchStart = hasCustomRange ? rangeStart : defaultSixtyDaysAgo;
            const fetchEnd = hasCustomRange ? rangeEnd : now;
            const fetchStartISO = fetchStart.toISOString();
            const fetchEndISO = fetchEnd.toISOString();

            const inThisWeek = (d) => {
                const dt = new Date(d);
                return !isNaN(dt.getTime()) && dt >= rangeStart && dt <= rangeEnd;
            };
            // Under a custom range there is only one window, not two.
            const inLast60Days = hasCustomRange ? inThisWeek : (d) => {
                const dt = new Date(d);
                return !isNaN(dt.getTime()) && dt >= defaultSixtyDaysAgo && dt <= now;
            };
            const isYes = (status) => String(status || "").trim().toLowerCase() === "yes";

            // For one filtered slice of records (already scoped to a single
            // SC+category, or a team-total group), compute all 8 metrics.
            const computeGroupMetrics = (records, trackerByRecordId) => {
                let enquiries = 0, enquiryValue = 0, pipelineValue = 0, noOrder = 0, billValue = 0;

                records.forEach(rec => {
                    const trackerRows = trackerByRecordId.get(rec.id) || [];
                    const isConverted = trackerRows.some(t => isYes(t.is_order_received_status));

                    let latestRow = null;
                    trackerRows.forEach(t => {
                        if (!latestRow || new Date(t.created_at) > new Date(latestRow.created_at)) latestRow = t;
                    });
                    const latestQuotationValue = latestRow?.quotation_value_without_tax ? parseMoney(latestRow.quotation_value_without_tax) : 0;

                    if (inThisWeek(rec.created_at)) {
                        enquiries++;
                        enquiryValue += latestQuotationValue;
                    }
                    if (inLast60Days(rec.created_at) && !isConverted) {
                        pipelineValue += latestQuotationValue;
                    }

                    // Orders converted THIS WEEK specifically (the tracker row
                    // recording "yes" was itself created this week) -- counted
                    // once per record even if (unexpectedly) more than one
                    // such row exists, using the latest one's bill value.
                    const yesThisWeekRows = trackerRows.filter(t => isYes(t.is_order_received_status) && inThisWeek(t.created_at));
                    if (yesThisWeekRows.length > 0) {
                        noOrder++;
                        const latestYes = yesThisWeekRows.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b));
                        billValue += parseMoney(latestYes.amount_with_tax);
                    }
                });

                return {
                    enquiries, enquiryValue, pipelineValue, noOrder, billValue,
                    engConv: enquiries > 0 ? (noOrder / enquiries) * 100 : 0,
                    valueConv: enquiryValue > 0 ? (billValue / enquiryValue) * 100 : 0,
                    avgTicket: noOrder > 0 ? billValue / noOrder : 0,
                };
            };

            // Builds the full column set (2 category groups x [3 SCs + TOTAL],
            // plus 2 NBD-only single columns) for either leads or enquiries.
            const buildSection = (records, trackerByRecordId, scField) => {
                const categoryGroups = ["CRR", "NBD_CRR"].map(category => {
                    const perSc = SC_PIPELINE_MULTI_SCS.map(sc => ({
                        key: `${sc}_${category}`, label: sc,
                        metrics: computeGroupMetrics(records.filter(r => r[scField] === sc && normalizeCategory(r.sales_type) === category), trackerByRecordId),
                    }));
                    const totalRecords = records.filter(r => SC_PIPELINE_MULTI_SCS.includes(r[scField]) && normalizeCategory(r.sales_type) === category);
                    return {
                        category,
                        columns: [...perSc, { key: `TOTAL_${category}`, label: "TOTAL", isTotal: true, metrics: computeGroupMetrics(totalRecords, trackerByRecordId) }],
                    };
                });
                const nbdColumns = SC_PIPELINE_NBD_ONLY_SCS.map(sc => ({
                    key: sc, label: sc,
                    metrics: computeGroupMetrics(records.filter(r => r[scField] === sc && normalizeCategory(r.sales_type) === "NBD"), trackerByRecordId),
                }));
                return { categoryGroups, nbdColumns };
            };

            // ---- Leads ----
            // Base records bounded to [fetchStart, fetchEnd] on both ends --
            // that's the actual set of records this tab can ever show.
            // Tracker rows bounded with a floor only (no upper bound): a
            // tracker row can never predate the record it belongs to, so
            // `created_at >= fetchStart` already captures every tracker row
            // for any in-range record with zero risk of missing one, while
            // deliberately NOT capping the upper end keeps "is it currently
            // converted" correct even when fetchEnd is a past custom date
            // (an order logged after that date still counts).
            const [{ data: allLeads }, { data: allLeadTrackers }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_leads").select("id, sc_name, sales_type, created_at")
                    .gte("created_at", fetchStartISO).lte("created_at", fetchEndISO)),
                fetchAllRows(() => supabase.from("lto_enquiry_tracker_for_leads").select("lead_id, created_at, is_order_received_status, quotation_value_without_tax, amount_with_tax")
                    .gte("created_at", fetchStartISO)),
            ]);
            const leadTrackerByLeadId = new Map();
            (allLeadTrackers || []).forEach(t => {
                if (!t.lead_id) return;
                if (!leadTrackerByLeadId.has(t.lead_id)) leadTrackerByLeadId.set(t.lead_id, []);
                leadTrackerByLeadId.get(t.lead_id).push(t);
            });
            const leadsSection = buildSection(allLeads || [], leadTrackerByLeadId, "sc_name");

            // ---- Enquiries ---- (lto_enquiries has NO sc_name column --
            // the real field is sales_coordinator_name)
            const [{ data: allEnquiries }, { data: allEnquiryTrackers }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_enquiries").select("id, sales_coordinator_name, sales_type, created_at")
                    .gte("created_at", fetchStartISO).lte("created_at", fetchEndISO)),
                fetchAllRows(() => supabase.from("lto_enquiry_tracker").select("enquiry_id, created_at, is_order_received_status, quotation_value_without_tax, amount_with_tax")
                    .gte("created_at", fetchStartISO)),
            ]);
            const enquiryTrackerByEnquiryId = new Map();
            (allEnquiryTrackers || []).forEach(t => {
                if (!t.enquiry_id) return;
                if (!enquiryTrackerByEnquiryId.has(t.enquiry_id)) enquiryTrackerByEnquiryId.set(t.enquiry_id, []);
                enquiryTrackerByEnquiryId.get(t.enquiry_id).push(t);
            });
            const enquiriesSection = buildSection(allEnquiries || [], enquiryTrackerByEnquiryId, "sales_coordinator_name");

            setScPipelineData({ leads: leadsSection, enquiries: enquiriesSection });

        } catch (error) {
            console.error("Error fetching SC Pipeline metrics:", error);
            setScPipelineError(error?.message || "Failed to load SC Pipeline data.");
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, scPipelineFilters]);


    useEffect(() => {
        fetchSCNames();
    }, [fetchSCNames]);


    useEffect(() => {
        if (activeTab === "calling") {
            fetchCallingDataReport();
        } else if (activeTab === "fos") {
            fetchFosMetrics();
        } else if (activeTab === "sc_pipeline") {
            fetchScPipelineMetrics();
        }
    }, [fetchCallingDataReport, fetchFosMetrics, fetchScPipelineMetrics, activeTab]);








    return (
        <div className="min-h-screen bg-slate-50">
            <div className="container mx-auto py-6 px-4 sm:px-6 lg:px-8 max-w-[1600px]">
                {/* Header */}
                <div className="mb-5">
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reports</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Overview of calls, enquiries, quotations, and orders.
                    </p>
                </div>

                {/* Tabs */}
                <div className="mb-5 border-b border-gray-200">
                    <nav className="-mb-px flex space-x-6">
                        <button
                            onClick={() => setActiveTab("calling")}
                            className={`${activeTab === "calling"
                                ? "border-primary text-primary"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            Calling Data
                        </button>
                        <button
                            onClick={() => setActiveTab("fos")}
                            className={`${activeTab === "fos"
                                ? "border-primary text-primary"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            FOS Report
                        </button>
                        <button
                            onClick={() => setActiveTab("sc_pipeline")}
                            className={`${activeTab === "sc_pipeline"
                                ? "border-primary text-primary"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            SC Pipeline
                        </button>
                    </nav>
                </div>

                {/* CALLING DATA TAB CONTENT */}
                {activeTab === "calling" && (
                    <>
                        <p className="text-sm text-gray-500 mb-3 flex items-center gap-2">
                            {callingFilters.startDate || callingFilters.endDate
                                ? "Custom date range -- one row per Sales Coordinator."
                                : "Current week (Monday through today) -- one row per Sales Coordinator."}
                            {!isAdmin() && " You're seeing only your own row."}
                            {isLoading && <Spinner className="h-3.5 w-3.5 text-primary" />}
                        </p>

                        <DateRangeFilterBar
                            startDate={callingFilters.startDate}
                            endDate={callingFilters.endDate}
                            onStartDateChange={(v) => setCallingFilters(prev => ({ ...prev, startDate: v }))}
                            onEndDateChange={(v) => setCallingFilters(prev => ({ ...prev, endDate: v }))}
                            onReset={() => setCallingFilters({ startDate: "", endDate: "" })}
                            defaultRangeLabel="Showing current week (Mon-today)"
                        />

                        {/* Leads Section */}
                        <div className="mb-8">
                            <h3 className="text-base font-semibold text-gray-800 mb-3">Leads</h3>
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-100">
                                        <thead className="bg-gray-50/80">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">SC Name</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Leads</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">No. of Calls</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Converted to Enquiries</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Quotations</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Quotation Amount</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Converted</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Incoming</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Outgoing</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {isLoading ? (
                                                <tr><td colSpan="9" className="px-4 py-8 text-center text-sm text-primary"><span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Loading...</span></td></tr>
                                            ) : leadsReportRows.length === 0 ? (
                                                <tr><td colSpan="9" className="px-4 py-6 text-center text-sm text-gray-500">No rows to show</td></tr>
                                            ) : (
                                                leadsReportRows.map(row => (
                                                    <tr key={row.name} className="hover:bg-gray-50/60">
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium text-gray-900">{row.name}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-gray-700">{row.totalLeads}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-gray-700">{row.calls}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-gray-700">{row.convertedToEnquiry}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-gray-700">{row.quotations}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-gray-700">{row.quotationAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center">
                                                            <span className={`inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded-full text-xs font-semibold ${row.orderConverted > 0 ? "bg-emerald-50 text-emerald-700" : "text-gray-400"}`}>{row.orderConverted}</span>
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-sky-700">{row.incoming}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-amber-700">{row.outgoing}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Enquiries Section */}
                        <div>
                            <h3 className="text-base font-semibold text-gray-800 mb-3">Enquiries</h3>
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-100">
                                        <thead className="bg-gray-50/80">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">SC Name</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Enquiries</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Quotations</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Quotation Amount</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Converted</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Incoming</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Outgoing</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {isLoading ? (
                                                <tr><td colSpan="7" className="px-4 py-8 text-center text-sm text-primary"><span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Loading...</span></td></tr>
                                            ) : enquiriesReportRows.length === 0 ? (
                                                <tr><td colSpan="7" className="px-4 py-6 text-center text-sm text-gray-500">No rows to show</td></tr>
                                            ) : (
                                                enquiriesReportRows.map(row => (
                                                    <tr key={row.name} className="hover:bg-gray-50/60">
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium text-gray-900">{row.name}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-gray-700">{row.totalEnquiries}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-gray-700">{row.quotations}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-gray-700">{row.quotationAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center">
                                                            <span className={`inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded-full text-xs font-semibold ${row.orderConverted > 0 ? "bg-emerald-50 text-emerald-700" : "text-gray-400"}`}>{row.orderConverted}</span>
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-sky-700">{row.incoming}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-amber-700">{row.outgoing}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* FOS REPORT TAB CONTENT */}
                {activeTab === "fos" && (
                    <>
                        <p className="text-sm text-gray-500 mb-3 flex items-center gap-2">
                            {fosFilters.startDate || fosFilters.endDate
                                ? "Custom date range applies to every metric below, including Pipeline."
                                : "This week (Monday through today) for Enquiries/Orders columns; Pipeline looks back 60 days at non-converted work."}
                            {!isAdmin() && " You're seeing only your own row."}
                            {isLoading && <Spinner className="h-3.5 w-3.5 text-primary" />}
                        </p>

                        {isAdmin() && (
                            <div className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-100 mb-3">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Receiver Name</label>
                                <select
                                    className="w-full md:w-1/4 border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary text-sm p-2 border"
                                    value={fosFilters.receiverName}
                                    onChange={(e) => setFosFilters(prev => ({ ...prev, receiverName: e.target.value }))}
                                >
                                    <option value="all">All Receivers</option>
                                    {FOS_RECEIVERS.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <DateRangeFilterBar
                            startDate={fosFilters.startDate}
                            endDate={fosFilters.endDate}
                            onStartDateChange={(v) => setFosFilters(prev => ({ ...prev, startDate: v }))}
                            onEndDateChange={(v) => setFosFilters(prev => ({ ...prev, endDate: v }))}
                            onReset={() => setFosFilters(prev => ({ ...prev, startDate: "", endDate: "" }))}
                            defaultRangeLabel="Showing this week + rolling 60-day pipeline"
                        />

                        {fosError && (
                            <div className="mb-5 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
                                Couldn't load FOS report data: {fosError}
                            </div>
                        )}

                        {(() => {
                            const visibleNames = getScFilterList(fosFilters.receiverName);
                            return (
                                <>
                                    <FosMetricsTable title="Leads" rows={fosTableData.leads} visibleNames={visibleNames} isLoading={isLoading} />
                                    <FosMetricsTable title="Enquiries" rows={fosTableData.enquiries} visibleNames={visibleNames} isLoading={isLoading} />
                                </>
                            );
                        })()}
                    </>
                )}

                {/* SC PIPELINE TAB CONTENT */}
                {activeTab === "sc_pipeline" && (
                    <>
                        <p className="text-sm text-gray-500 mb-3 flex items-center gap-2">
                            {scPipelineFilters.startDate || scPipelineFilters.endDate
                                ? "Custom date range applies to every metric below, including Pipeline Value."
                                : "This week (Monday through today) for Enquiries/Orders columns; Pipeline Value looks back 60 days at non-converted work."}
                            {!isAdmin() && " You're seeing only your own column(s)."}
                            {isLoading && <Spinner className="h-3.5 w-3.5 text-primary" />}
                        </p>

                        <DateRangeFilterBar
                            startDate={scPipelineFilters.startDate}
                            endDate={scPipelineFilters.endDate}
                            onStartDateChange={(v) => setScPipelineFilters(prev => ({ ...prev, startDate: v }))}
                            onEndDateChange={(v) => setScPipelineFilters(prev => ({ ...prev, endDate: v }))}
                            onReset={() => setScPipelineFilters({ startDate: "", endDate: "" })}
                            defaultRangeLabel="Showing this week + rolling 60-day pipeline"
                        />

                        {scPipelineError && (
                            <div className="mb-5 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
                                Couldn't load SC Pipeline data: {scPipelineError}
                            </div>
                        )}
                        {(() => {
                            const visibleLabels = isAdmin() ? null : (getUsernamesToFilter() || []);
                            return (
                                <>
                                    <PipelineTable title="Leads" section={scPipelineData.leads} visibleLabels={visibleLabels} isLoading={isLoading} />
                                    <PipelineTable title="Enquiries" section={scPipelineData.enquiries} visibleLabels={visibleLabels} isLoading={isLoading} />
                                </>
                            );
                        })()}
                    </>
                )}

            </div>
        </div>
    );
}

export default Report;
