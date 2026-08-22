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

// Master "who shows up on this report tab" lists are curated on the Report
// Persons master page (Master > Report Persons) rather than derived from
// whatever raw values happen to appear in the data -- see fetchCallingPersons
// / fetchScPipelinePersons / fetchFosPersons below. All 3 reuse the existing
// lto_dropdown table (category/value pairs), one category per tab.
const REPORT_PERSON_CATEGORY = {
    CALLING: "report_person_calling",
    SC_PIPELINE: "report_person_sc_pipeline",
    FOS: "report_person_fos",
};

const formatMetricValue = (value, format) => {
    if (format === "blank") return "--";
    // Visit counts: null means the sheet fetch itself failed (shown as "--",
    // distinct from a real 0 -- a person can genuinely have zero visits
    // this week, which shouldn't look the same as "couldn't load this").
    if (format === "visitCount") return (value === null || value === undefined) ? "--" : value;
    if (format === "currency") return (value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    if (format === "percent") return `${(value || 0).toFixed(1)}%`;
    return value || 0;
};

// ---- Field Sales "Data" sheet (Total Visit count) -----------------------
// Read-only source: Code.gs's doGet on the "Data" sheet, columns A-F =
// Timestamp / SN / Sale Person Name / Date and Time to Visit /
// City-Location of Visit / Type of Visit, per task.txt. This is a plain
// GET against the Apps Script webapp (VITE_SALES_SHEET) -- Apps Script web
// apps allow cross-origin GET by default, so no proxy/no-cors workaround
// is needed here (unlike the POST sync in sheetSync.js).
const SALES_SHEET_URL = import.meta.env.VITE_SALES_SHEET;

const normalizeName = (n) => String(n || "").trim().toUpperCase();

// Column F is free text entered via the field app -- normalize casing so
// "new f2f" / "New F2F " etc. all land in the right bucket instead of
// silently falling through unmatched.
const normalizeVisitType = (raw) => {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "new f2f") return "newF2F";
    if (s === "existing f2f") return "existingF2F";
    return null;
};

// Sheet timestamps come back either as ISO strings (Apps Script serializes
// real Date cells that way via JSON.stringify) or as "YYYY-MM-DD HH:mm:ss"
// plain text (seen in the raw sheet for some rows) -- the latter isn't
// reliably parsed by `new Date()` in every browser, so normalize the
// separator before parsing.
const parseSheetTimestamp = (raw) => {
    if (!raw) return null;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    const s = String(raw).trim();
    if (!s) return null;
    const normalized = s.includes("T") ? s : s.replace(" ", "T");
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
};

// Counts New F2F / Existing F2F rows per Sale Person Name whose Timestamp
// falls in [rangeStart, rangeEnd] -- per task.txt this window is always
// "last Monday through today", independent of whatever date filter the FOS
// tab itself has applied. Returns a map keyed by normalized (trim+upper)
// name; throws on any fetch/parse failure so the caller can distinguish
// "genuinely zero visits" from "couldn't load the sheet".
async function fetchFosVisitCounts(rangeStart, rangeEnd) {
    if (!SALES_SHEET_URL) throw new Error("VITE_SALES_SHEET is not configured");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    let res;
    try {
        res = await fetch(SALES_SHEET_URL, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error(`Sheet request failed (${res.status})`);

    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Sheet request failed");

    const allRows = json.data || [];
    // Header row is wherever column A reads "Timestamp" -- avoids hardcoding
    // a row index that would break if a banner row is added/removed above it.
    const headerIdx = allRows.findIndex(r => normalizeName(r?.[0]) === "TIMESTAMP");
    const dataRows = headerIdx === -1 ? [] : allRows.slice(headerIdx + 1);

    const counts = {};
    dataRows.forEach(row => {
        const timestamp = parseSheetTimestamp(row[0]);
        if (!timestamp || timestamp < rangeStart || timestamp > rangeEnd) return;

        const name = normalizeName(row[2]);
        const visitType = normalizeVisitType(row[5]);
        if (!name || !visitType) return;

        if (!counts[name]) counts[name] = { newF2F: 0, existingF2F: 0 };
        counts[name][visitType]++;
    });
    return counts;
}

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
    { key: "newF2FVisits", label: "New F2F Visits", format: "visitCount" },
    { key: "existingF2FVisits", label: "Existing F2F Visits", format: "visitCount" },
    { key: "enquiries", label: "No. of Enquiries", format: "int" },
    { key: "enquiryValue", label: "Total Enquiry Value", format: "currency" },
    { key: "ordersConverted", label: "Orders Converted", format: "int" },
    { key: "orderConvertedValue", label: "Order Converted Value", format: "currency" },
    { key: "avgTicket", label: "Avg Ticket Size", format: "currency" },
    { key: "pipelineCount", label: "Pipeline", format: "int" },
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

    const [leadsReportRows, setLeadsReportRows] = useState([]);
    const [enquiriesReportRows, setEnquiriesReportRows] = useState([]);
    // Master "Person" list for the Calling Data tab -- curated on the
    // Report Persons master page (Master > Report Persons; lto_dropdown,
    // category "report_person_calling"), not derived from whatever raw
    // enquiry_assign_to_person values happen to appear in the data.
    // Deliberately NOT sourced from `login` -- a person can be curated here
    // without having a login account.
    const [callingPersons, setCallingPersons] = useState([]);
    const [callingFilters, setCallingFilters] = useState({ startDate: "", endDate: "" });

    const [fosTableData, setFosTableData] = useState({ leads: null, enquiries: null });
    // Surfaced in the UI if the fetch throws, same convention as SC Pipeline.
    const [fosError, setFosError] = useState(null);
    // Separate error slot for the Total Visit count sheet fetch -- a failure
    // there shouldn't blank out the rest of the (Supabase-backed) FOS table.
    const [fosVisitError, setFosVisitError] = useState(null);

    const [scPipelineData, setScPipelineData] = useState({ leads: null, enquiries: null });
    const [scPipelineError, setScPipelineError] = useState(null);
    const [scPipelineFilters, setScPipelineFilters] = useState({ startDate: "", endDate: "" });
    // Master SC list for the SC Pipeline tab -- WHO gets a column comes from
    // the curated master list (lto_dropdown, category
    // "report_person_sc_pipeline"); the split into `multi` (CRR/NBD_CRR
    // groups + TOTAL) vs `nbdOnly` (flat NBD-only column, no TOTAL) -- same
    // two-tier shape the old hardcoded SC_PIPELINE_MULTI_SCS/
    // SC_PIPELINE_NBD_ONLY_SCS arrays had -- is still derived from each
    // curated person's actual sales_type records.
    const [scPipelinePersons, setScPipelinePersons] = useState({ multi: [], nbdOnly: [] });

    // Master FOS receiver list -- curated on the Report Persons master page
    // (lto_dropdown, category "report_person_fos"); replaces the old
    // hardcoded FOS_RECEIVERS array.
    const [fosPersons, setFosPersons] = useState([]);

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

    // Master "Person" list for the Calling Data tab -- curated on the
    // Report Persons master page (Master > Report Persons), NOT derived
    // from whatever raw enquiry_assign_to_person values happen to exist in
    // the data (that showed every stray/typo'd value, including ones with
    // zero real activity). Independent of `login` -- a person can be
    // curated here without having a login account.
    const fetchCallingPersons = useCallback(async () => {
        try {
            const { data, error } = await fetchAllRows(() =>
                supabase.from("lto_dropdown").select("value").eq("category", REPORT_PERSON_CATEGORY.CALLING)
            );
            if (error) throw error;

            const names = new Set();
            (data || []).forEach(r => { if (r.value) names.add(r.value.trim()); });
            setCallingPersons([...names].sort());
        } catch (error) {
            console.error("Error fetching calling data persons:", error);
        }
    }, []);

    // Master SC list for the SC Pipeline tab -- see scPipelinePersons above.
    // The curated master list (report_person_sc_pipeline) decides WHICH
    // people get a column at all; the multi/nbd-only tier split is still
    // derived from their actual sales_type records, same as before, just
    // restricted to curated names.
    const fetchScPipelinePersons = useCallback(async () => {
        try {
            // lto_leads has no enquiry_assign_to_person column -- the
            // assigned person only lives on lto_call_tracker_for_leads
            // (same attribution gap as fetchFosMetrics/fetchScPipelineMetrics
            // below). Classification here must key off the SAME field the
            // actual metrics are computed from, or a person's CRR/NBD_CRR
            // vs NBD-only tier could disagree with what their column shows.
            const [{ data: masterData, error: masterErr }, { data: leadsData, error: leadsErr }, { data: leadCallsData, error: leadCallsErr }, { data: enqData, error: enqErr }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_dropdown").select("value").eq("category", REPORT_PERSON_CATEGORY.SC_PIPELINE)),
                fetchAllRows(() => supabase.from("lto_leads").select("id, sales_type")),
                fetchAllRows(() => supabase.from("lto_call_tracker_for_leads").select("lead_id, enquiry_assign_to_person, created_at")),
                fetchAllRows(() => supabase.from("lto_enquiries").select("enquiry_assign_to_person, sales_type")),
            ]);
            if (masterErr) throw masterErr;
            if (leadsErr) throw leadsErr;
            if (leadCallsErr) throw leadCallsErr;
            if (enqErr) throw enqErr;

            const masterNames = new Set();
            (masterData || []).forEach(r => { if (r.value) masterNames.add(r.value.trim()); });

            const multi = new Set();
            const nbdOnly = new Set();
            const classify = (name, salesType) => {
                const trimmed = name?.trim();
                if (!trimmed || !masterNames.has(trimmed)) return;
                const category = normalizeCategory(salesType);
                if (category === "CRR" || category === "NBD_CRR") multi.add(trimmed);
                if (category === "NBD") nbdOnly.add(trimmed);
            };

            const personByLeadId = new Map();
            (leadCallsData || []).forEach(c => {
                if (!c.lead_id || !c.enquiry_assign_to_person) return;
                const existing = personByLeadId.get(c.lead_id);
                if (!existing || new Date(c.created_at) > new Date(existing.at)) {
                    personByLeadId.set(c.lead_id, { person: c.enquiry_assign_to_person, at: c.created_at });
                }
            });
            (leadsData || []).forEach(l => classify(personByLeadId.get(l.id)?.person, l.sales_type));
            (enqData || []).forEach(e => classify(e.enquiry_assign_to_person, e.sales_type));

            // A curated person with literally zero matching records yet
            // (e.g. newly added, hasn't handled anything of this kind) would
            // otherwise vanish from the table entirely -- default them into
            // the CRR/NBD_CRR ("multi") group so they still get a column
            // (all zeros) instead of silently disappearing.
            masterNames.forEach(name => {
                if (!multi.has(name) && !nbdOnly.has(name)) multi.add(name);
            });

            setScPipelinePersons({ multi: [...multi].sort(), nbdOnly: [...nbdOnly].sort() });
        } catch (error) {
            console.error("Error fetching SC Pipeline persons:", error);
        }
    }, []);

    // Master FOS receiver list -- see fosPersons above.
    const fetchFosPersons = useCallback(async () => {
        try {
            const { data, error } = await fetchAllRows(() =>
                supabase.from("lto_dropdown").select("value").eq("category", REPORT_PERSON_CATEGORY.FOS)
            );
            if (error) throw error;

            const names = new Set();
            (data || []).forEach(r => { if (r.value) names.add(r.value.trim()); });
            setFosPersons([...names].sort());
        } catch (error) {
            console.error("Error fetching FOS persons:", error);
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

            // Visible rows: admin sees every known Person; a non-admin sees
            // only a row whose Person name matches their login username, or
            // none at all if their username never appears as an assigned
            // person (Person values aren't login-linked, unlike the old SC
            // Name list).
            const allowedNames = isAdmin() ? callingPersons : (getUsernamesToFilter() || []);
            const visiblePersons = callingPersons.filter(name => allowedNames.includes(name));

            if (visiblePersons.length === 0) {
                setLeadsReportRows([]);
                setEnquiriesReportRows([]);
                return;
            }

            // ---- Base tables (unbounded -- a quotation created this week can
            // reference a lead/enquiry created any time in the past, so the
            // lead_no/enquiry_no -> Person lookup needs the full table).
            // Attribution is the lead/enquiry's OWN receiver-name column --
            // lead_receiver_name / enquiry_receiver_name -- not any
            // call-tracker or "assign to person" field.
            const [{ data: allLeads }, { data: allEnquiries }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_leads").select("id, lead_no, lead_receiver_name, created_at")),
                fetchAllRows(() => supabase.from("lto_enquiries").select("id, enquiry_no, enquiry_receiver_name, enquiry_approach, created_at")),
            ]);
            const leadById = new Map();
            (allLeads || []).forEach(l => leadById.set(l.id, l));

            // ---- This week's (or the filtered range's) call-tracker rows
            // (leads only -- there is no equivalent call-tracker table for
            // direct enquiries). Credited to the lead's OWN
            // lead_receiver_name (via leadById), not this row's own
            // enquiry_assign_to_person -- a call can be logged by someone
            // other than the lead's receiver.
            const { data: weekCalls } = await fetchAllRows(() =>
                supabase.from("lto_call_tracker_for_leads")
                    .select("lead_id, created_at, enquiry_approach")
                    .gte("created_at", rangeStartISO)
                    .lte("created_at", rangeEndISO)
            );

            // ---- "Converted to Enquiries" = the lead is showing up in the
            // Enquiry Tracker's Pending tab, i.e. lto_call_tracker_for_leads
            // has planned_at set for it (written at the moment a call is
            // logged with "Enquiry Received = yes" -- see
            // CallTrackerForm.jsx). Fetched unbounded/all-time since a lead
            // created this week could have been called (and had planned_at
            // set) at any point up to now.
            const { data: allLeadCallsForPlanning } = await fetchAllRows(() =>
                supabase.from("lto_call_tracker_for_leads").select("lead_id, planned_at")
            );
            const leadIdsWithPlannedAt = new Set();
            (allLeadCallsForPlanning || []).forEach(c => {
                if (c.lead_id && c.planned_at) leadIdsWithPlannedAt.add(c.lead_id);
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

            // ---- Lookups: lead_no / enquiry_no -> Person, for tying a
            // quotation back to whichever person's lead/enquiry it belongs to ----
            const leadPersonByLeadNo = new Map();
            (allLeads || []).forEach(l => {
                if (l.lead_no && l.lead_receiver_name) leadPersonByLeadNo.set(l.lead_no.trim().toUpperCase(), l.lead_receiver_name);
            });
            const enquiryById = new Map();
            const enquiryPersonByEnquiryNo = new Map();
            (allEnquiries || []).forEach(e => {
                enquiryById.set(e.id, e);
                if (e.enquiry_no) enquiryPersonByEnquiryNo.set(e.enquiry_no.trim().toUpperCase(), e.enquiry_receiver_name);
            });

            // ==================== LEADS SECTION ====================
            const leadStats = {};
            visiblePersons.forEach(name => {
                leadStats[name] = {
                    name, totalLeads: 0, calls: 0, convertedToEnquiry: 0,
                    quotations: 0, quotationAmount: 0, orderConverted: 0, incoming: 0, outgoing: 0,
                };
            });

            // Credited to the lead's own lead_receiver_name (via leadById),
            // not this call row's own enquiry_assign_to_person.
            const callsByLeadId = new Map();
            (weekCalls || []).forEach(c => {
                if (!c.lead_id) return;
                const person = leadById.get(c.lead_id)?.lead_receiver_name;
                if (!person) return;
                if (!callsByLeadId.has(c.lead_id)) callsByLeadId.set(c.lead_id, { person, approaches: new Set() });
                if (c.enquiry_approach) callsByLeadId.get(c.lead_id).approaches.add(String(c.enquiry_approach).trim().toUpperCase());
            });

            (allLeads || []).forEach(lead => {
                if (!inThisWeek(lead.created_at)) return;
                const person = lead.lead_receiver_name;
                if (!person || !leadStats[person]) return;
                leadStats[person].totalLeads++;

                if (leadIdsWithPlannedAt.has(lead.id)) leadStats[person].convertedToEnquiry++;

                const callEntry = callsByLeadId.get(lead.id);
                if (callEntry) {
                    if (callEntry.approaches.has("INCOMING")) leadStats[person].incoming++;
                    if (callEntry.approaches.has("OUTGOING")) leadStats[person].outgoing++;
                }
            });

            // No. of Calls: distinct leads (any creation date) called this
            // week, credited to that lead's own lead_receiver_name, max one per lead.
            callsByLeadId.forEach(entry => {
                if (entry.person && leadStats[entry.person]) leadStats[entry.person].calls++;
            });

            // Order Converted: any lead (any creation date) whose order was
            // marked received this week, credited to that lead's lead_receiver_name.
            (weekLeadOrders || []).forEach(row => {
                const person = leadById.get(row.lead_id)?.lead_receiver_name;
                if (person && leadStats[person]) leadStats[person].orderConverted++;
            });

            // Quotations: root quotations created this week whose reference
            // no. points at a lead (LD-...), credited to that lead's lead_receiver_name.
            rootWeekQuotations.forEach(q => {
                const ref = String(q.enquiry_reference_no || "").trim().toUpperCase();
                if (!ref.startsWith("LD-")) return;
                const person = leadPersonByLeadNo.get(ref);
                if (person && leadStats[person]) {
                    leadStats[person].quotations++;
                    leadStats[person].quotationAmount += quotationAmountByQId.get(q.id) || 0;
                }
            });

            setLeadsReportRows(visiblePersons.map(name => leadStats[name]));

            // ==================== ENQUIRIES SECTION ====================
            const enquiryStats = {};
            visiblePersons.forEach(name => {
                enquiryStats[name] = {
                    name, totalEnquiries: 0, quotations: 0, quotationAmount: 0,
                    orderConverted: 0, incoming: 0, outgoing: 0,
                };
            });

            (allEnquiries || []).forEach(e => {
                if (!inThisWeek(e.created_at)) return;
                const person = e.enquiry_receiver_name;
                if (!person || !enquiryStats[person]) return;
                enquiryStats[person].totalEnquiries++;
                const approach = String(e.enquiry_approach || "").trim().toUpperCase();
                if (approach === "INCOMING") enquiryStats[person].incoming++;
                if (approach === "OUTGOING") enquiryStats[person].outgoing++;
            });

            (weekEnquiryOrders || []).forEach(row => {
                const e = enquiryById.get(row.enquiry_id);
                if (e?.enquiry_receiver_name && enquiryStats[e.enquiry_receiver_name]) enquiryStats[e.enquiry_receiver_name].orderConverted++;
            });

            rootWeekQuotations.forEach(q => {
                const ref = String(q.enquiry_reference_no || "").trim().toUpperCase();
                if (!ref.startsWith("EN-")) return;
                const person = enquiryPersonByEnquiryNo.get(ref);
                if (person && enquiryStats[person]) {
                    enquiryStats[person].quotations++;
                    enquiryStats[person].quotationAmount += quotationAmountByQId.get(q.id) || 0;
                }
            });

            setEnquiriesReportRows(visiblePersons.map(name => enquiryStats[name]));

        } catch (error) {
            console.error("Error fetching calling data report:", error);
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, isAdmin, getUsernamesToFilter, callingPersons, callingFilters]);

    const fetchFosMetrics = useCallback(async () => {
        if (activeTab !== "fos") return;
        setIsLoading(true);
        setFosError(null);
        setFosVisitError(null);
        try {
            const monday = getMondayStart();
            const now = new Date();

            // Kicked off up front so it overlaps with the Supabase fetches
            // below rather than adding its own latency on top. Total Visit
            // count is always "last Monday through today" per task.txt --
            // deliberately NOT the fosFilters custom range/60-day pipeline
            // windows used by the rest of this tab's metrics.
            const visitCountsPromise = fetchFosVisitCounts(monday, now)
                .then(counts => { setFosVisitError(null); return counts; })
                .catch(err => {
                    console.error("FOS visit-count fetch error:", err);
                    setFosVisitError(err?.message || "Failed to load Total Visit count.");
                    return null; // null (not {}) so it renders "--", not "0"
                });
            const defaultSixtyDaysAgo = new Date(now);
            defaultSixtyDaysAgo.setDate(defaultSixtyDaysAgo.getDate() - 60);
            const hasCustomRange = !!(fosFilters.startDate || fosFilters.endDate);

            const rangeStart = hasCustomRange
                ? (fosFilters.startDate ? new Date(`${fosFilters.startDate}T00:00:00`) : defaultSixtyDaysAgo)
                : monday;
            const rangeEnd = hasCustomRange
                ? (fosFilters.endDate ? new Date(getEndDateWithTime(fosFilters.endDate)) : now)
                : now;

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

            // Pipeline = genuinely PENDING work, matching the Enquiry
            // Tracker's own "Pending" tab (enquiry_pending_view): anything
            // that hasn't resolved to yes/no yet. A brand-new record with
            // ZERO tracker activity still counts here -- it's untouched,
            // not resolved, and it's exactly what shows up in that Pending
            // tab -- only an explicit "yes" (converted) or "no" (order
            // lost) removes it from pipeline.
            const isPendingRows = (rows) => {
                const hasYes = rows.some(t => String(t.is_order_received_status || "").trim().toLowerCase() === "yes");
                const hasNo = rows.some(t => String(t.is_order_received_status || "").trim().toLowerCase() === "no");
                return !hasYes && !hasNo;
            };

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

                    // Latest row that actually HAS a quotation value -- not
                    // just the newest row overall. A later stage (e.g. Order
                    // Expected) inserts its own tracker row without ever
                    // touching quotation_value_without_tax, so picking the
                    // literal newest row would silently zero this out even
                    // though an earlier row already set it.
                    let latestValueRow = null;
                    trackerRows.forEach(t => {
                        if (t.quotation_value_without_tax === null || t.quotation_value_without_tax === undefined) return;
                        if (!latestValueRow || new Date(t.created_at) > new Date(latestValueRow.created_at)) latestValueRow = t;
                    });
                    const latestValue = latestValueRow ? parseMoney(latestValueRow.quotation_value_without_tax) : 0;

                    if (inRange(rec.created_at)) {
                        enquiries++;
                        enquiryValue += latestValue;
                        if (isConverted) {
                            ordersConverted++;
                            orderConvertedValue += latestValue;
                        }
                    }
                    if (inPipelineWindow(rec.created_at) && isPendingRows(trackerRows)) {
                        pipelineCount++;
                        pipelineValue += latestValue;
                    }
                });

                return {
                    name,
                    enquiries, enquiryValue, ordersConverted, orderConvertedValue,
                    avgTicket: ordersConverted > 0 ? orderConvertedValue / ordersConverted : 0,
                    pipelineCount, pipelineValue,
                };
            };

            // visitCounts is keyed by normalized (trim+upper) name; null
            // means the sheet fetch failed, {} means it loaded but had no
            // matching rows for anyone in-range -- both are handled by
            // formatMetricValue's "visitCount" case ("--" vs a real 0/1/2/...
            const withVisitCounts = (rows) => rows.map(r => {
                const c = visitCounts ? visitCounts[normalizeName(r.name)] : null;
                return {
                    ...r,
                    newF2FVisits: visitCounts ? (c?.newF2F ?? 0) : null,
                    existingF2FVisits: visitCounts ? (c?.existingF2F ?? 0) : null,
                };
            });

            // ---- Leads section ----
            // lto_leads has no enquiry_assign_to_person column of its own --
            // that field only lives on lto_call_tracker_for_leads, set once
            // a call is logged with "Enquiry Received = yes" (same
            // attribution path the Calling Data tab uses). Fetched unbounded
            // since a lead created this week could be assigned at any point
            // up to now; most recent assignment wins if more than one exists.
            const [{ data: allLeads, error: leadsErr }, { data: allLeadTrackers, error: leadTrackersErr }, { data: allLeadCalls, error: leadCallsErr }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_leads").select("id, created_at")
                    .gte("created_at", fetchStartISO).lte("created_at", fetchEndISO)),
                fetchAllRows(() => supabase.from("lto_enquiry_tracker_for_leads").select("lead_id, created_at, is_order_received_status, quotation_value_without_tax")
                    .gte("created_at", fetchStartISO)),
                fetchAllRows(() => supabase.from("lto_call_tracker_for_leads").select("lead_id, enquiry_assign_to_person, created_at")),
            ]);
            if (leadsErr) throw leadsErr;
            if (leadTrackersErr) throw leadTrackersErr;
            if (leadCallsErr) throw leadCallsErr;

            const personByLeadId = new Map();
            (allLeadCalls || []).forEach(c => {
                if (!c.lead_id || !c.enquiry_assign_to_person) return;
                const existing = personByLeadId.get(c.lead_id);
                if (!existing || new Date(c.created_at) > new Date(existing.at)) {
                    personByLeadId.set(c.lead_id, { person: c.enquiry_assign_to_person, at: c.created_at });
                }
            });

            const leadTrackerByLeadId = new Map();
            (allLeadTrackers || []).forEach(t => {
                if (!t.lead_id) return;
                if (!leadTrackerByLeadId.has(t.lead_id)) leadTrackerByLeadId.set(t.lead_id, []);
                leadTrackerByLeadId.get(t.lead_id).push(t);
            });
            const leadRecords = (allLeads || []).map(l => ({ ...l, _receiverName: personByLeadId.get(l.id)?.person || null }));
            const leadsRows = fosPersons.map(name => computePersonMetrics(name, leadRecords, leadTrackerByLeadId));

            // ---- Enquiries section ----
            const [{ data: allEnquiries, error: enqErr }, { data: allEnquiryTrackers, error: enqTrackersErr }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_enquiries").select("id, enquiry_assign_to_person, created_at")
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
            const enquiryRecords = (allEnquiries || []).map(e => ({ ...e, _receiverName: e.enquiry_assign_to_person }));
            const enquiriesRows = fosPersons.map(name => computePersonMetrics(name, enquiryRecords, enquiryTrackerByEnquiryId));

            const visitCounts = await visitCountsPromise;
            setFosTableData({ leads: withVisitCounts(leadsRows), enquiries: withVisitCounts(enquiriesRows) });

        } catch (err) {
            console.error("FOS fetch error:", err);
            setFosError(err?.message || "Failed to load FOS report data.");
            setFosTableData({ leads: [], enquiries: [] });
        } finally {
            setIsLoading(false);
        }
    }, [fosFilters, activeTab, fosPersons]);

    const normalizeCategory = (rawSalesType) => {
        const s = String(rawSalesType || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
        if (s === "NBD_CRR") return "NBD_CRR";
        if (s === "CRR") return "CRR";
        if (s === "NBD") return "NBD";
        return null;
    };
    const fetchScPipelineMetrics = useCallback(async () => {
        if (activeTab !== "sc_pipeline") return;
        setIsLoading(true);
        setScPipelineError(null);
        try {
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

            // Pipeline = genuinely PENDING work, same definition as the FOS
            // Report tab -- see the comment there. Zero tracker activity
            // still counts as pending; only an explicit yes/no removes it.
            const isPendingRows = (rows) => {
                const hasYes = rows.some(t => String(t.is_order_received_status || "").trim().toLowerCase() === "yes");
                const hasNo = rows.some(t => String(t.is_order_received_status || "").trim().toLowerCase() === "no");
                return !hasYes && !hasNo;
            };

            // For one filtered slice of records (already scoped to a single
            // SC+category, or a team-total group), compute all 8 metrics.
            const computeGroupMetrics = (records, trackerByRecordId) => {
                let enquiries = 0, enquiryValue = 0, pipelineValue = 0, noOrder = 0, billValue = 0;

                records.forEach(rec => {
                    const trackerRows = trackerByRecordId.get(rec.id) || [];

                    // Latest row that actually HAS a quotation value -- see
                    // the identical fix/comment in fetchFosMetrics above.
                    let latestValueRow = null;
                    trackerRows.forEach(t => {
                        if (t.quotation_value_without_tax === null || t.quotation_value_without_tax === undefined) return;
                        if (!latestValueRow || new Date(t.created_at) > new Date(latestValueRow.created_at)) latestValueRow = t;
                    });
                    const latestQuotationValue = latestValueRow ? parseMoney(latestValueRow.quotation_value_without_tax) : 0;

                    if (inThisWeek(rec.created_at)) {
                        enquiries++;
                        enquiryValue += latestQuotationValue;
                    }
                    if (inLast60Days(rec.created_at) && isPendingRows(trackerRows)) {
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

            // Builds the full column set (2 category groups x [multi SCs +
            // TOTAL], plus the NBD-only single columns) for either leads or
            // enquiries. `multiScs`/`nbdOnlyScs` come from scPipelinePersons
            // (data-driven -- see fetchScPipelinePersons) rather than a fixed
            // list, but the two-tier shape itself is unchanged.
            const buildSection = (records, trackerByRecordId, scField, multiScs, nbdOnlyScs) => {
                const categoryGroups = ["CRR", "NBD_CRR"].map(category => {
                    const perSc = multiScs.map(sc => ({
                        key: `${sc}_${category}`, label: sc,
                        metrics: computeGroupMetrics(records.filter(r => r[scField] === sc && normalizeCategory(r.sales_type) === category), trackerByRecordId),
                    }));
                    const totalRecords = records.filter(r => multiScs.includes(r[scField]) && normalizeCategory(r.sales_type) === category);
                    return {
                        category,
                        columns: [...perSc, { key: `TOTAL_${category}`, label: "TOTAL", isTotal: true, metrics: computeGroupMetrics(totalRecords, trackerByRecordId) }],
                    };
                });
                const nbdColumns = nbdOnlyScs.map(sc => ({
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
            // lto_leads has no enquiry_assign_to_person column -- same
            // attribution gap as FOS Report -- so the assigned person is
            // looked up via lto_call_tracker_for_leads (unbounded, most
            // recent assignment per lead wins) and attached as a synthetic
            // `_assignedPerson` field for buildSection to key off.
            const [{ data: allLeads }, { data: allLeadTrackers }, { data: allLeadCalls }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_leads").select("id, sales_type, created_at")
                    .gte("created_at", fetchStartISO).lte("created_at", fetchEndISO)),
                fetchAllRows(() => supabase.from("lto_enquiry_tracker_for_leads").select("lead_id, created_at, is_order_received_status, quotation_value_without_tax, amount_with_tax")
                    .gte("created_at", fetchStartISO)),
                fetchAllRows(() => supabase.from("lto_call_tracker_for_leads").select("lead_id, enquiry_assign_to_person, created_at")),
            ]);
            const personByLeadId = new Map();
            (allLeadCalls || []).forEach(c => {
                if (!c.lead_id || !c.enquiry_assign_to_person) return;
                const existing = personByLeadId.get(c.lead_id);
                if (!existing || new Date(c.created_at) > new Date(existing.at)) {
                    personByLeadId.set(c.lead_id, { person: c.enquiry_assign_to_person, at: c.created_at });
                }
            });
            const leadTrackerByLeadId = new Map();
            (allLeadTrackers || []).forEach(t => {
                if (!t.lead_id) return;
                if (!leadTrackerByLeadId.has(t.lead_id)) leadTrackerByLeadId.set(t.lead_id, []);
                leadTrackerByLeadId.get(t.lead_id).push(t);
            });
            const leadRecordsWithPerson = (allLeads || []).map(l => ({ ...l, _assignedPerson: personByLeadId.get(l.id)?.person || null }));
            const leadsSection = buildSection(leadRecordsWithPerson, leadTrackerByLeadId, "_assignedPerson", scPipelinePersons.multi, scPipelinePersons.nbdOnly);

            // ---- Enquiries ----
            const [{ data: allEnquiries }, { data: allEnquiryTrackers }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_enquiries").select("id, enquiry_assign_to_person, sales_type, created_at")
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
            const enquiriesSection = buildSection(allEnquiries || [], enquiryTrackerByEnquiryId, "enquiry_assign_to_person", scPipelinePersons.multi, scPipelinePersons.nbdOnly);

            setScPipelineData({ leads: leadsSection, enquiries: enquiriesSection });

        } catch (error) {
            console.error("Error fetching SC Pipeline metrics:", error);
            setScPipelineError(error?.message || "Failed to load SC Pipeline data.");
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, scPipelineFilters, scPipelinePersons]);


    useEffect(() => {
        fetchCallingPersons();
        fetchScPipelinePersons();
        fetchFosPersons();
    }, [fetchCallingPersons, fetchScPipelinePersons, fetchFosPersons]);


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
            <div className="container mx-auto max-w-[1600px]">
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
                                ? "Custom date range -- one row per Person."
                                : "Current week (Monday through today) -- one row per Person."}
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
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Person</th>
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
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Person</th>
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
                        <p className="text-sm text-gray-500 mb-1 flex items-center gap-2">
                            {fosFilters.startDate || fosFilters.endDate
                                ? "Custom date range applies to every metric below, including Pipeline."
                                : "This week (Monday through today) for Enquiries/Orders columns; Pipeline looks back 60 days at non-converted work."}
                            {!isAdmin() && " You're seeing only your own row."}
                            {isLoading && <Spinner className="h-3.5 w-3.5 text-primary" />}
                        </p>
                        <p className="text-xs text-gray-400 mb-3">
                            New/Existing F2F Visits always cover last Monday through today, regardless of the date filter below.
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
                                    {fosPersons.map(name => (
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

                        {fosVisitError && (
                            <div className="mb-5 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
                                Couldn't load Total Visit count from the sheet: {fosVisitError}
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
