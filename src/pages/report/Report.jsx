import { useState, useEffect, useContext, useCallback, useRef, useId, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import StatusTabs from "../../components/StatusTabs";
import { AuthContext } from "../../App";
import supabase from "../../utils/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { fetchLostDetails, isLostStatus, parseMoney } from "./lostDetailsData";
import { latestQuotationPerFamily, fetchOrderQuotationValues } from "./quotationMetrics";
import * as XLSX from "xlsx";
import { Download, FileText, Search, ChevronLeft, ChevronRight, Calendar, RotateCcw, X } from "lucide-react";

const REPORT_PERSON_CATEGORY = {
    CALLING: "report_person_calling",
    SC_PIPELINE: "report_person_sc_pipeline",
};

const formatMetricValue = (value, format) => {
    if (format === "blank") return "--";

    if (format === "visitCount") return (value === null || value === undefined) ? "--" : value;
    if (format === "currency") return (value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    if (format === "percent") return `${(value || 0).toFixed(1)}%`;
    return value || 0;
};

const normalizeName = (n) => String(n || "").trim().toUpperCase();

const matchesPersonName = (personName, allowedList) => {
    if (!allowedList) return true;
    if (!personName) return false;
    const p = String(personName).trim().toLowerCase();
    return allowedList.some((a) => {
        if (!a) return false;
        const normA = String(a).trim().toLowerCase();
        return normA === p || p.split(/\s+/).includes(normA) || normA.split(/\s+/).includes(p);
    });
};

// field_sales_form.visit_type is a fixed dropdown in the field app (New F2F /
// Existing F2F / MDO F2F) -- normalize casing/spacing anyway so a stray
// "new f2f " still lands in the right bucket.
const normalizeVisitType = (raw) => {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "new f2f") return "newF2FVisits";
    if (s === "existing f2f") return "existingF2FVisits";
    if (s === "mdo f2f") return "mdoF2FVisits";
    return null;
};

// Green/amber/rose thresholds for at-a-glance conversion health -- applied
// to both % metric cells, consistent across the whole page.
const getPercentColorClass = (pct) => {
    if (pct >= 50) return "text-success bg-success/10";
    if (pct >= 25) return "text-warning-foreground bg-warning/15";
    return "text-destructive bg-destructive/10";
};

function Spinner({ className = "h-4 w-4" }) {
    return (
        <svg aria-hidden="true" className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    );
}

// Shared Start/End date filter bar for Calling Data + SC Pipeline. Both tabs
// default to a fixed window (per task.txt) with no filter applied -- setting
// either date here switches that tab over to a server-queried custom range
// instead of the default, until "Reset to default" is pressed.
function DateRangeFilterBar({ startDate, endDate, onStartDateChange, onEndDateChange, onReset, defaultRangeLabel, children }) {
    const uid = useId();
    const hasCustomRange = !!(startDate || endDate);
    return (
        <div className="bg-card p-3.5 rounded-lg border mb-5 flex flex-col md:flex-row gap-3 items-end md:items-center">
            <div className="w-full md:w-1/5">
                <label htmlFor={`${uid}-start`} className="block text-xs font-medium text-muted-foreground mb-1">Start Date</label>
                <input
                    id={`${uid}-start`}
                    type="date"
                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                    value={startDate}
                    onChange={(e) => onStartDateChange(e.target.value)}
                />
            </div>
            <div className="w-full md:w-1/5">
                <label htmlFor={`${uid}-end`} className="block text-xs font-medium text-muted-foreground mb-1">End Date</label>
                <input
                    id={`${uid}-end`}
                    type="date"
                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                    value={endDate}
                    onChange={(e) => onEndDateChange(e.target.value)}
                />
            </div>
            {children}
            <div className="w-full md:w-auto">
                <button
                    type="button"
                    onClick={onReset}
                    disabled={!hasCustomRange}
                    className="h-9 px-4 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent w-full md:w-auto disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Reset to default
                </button>
            </div>
            <div className="text-xs text-muted-foreground md:ml-1" aria-live="polite">
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
                <h2 className="text-base font-semibold text-foreground mb-3">{title}</h2>
                <div className="bg-card rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
                    {isLoading ? (
                        <span className="inline-flex items-center gap-2 text-primary">
                            <Spinner className="h-4 w-4" /> Loading data for this range...
                        </span>
                    ) : "No data available."}
                </div>
            </div>
        );
    }

    const keep = (label) => visibleLabels === null || matchesPersonName(label, visibleLabels);

    const allColumns = [];
    section.categoryGroups.forEach(g => {
        const cols = g.columns.filter(c => keep(c.label));
        cols.forEach((c, i) => allColumns.push({ ...c, groupStart: i === 0, groupLabel: g.category, groupSpan: cols.length }));
    });
    const visibleNbdColumns = section.nbdColumns.filter(c => keep(c.label));
    visibleNbdColumns.forEach((c, i) => allColumns.push({ ...c, groupStart: i === 0, groupLabel: i === 0 ? "NBD" : null, groupSpan: visibleNbdColumns.length }));

    return (
        <div className="mb-8">
            <h2 className="text-base font-semibold text-foreground mb-3">{title}</h2>
            <div className="bg-card rounded-lg border overflow-hidden">
                {allColumns.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">No rows to show</div>
                ) : (
                    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${title} table, scrollable`}>
                        <table className="min-w-full divide-y">
                            <thead className="bg-secondary">
                                <tr>
                                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-brand-800 sticky left-0 bg-secondary">Metric</th>
                                    {allColumns.filter(c => c.groupStart).map(c => (
                                        <th key={`grp-${c.key}`} colSpan={c.groupSpan} className="px-4 py-2 text-center text-xs font-semibold text-brand-800 border-l">
                                            {c.groupLabel}
                                        </th>
                                    ))}
                                </tr>
                                <tr>
                                    <th scope="col" className="px-4 py-2 text-left text-xs sticky left-0 bg-secondary"><span className="sr-only">Metric</span></th>
                                    {allColumns.map(c => (
                                        <th key={c.key} className={`px-4 py-2 text-center text-xs font-semibold text-foreground ${c.groupStart ? "border-l" : ""}`}>
                                            {c.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {isLoading ? (
                                    <tr><td colSpan={allColumns.length + 1} className="px-4 py-8 text-center text-sm text-primary"><span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Loading data for this range...</span></td></tr>
                                ) : (
                                    PIPELINE_METRIC_ROWS.map(row => (
                                        <tr key={row.key} className="hover:bg-secondary/60">
                                            <td className="px-4 py-2.5 text-sm font-medium text-foreground whitespace-nowrap sticky left-0 bg-card">{row.label}</td>
                                            {allColumns.map(c => {
                                                const val = c.metrics[row.key];
                                                return (
                                                    <td
                                                        key={c.key}
                                                        className={`px-4 py-2.5 text-center text-sm whitespace-nowrap ${c.groupStart ? "border-l" : ""} ${c.isTotal ? "font-semibold bg-secondary" : "text-foreground"} ${row.format === "percent" ? getPercentColorClass(val) : ""}`}
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
    { key: "newF2FVisits", label: "New F2F Visits", format: "int" },
    { key: "existingF2FVisits", label: "Existing F2F Visits", format: "int" },
    { key: "mdoF2FVisits", label: "MDO F2F Visits", format: "int" },
    { key: "enquiries", label: "Total Enquiries", format: "int" },
    { key: "quotationValue", label: "Total Quotation Value", format: "currency" },
    { key: "ordersConverted", label: "Order Converted", format: "int" },
    { key: "orderConvertedValue", label: "Converted Order Value", format: "currency" },
    { key: "avgTicket", label: "Avg Ticket Size", format: "currency" },
    { key: "pipelineCount", label: "Pipeline", format: "int" },
    { key: "pipelineValue", label: "Pipeline Value", format: "currency" },
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
                <h2 className="text-base font-semibold text-foreground mb-3">{title}</h2>
                <div className="bg-card rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
                    {isLoading ? (
                        <span className="inline-flex items-center gap-2 text-primary">
                            <Spinner className="h-4 w-4" /> Loading data for this range...
                        </span>
                    ) : "No data available."}
                </div>
            </div>
        );
    }

    const visibleRows = rows.filter(r => visibleNames === null || matchesPersonName(r.name, visibleNames));

    return (
        <div className="mb-8">
            <h2 className="text-base font-semibold text-foreground mb-3">{title}</h2>
            <div className="bg-card rounded-lg border overflow-hidden">
                {visibleRows.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">No rows to show</div>
                ) : (
                    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${title} table, scrollable`}>
                        <table className="min-w-full divide-y">
                            <thead className="bg-secondary">
                                <tr>
                                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-brand-800 sticky left-0 bg-secondary">Name</th>
                                    {FOS_METRIC_COLUMNS.map(c => (
                                        <th key={c.key} className="px-4 py-2 text-center text-xs font-semibold text-foreground whitespace-nowrap">{c.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {isLoading ? (
                                    <tr><td colSpan={FOS_METRIC_COLUMNS.length + 1} className="px-4 py-8 text-center text-sm text-primary"><span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Loading data for this range...</span></td></tr>
                                ) : (
                                    visibleRows.map(row => (
                                        <tr key={row.name} className="hover:bg-secondary/60">
                                            <td className="px-4 py-2.5 text-sm font-medium text-foreground whitespace-nowrap sticky left-0 bg-card">{row.name}</td>
                                            {FOS_METRIC_COLUMNS.map(c => (
                                                <td key={c.key} className="px-4 py-2.5 text-center text-sm whitespace-nowrap text-foreground">
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

const formatCurrency = (v) => (v || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

// Lost Details tab -- All-in-one view with unified filter & action card,
// KPI summary cards, and detailed records table with wrapped lost reasons.
function LostDetailsAllInOne({
    records,
    isLoading,
    isLoadingMore,
    expectedTotal,
    isAdmin,
    getUsernamesToFilter,
    source,
    setSource,
    startDate,
    endDate,
    onStartDateChange,
    onEndDateChange,
    onReset,
}) {
    const [selectedSc, setSelectedSc] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [showDateModal, setShowDateModal] = useState(false);
    const [tempStart, setTempStart] = useState(startDate || "");
    const [tempEnd, setTempEnd] = useState(endDate || "");
    const pageSize = 20;

    const activeRecords = (source === "lead" ? records?.leads : records?.enquiries) || [];

    // Reset pagination when filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [source, selectedSc, searchTerm]);

    // Keep temp dates synced with external props
    useEffect(() => {
        setTempStart(startDate || "");
        setTempEnd(endDate || "");
    }, [startDate, endDate]);

    // Dynamic: Only show SCs who actually have lost records in the active source (leads or enquiries)
    const availableScNames = useMemo(() => {
        const set = new Set();
        (activeRecords || []).forEach((r) => {
            const name = (r.scName || "").trim();
            if (name && name !== "--") {
                set.add(name);
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [activeRecords]);

    // Reset selectedSc to "all" if the previously selected person has no lost records in current activeRecords
    useEffect(() => {
        if (selectedSc !== "all" && !availableScNames.includes(selectedSc)) {
            setSelectedSc("all");
        }
    }, [availableScNames, selectedSc]);

    // Reset all filters icon handler
    const handleResetAll = () => {
        onReset();
        setTempStart("");
        setTempEnd("");
        setSelectedSc("all");
        setSearchTerm("");
    };

    // Date trigger label
    const dateButtonLabel = useMemo(() => {
        if (startDate && endDate) return `${startDate} to ${endDate}`;
        if (startDate) return `From ${startDate}`;
        if (endDate) return `Up to ${endDate}`;
        return "Date Range";
    }, [startDate, endDate]);

    // Filter by RBAC, SC selection, and Search term
    const filteredRows = useMemo(() => {
        return activeRecords.filter((row) => {
            // 1. RBAC non-admin filter
            if (!isAdmin()) {
                const allowed = getUsernamesToFilter();
                if (!matchesPersonName(row.scName, allowed)) return false;
            }

            // 2. Admin selected SC filter
            if (selectedSc !== "all") {
                if (normalizeName(row.scName) !== normalizeName(selectedSc) && !matchesPersonName(row.scName, [selectedSc])) {
                    return false;
                }
            }

            // 3. Search term filter
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const num = String(row.number || "").toLowerCase();
                const comp = String(row.companyName || "").toLowerCase();
                const qNum = String(row.quotationNumber || "").toLowerCase();
                const sc = String(row.scName || "").toLowerCase();
                const reason = String(row.lostReason || "").toLowerCase();
                if (!num.includes(term) && !comp.includes(term) && !qNum.includes(term) && !sc.includes(term) && !reason.includes(term)) {
                    return false;
                }
            }

            return true;
        });
    }, [activeRecords, selectedSc, searchTerm, isAdmin, getUsernamesToFilter]);

    // KPI Metrics calculation
    const totalLostCount = filteredRows.length;
    const totalLostValueWithoutTax = useMemo(() => {
        return filteredRows.reduce((sum, r) => sum + parseMoney(r.quotationValueWithoutTax), 0);
    }, [filteredRows]);
    const totalLostValueWithTax = useMemo(() => {
        return filteredRows.reduce((sum, r) => sum + parseMoney(r.quotationValueWithTax), 0);
    }, [filteredRows]);
    const totalQuotationsSent = useMemo(() => {
        return filteredRows.filter((r) => r.quotationNumber).length;
    }, [filteredRows]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const paginatedRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredRows.slice(start, start + pageSize);
    }, [filteredRows, currentPage, pageSize]);

    // Excel Export
    const handleExport = () => {
        if (filteredRows.length === 0) return;

        const sheetRows = filteredRows.map((r) => ({
            "SC Name": r.scName || "",
            [source === "lead" ? "Lead Number" : "Enquiry Number"]: r.number || "",
            "Company Name": r.companyName || "",
            "Quotation Number": r.quotationNumber || "",
            "Quotation Value (Without Tax)": r.quotationValueWithoutTax != null ? parseMoney(r.quotationValueWithoutTax) : "",
            "Quotation Value (With Tax)": r.quotationValueWithTax != null ? parseMoney(r.quotationValueWithTax) : "",
            "Quotation Copy URL": r.quotationUpload || "",
            "Lost Reason": r.lostReason || "",
            "Date": r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "",
        }));

        const ws = XLSX.utils.json_to_sheet(sheetRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Lost Details");
        const safeSc = selectedSc === "all" ? "All_SC" : selectedSc.replace(/[^a-z0-9]+/gi, "_");
        const dateStr = new Date().toISOString().split("T")[0];
        XLSX.writeFile(wb, `Lost_Details_${source === "lead" ? "Leads" : "Enquiries"}_${safeSc}_${dateStr}.xlsx`);
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Unified Inline Filter & Action Bar: All filters and icons inline */}
            <div className="bg-card p-3 rounded-lg border shadow-xs flex flex-wrap items-center gap-2.5">
                {/* Source Toggle */}
                <div className="inline-flex rounded-md border bg-card p-0.5 shadow-2xs">
                    <button
                        type="button"
                        onClick={() => setSource("lead")}
                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                            source === "lead"
                                ? "bg-primary text-primary-foreground shadow-2xs"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Leads ({records?.leads?.length || 0})
                    </button>
                    <button
                        type="button"
                        onClick={() => setSource("enquiry")}
                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                            source === "enquiry"
                                ? "bg-primary text-primary-foreground shadow-2xs"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Enquiries ({expectedTotal && expectedTotal > (records?.enquiries?.length || 0) ? `${records?.enquiries?.length || 0} / ${expectedTotal}` : (records?.enquiries?.length || 0)})
                    </button>
                </div>

                {isLoadingMore && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-secondary text-[11px] font-medium text-muted-foreground animate-pulse">
                        <Spinner className="h-3 w-3" />
                        <span>Loading {records?.enquiries?.length || 0}{expectedTotal ? ` of ${expectedTotal}` : ""} records...</span>
                    </span>
                )}

                {/* Single Date Dialog Button */}
                <button
                    type="button"
                    onClick={() => setShowDateModal(true)}
                    className={`h-9 px-3 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                        startDate || endDate
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-input bg-card text-foreground hover:bg-accent"
                    }`}
                    title="Filter by date range"
                >
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{dateButtonLabel}</span>
                </button>

                {/* Single Reset Icon Button */}
                <button
                    type="button"
                    onClick={handleResetAll}
                    disabled={!startDate && !endDate && selectedSc === "all" && !searchTerm}
                    className="h-9 w-9 rounded-md border border-input bg-card text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors shadow-2xs"
                    title="Reset all filters"
                    aria-label="Reset all filters"
                >
                    <RotateCcw className="h-4 w-4" />
                </button>

                {/* SC Filter Dropdown (Dynamic: only shows SCs with lost records in active source) */}
                {isAdmin() ? (
                    <select
                        value={selectedSc}
                        onChange={(e) => setSelectedSc(e.target.value)}
                        className="h-9 rounded-md border border-input bg-card px-3 text-xs font-medium focus:border-primary focus:outline-none max-w-[210px]"
                        aria-label="Filter by Sales Coordinator"
                    >
                        <option value="all">All Sales Coordinators ({availableScNames.length})</option>
                        {availableScNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                ) : (
                    <span className="px-3 py-1.5 rounded-md bg-card text-xs font-medium text-foreground border border-input">
                        SC: {getUsernamesToFilter().join(", ")}
                    </span>
                )}

                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search company, number, quotation..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-9 pl-8 pr-3 w-full rounded-md border border-input bg-card text-xs focus:border-primary focus:outline-none"
                    />
                </div>

                {/* Export Button inline right */}
                <div className="ml-auto">
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={isLoading || filteredRows.length === 0}
                        className="h-9 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        title="Export filtered records to Excel"
                    >
                        <Download className="h-4 w-4" />
                        <span>Export to Excel</span>
                    </button>
                </div>
            </div>

            {/* Date Range Modal Dialog */}
            {showDateModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs"
                    onClick={() => setShowDateModal(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="date-range-dialog-title"
                    >
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-primary" />
                                <h3 id="date-range-dialog-title" className="text-sm font-semibold text-foreground">Filter by Date Range</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDateModal(false)}
                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                title="Close"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={tempStart}
                                    onChange={(e) => setTempStart(e.target.value)}
                                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs focus:border-primary focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">End Date</label>
                                <input
                                    type="date"
                                    value={tempEnd}
                                    onChange={(e) => setTempEnd(e.target.value)}
                                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs focus:border-primary focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between border-t pt-3 mt-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setTempStart("");
                                    setTempEnd("");
                                    onReset();
                                    setShowDateModal(false);
                                }}
                                className="h-8 px-3 rounded-md border border-input bg-card text-xs font-medium text-foreground hover:bg-accent"
                            >
                                All-time
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowDateModal(false)}
                                    className="h-8 px-3 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onStartDateChange(tempStart);
                                        onEndDateChange(tempEnd);
                                        setShowDateModal(false);
                                    }}
                                    className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                <div className="bg-card rounded-lg border p-4 shadow-xs">
                    <p className="text-xs font-medium text-muted-foreground">Total Lost {source === "lead" ? "Leads" : "Enquiries"}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                        {totalLostCount}
                        {isLoadingMore && source === "enquiry" && expectedTotal && expectedTotal > totalLostCount && (
                            <span className="text-xs font-normal text-muted-foreground ml-1.5">
                                of {expectedTotal}
                            </span>
                        )}
                    </p>
                </div>
                <div className="bg-card rounded-lg border p-4 shadow-xs">
                    <p className="text-xs font-medium text-muted-foreground">Total Quotation Value (Without Tax)</p>
                    <p className="text-2xl font-bold text-destructive mt-1">{formatCurrency(totalLostValueWithoutTax)}</p>
                </div>
                <div className="bg-card rounded-lg border p-4 shadow-xs">
                    <p className="text-xs font-medium text-muted-foreground">Total Quotation Value (With Tax)</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalLostValueWithTax)}</p>
                </div>
                <div className="bg-card rounded-lg border p-4 shadow-xs">
                    <p className="text-xs font-medium text-muted-foreground">Quotations Generated</p>
                    <p className="text-2xl font-bold text-primary mt-1">{totalQuotationsSent}</p>
                </div>
            </div>

            {/* Table Area */}
            <div className="bg-card rounded-lg border overflow-hidden">
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Lost details table, scrollable">
                    <table className="min-w-full divide-y">
                        <thead className="bg-secondary">
                            <tr>
                                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-brand-800">SC Name</th>
                                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-brand-800">{source === "lead" ? "Lead No" : "Enquiry No"}</th>
                                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-brand-800 min-w-[180px]">Company Name</th>
                                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-brand-800">Quotation No</th>
                                <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-brand-800">Quotation Value (Without Tax)</th>
                                <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-brand-800">Quotation Value (With Tax)</th>
                                <th scope="col" className="px-4 py-2.5 text-center text-xs font-semibold text-brand-800">Quotation Copy</th>
                                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-brand-800 min-w-[220px]">Lost Reason</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y bg-card">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="8" className="px-4 py-12 text-center text-sm text-primary">
                                        <span className="inline-flex items-center gap-2">
                                            <Spinner className="h-4 w-4" /> Loading lost records...
                                        </span>
                                    </td>
                                </tr>
                            ) : paginatedRows.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-4 py-10 text-center text-sm text-muted-foreground">
                                        No lost {source === "lead" ? "leads" : "enquiries"} found matching current filters.
                                    </td>
                                </tr>
                            ) : (
                                paginatedRows.map((row) => (
                                    <tr key={row.id} className="hover:bg-secondary/60 transition-colors">
                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium text-foreground">
                                            {row.scName || "--"}
                                        </td>
                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm font-semibold text-primary">
                                            {row.number || "--"}
                                        </td>
                                        <td className="px-4 py-2.5 text-sm text-foreground min-w-[180px] max-w-xs whitespace-normal break-words leading-relaxed" title={row.companyName || ""}>
                                            {row.companyName || "--"}
                                        </td>
                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm font-mono text-foreground">
                                            {row.quotationNumber || "--"}
                                        </td>
                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-foreground">
                                            {row.quotationValueWithoutTax != null ? formatCurrency(parseMoney(row.quotationValueWithoutTax)) : "--"}
                                        </td>
                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-foreground">
                                            {row.quotationValueWithTax != null ? formatCurrency(parseMoney(row.quotationValueWithTax)) : "--"}
                                        </td>
                                        <td className="px-4 py-2.5 whitespace-nowrap text-center text-sm">
                                            {row.quotationUpload ? (
                                                <a
                                                    href={row.quotationUpload}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                                    title="Open Quotation PDF"
                                                >
                                                    <FileText className="h-3.5 w-3.5" />
                                                    <span>View PDF</span>
                                                </a>
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic">No PDF</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-foreground min-w-[220px] max-w-sm whitespace-normal break-words leading-relaxed" title={row.lostReason || ""}>
                                            {row.lostReason || "--"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                {filteredRows.length > pageSize && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-card text-xs text-muted-foreground">
                        <div>
                            Showing <span className="font-medium text-foreground">{(currentPage - 1) * pageSize + 1}</span> to{" "}
                            <span className="font-medium text-foreground">{Math.min(currentPage * pageSize, filteredRows.length)}</span> of{" "}
                            <span className="font-medium text-foreground">{filteredRows.length}</span> records
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="h-8 px-2.5 rounded border border-input bg-card hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1 font-medium"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" /> Prev
                            </button>
                            <span className="px-2 font-medium">Page {currentPage} of {totalPages}</span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="h-8 px-2.5 rounded border border-input bg-card hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1 font-medium"
                            >
                                Next <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Report() {
    const { isAdmin, getUsernamesToFilter } = useContext(AuthContext);
    const navigate = useNavigate();
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

    const [fosTableData, setFosTableData] = useState(null);
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

    const [fosFilters, setFosFilters] = useState({
        receiverName: "all",
        startDate: "",
        endDate: "",
    });

    // Lost Details tab -- All-in-One records, filters and error state
    const [lostDetailsRecords, setLostDetailsRecords] = useState({ leads: null, enquiries: null });
    const [expectedTotalEnquiries, setExpectedTotalEnquiries] = useState(null);
    const [lostSummaryError, setLostSummaryError] = useState(null);
    const [lostSummaryFilters, setLostSummaryFilters] = useState({ startDate: "", endDate: "" });
    const [lostSource, setLostSource] = useState("lead");
    const [isLoadingMoreLost, setIsLoadingMoreLost] = useState(false);
    const lostSummaryRequestIdRef = useRef(0);

    const [isLoading, setIsLoading] = useState(true);

    // Each of the 3 tabs' fetches is async and slow enough (paginated,
    // 1000+ row tables) that changing the date filter while a previous
    // fetch for the same tab is still in flight is common, not an edge
    // case. Without a guard, whichever fetch happens to RESOLVE last wins
    // and overwrites state -- even if it was kicked off with the OLDER
    // filter values -- which looks exactly like "the date filter doesn't
    // work" (the picker changes, but the table snaps back to/stays on the
    // previous range). Each fetch captures its own requestId at the start
    // and only commits state if it's still the most recent call for that
    // tab by the time its awaits resolve; a superseded (stale) call's
    // result is silently discarded instead of applied.
    const callingRequestIdRef = useRef(0);
    const fosRequestIdRef = useRef(0);
    const scPipelineRequestIdRef = useRef(0);

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
            // Leads are attributed by their own lead_receiver_name (same
            // field the Calling Data tab already uses) -- NOT
            // enquiry_assign_to_person via lto_call_tracker_for_leads, which
            // is only ever set on a lead once a call has been logged for it
            // (9 of 1188 leads in practice). Classification here must key
            // off the SAME field the actual metrics are computed from (see
            // fetchScPipelineMetrics below), or a person's CRR/NBD_CRR vs
            // NBD-only tier could disagree with what their column shows.
            const [{ data: masterData, error: masterErr }, { data: leadsData, error: leadsErr }, { data: enqData, error: enqErr }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_dropdown").select("value").eq("category", REPORT_PERSON_CATEGORY.SC_PIPELINE)),
                fetchAllRows(() => supabase.from("lto_leads").select("sales_type, lead_receiver_name")),
                fetchAllRows(() => supabase.from("lto_enquiries").select("enquiry_assign_to_person, sales_type")),
            ]);
            if (masterErr) throw masterErr;
            if (leadsErr) throw leadsErr;
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

            (leadsData || []).forEach(l => classify(l.lead_receiver_name, l.sales_type));
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

    // Monday 00:00 of the current week -> now. "Always started from Monday"
    // per the spec -- this tab has no date picker, it's always this week.
    const getMondayStart = () => {
        const now = new Date();
        const day = now.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
        const diffToMonday = day === 0 ? 6 : day - 1;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
    };

    const parseMoney = (v) => {
        const value = parseFloat(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        return isNaN(value) ? 0 : value;
    };

    const fetchCallingDataReport = useCallback(async () => {
        if (activeTab !== "calling") return;
        const requestId = ++callingRequestIdRef.current;
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
            const allowedNames = isAdmin() ? null : (getUsernamesToFilter() || []);
            const visiblePersons = isAdmin()
                ? callingPersons
                : callingPersons.filter(name => matchesPersonName(name, allowedNames));

            if (visiblePersons.length === 0) {
                if (requestId === callingRequestIdRef.current) {
                    setLeadsReportRows([]);
                    setEnquiriesReportRows([]);
                }
                return;
            }

            // ---- Base tables (unbounded -- a quotation created this week can
            // reference a lead/enquiry created any time in the past, so the
            // lead_no/enquiry_no -> Person lookup needs the full table).
            // Attribution: a lead's own lead_receiver_name; an enquiry's own
            // enquiry_assign_to_person -- not any
            // call-tracker or "assign to person" field.
            const [{ data: allLeads }, { data: allEnquiries }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_leads").select("id, lead_no, lead_receiver_name, created_at")),
                fetchAllRows(() => supabase.from("lto_enquiries").select("id, enquiry_no, enquiry_assign_to_person, enquiry_approach, created_at")),
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
                    .select("lead_id, created_at, enquiry_approach, what_did_customer_say, enquiry_received_status")
                    .gte("created_at", rangeStartISO)
                    .lte("created_at", rangeEndISO)
            );

            // ---- Order conversions in-range (any lead/enquiry, regardless
            // of its own creation date -- "their updation has been done
            // within this week/range") ----
            const [{ data: weekLeadOrders }, { data: weekEnquiryOrders }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_enquiry_tracker_for_leads")
                    .select("lead_id, created_at, quotation_number")
                    .gte("created_at", rangeStartISO)
                    .lte("created_at", rangeEndISO)
                    .eq("is_order_received_status", "yes")),
                fetchAllRows(() => supabase.from("lto_enquiry_tracker")
                    .select("enquiry_id, created_at, quotation_number")
                    .gte("created_at", rangeStartISO)
                    .lte("created_at", rangeEndISO)
                    .eq("is_order_received_status", "yes")),
            ]);

            // ---- Total Quotations / Quotation Amount source: Enquiry Tracker
            // rows at current_stage = make-quotation created in range (leads:
            // lto_enquiry_tracker_for_leads, enquiries: lto_enquiry_tracker).
            // Per lead/enquiry, each quotation family (root + its revisions)
            // counts once, via its highest revision in the range; the amount
            // is that row's quotation_value_without_tax.
            const fetchMakeQuotationRows = (table, idCol) => fetchAllRows(() =>
                supabase.from(table)
                    .select(`${idCol}, quotation_number, quotation_value_without_tax, created_at`)
                    .eq("current_stage", "make-quotation")
                    .gte("created_at", rangeStartISO)
                    .lte("created_at", rangeEndISO)
            );
            const [{ data: weekLeadQuotationRows }, { data: weekEnquiryQuotationRows }] = await Promise.all([
                fetchMakeQuotationRows("lto_enquiry_tracker_for_leads", "lead_id"),
                fetchMakeQuotationRows("lto_enquiry_tracker", "enquiry_id"),
            ]);
            const leadQuotationFamilies = latestQuotationPerFamily(weekLeadQuotationRows, "lead_id");
            const enquiryQuotationFamilies = latestQuotationPerFamily(weekEnquiryQuotationRows, "enquiry_id");

            // Converted Order Value: value of the exact quotation revision the
            // order was placed on (see fetchOrderQuotationValues).
            const [leadOrderValueByQuotationNo, enquiryOrderValueByQuotationNo] = await Promise.all([
                fetchOrderQuotationValues("lto_enquiry_tracker_for_leads", weekLeadOrders),
                fetchOrderQuotationValues("lto_enquiry_tracker", weekEnquiryOrders),
            ]);

            // A newer call for this tab (e.g. the date filter was changed
            // again while all the fetches above were still in flight) has
            // since started -- discard this now-stale result rather than
            // overwriting whatever that newer call ends up committing.
            if (requestId !== callingRequestIdRef.current) return;

            const enquiryById = new Map();
            (allEnquiries || []).forEach(e => enquiryById.set(e.id, e));

            // ==================== LEADS SECTION ====================
            const leadStats = {};
            visiblePersons.forEach(name => {
                leadStats[name] = {
                    name, totalLeads: 0, calls: 0, convertedToEnquiry: 0,
                    quotations: 0, quotationAmount: 0, orderConverted: 0, orderValue: 0, incoming: 0, outgoing: 0,
                };
            });

            // Calls: logs created in range, excluding failed-contact outcomes.
            // Several logs of one lead on the same calendar date count once
            // ("unique"). Credited to the lead's own lead_receiver_name.
            const EXCLUDED_CALL_OUTCOMES = new Set(["call attempt failed", "not connected", "switched off"]);
            const callDayKey = (dateStr) => new Date(dateStr).toLocaleDateString("en-CA");
            const callUnits = new Set();          // lead_id|date
            const callApproachUnits = new Set();  // lead_id|date|approach
            (weekCalls || []).forEach(c => {
                if (!c.lead_id) return;
                if (EXCLUDED_CALL_OUTCOMES.has(String(c.what_did_customer_say || "").trim().toLowerCase())) return;
                const person = leadById.get(c.lead_id)?.lead_receiver_name;
                if (!person || !leadStats[person]) return;
                const unit = `${c.lead_id}|${callDayKey(c.created_at)}`;
                if (!callUnits.has(unit)) { callUnits.add(unit); leadStats[person].calls++; }
                const approach = String(c.enquiry_approach || "").trim().toUpperCase();
                if (approach === "INCOMING" || approach === "OUTGOING") {
                    const approachUnit = `${unit}|${approach}`;
                    if (!callApproachUnits.has(approachUnit)) {
                        callApproachUnits.add(approachUnit);
                        if (approach === "INCOMING") leadStats[person].incoming++; else leadStats[person].outgoing++;
                    }
                }
            });

            // Total Leads: all-time, no date filter.
            (allLeads || []).forEach(lead => {
                const person = lead.lead_receiver_name;
                if (!person || !leadStats[person]) return;
                leadStats[person].totalLeads++;
            });

            // Converted to Enquiries: distinct leads that had a call log
            // with enquiry_received_status = yes created in the selected
            // range (the outcome-exclusion list above does NOT apply here).
            const convertedLeadIds = new Set();
            (weekCalls || []).forEach(c => {
                if (!c.lead_id || convertedLeadIds.has(c.lead_id)) return;
                if (String(c.enquiry_received_status || "").trim().toLowerCase() !== "yes") return;
                const person = leadById.get(c.lead_id)?.lead_receiver_name;
                if (!person || !leadStats[person]) return;
                convertedLeadIds.add(c.lead_id);
                leadStats[person].convertedToEnquiry++;
            });

            // Order Converted: any lead (any creation date) whose order was
            // marked received this week, credited to that lead's lead_receiver_name.
            const orderedLeadIds = new Set();
            (weekLeadOrders || []).forEach(row => {
                if (!row.lead_id || orderedLeadIds.has(row.lead_id)) return;
                orderedLeadIds.add(row.lead_id);
                const person = leadById.get(row.lead_id)?.lead_receiver_name;
                if (person && leadStats[person]) {
                    leadStats[person].orderConverted++;
                    leadStats[person].orderValue += leadOrderValueByQuotationNo.get(String(row.quotation_number || "").trim()) || 0;
                }
            });

            // Quotations: one per quotation family (latest revision) at the
            // make-quotation stage in range, credited to the lead's
            // lead_receiver_name; amount = quotation_value_without_tax.
            leadQuotationFamilies.forEach(q => {
                const person = leadById.get(q.lead_id)?.lead_receiver_name;
                if (person && leadStats[person]) {
                    leadStats[person].quotations++;
                    leadStats[person].quotationAmount += parseMoney(q.quotation_value_without_tax);
                }
            });

            setLeadsReportRows(visiblePersons.map(name => leadStats[name]));

            // ==================== ENQUIRIES SECTION ====================
            const enquiryStats = {};
            visiblePersons.forEach(name => {
                enquiryStats[name] = {
                    name, totalEnquiries: 0, quotations: 0, quotationAmount: 0,
                    orderConverted: 0, orderValue: 0, incoming: 0, outgoing: 0,
                };
            });

            // Total Enquiries: all-time, no date filter. Incoming/Outgoing
            // use enquiry_approach of enquiries created in the range.
            (allEnquiries || []).forEach(e => {
                const person = e.enquiry_assign_to_person;
                if (!person || !enquiryStats[person]) return;
                enquiryStats[person].totalEnquiries++;
                if (!inThisWeek(e.created_at)) return;
                const approach = String(e.enquiry_approach || "").trim().toUpperCase();
                if (approach === "INCOMING") enquiryStats[person].incoming++;
                if (approach === "OUTGOING") enquiryStats[person].outgoing++;
            });

            const orderedEnquiryIds = new Set();
            (weekEnquiryOrders || []).forEach(row => {
                if (!row.enquiry_id || orderedEnquiryIds.has(row.enquiry_id)) return;
                orderedEnquiryIds.add(row.enquiry_id);
                const e = enquiryById.get(row.enquiry_id);
                const person = e?.enquiry_assign_to_person;
                if (person && enquiryStats[person]) {
                    enquiryStats[person].orderConverted++;
                    enquiryStats[person].orderValue += enquiryOrderValueByQuotationNo.get(String(row.quotation_number || "").trim()) || 0;
                }
            });

            // Quotations: same family rule as Leads, credited to the
            // enquiry's enquiry_assign_to_person.
            enquiryQuotationFamilies.forEach(q => {
                const person = enquiryById.get(q.enquiry_id)?.enquiry_assign_to_person;
                if (person && enquiryStats[person]) {
                    enquiryStats[person].quotations++;
                    enquiryStats[person].quotationAmount += parseMoney(q.quotation_value_without_tax);
                }
            });

            setEnquiriesReportRows(visiblePersons.map(name => enquiryStats[name]));

        } catch (error) {
            console.error("Error fetching calling data report:", error);
        } finally {
            if (requestId === callingRequestIdRef.current) setIsLoading(false);
        }
    }, [activeTab, isAdmin, getUsernamesToFilter, callingPersons, callingFilters]);

    // FOS Report -- one row per sales person who has at least one
    // field_sales_form visit in the selected range (so the Person rows and the
    // Receiver dropdown are always exactly the people with data in view).
    // Default range is last Monday through today; a Start/End date filter
    // replaces it and applies to every metric, visits included.
    const fetchFosMetrics = useCallback(async () => {
        if (activeTab !== "fos") return;
        const requestId = ++fosRequestIdRef.current;
        setIsLoading(true);
        setFosError(null);
        setFosVisitError(null);
        try {
            const now = new Date();
            const rangeStart = fosFilters.startDate ? new Date(`${fosFilters.startDate}T00:00:00`) : getMondayStart();
            const rangeEnd = fosFilters.endDate ? new Date(getEndDateWithTime(fosFilters.endDate)) : now;
            const rangeStartISO = rangeStart.toISOString();
            const rangeEndISO = rangeEnd.toISOString();
            const inRange = (d) => {
                const dt = new Date(d);
                return !isNaN(dt.getTime()) && dt >= rangeStart && dt <= rangeEnd;
            };
            const inRangeTracker = (query) => query.gte("created_at", rangeStartISO).lte("created_at", rangeEndISO);

            const [
                visitRes,
                { data: allEnquiries, error: enqErr },
                { data: makeQuotationRows, error: mqErr },
                { data: orderRows, error: ordErr },
                { data: openRows, error: openErr },
            ] = await Promise.all([
                // Visits: field_sales_form has RLS with no anon SELECT, so
                // counts come from a SECURITY DEFINER RPC (see
                // Database/11_fos_visit_counts_rpc.sql).
                supabase.rpc("fos_visit_counts", { p_start: rangeStartISO, p_end: rangeEndISO }),
                fetchAllRows(() => supabase.from("lto_enquiries").select("id, enquiry_receiver_name, created_at")),
                // Quotations created (make-quotation stage) in range.
                fetchAllRows(() => inRangeTracker(supabase.from("lto_enquiry_tracker")
                    .select("enquiry_id, quotation_number, quotation_value_without_tax, created_at")
                    .eq("current_stage", "make-quotation"))),
                // Orders marked received in range.
                fetchAllRows(() => inRangeTracker(supabase.from("lto_enquiry_tracker")
                    .select("enquiry_id, created_at, quotation_number")
                    .eq("is_order_received_status", "yes"))),
                // Pipeline candidates: tracker rows in range with no order status yet.
                fetchAllRows(() => inRangeTracker(supabase.from("lto_enquiry_tracker")
                    .select("enquiry_id")
                    .is("is_order_received_status", null))),
            ]);
            if (enqErr) throw enqErr;
            if (mqErr) throw mqErr;
            if (ordErr) throw ordErr;
            if (openErr) throw openErr;

            // ---- Person rows: sales_person_name values with a visit in range ----
            const visitRows = visitRes.error ? [] : (visitRes.data || []);
            if (visitRes.error) {
                console.error("FOS visit-count RPC error:", visitRes.error);
                if (requestId === fosRequestIdRef.current) {
                    setFosVisitError(visitRes.error.message || "Failed to load visit counts.");
                }
            }
            const stats = new Map();
            visitRows.forEach(v => {
                const name = normalizeName(v.person_name);
                if (!name) return;
                if (!stats.has(name)) {
                    stats.set(name, {
                        name,
                        newF2FVisits: 0, existingF2FVisits: 0, mdoF2FVisits: 0,
                        enquiries: 0, quotationValue: 0, ordersConverted: 0, orderConvertedValue: 0,
                        avgTicket: 0, pipelineCount: 0, pipelineValue: 0,
                    });
                }
                const bucket = normalizeVisitType(v.visit_type);
                if (bucket) stats.get(name)[bucket] += Number(v.visit_count) || 0;
            });
            const personNames = [...stats.keys()];

            // Enquiry receiver name -> visit person (exact normalized match,
            // else the same loose first-name/full-name match used elsewhere).
            const personCache = new Map();
            const resolvePerson = (receiver) => {
                const key = normalizeName(receiver);
                if (!key) return null;
                if (personCache.has(key)) return personCache.get(key);
                const match = stats.has(key) ? key : (personNames.find(p => matchesPersonName(receiver, [p])) || null);
                personCache.set(key, match);
                return match;
            };
            const receiverByEnquiryId = new Map();
            (allEnquiries || []).forEach(e => receiverByEnquiryId.set(e.id, e.enquiry_receiver_name));
            const personOfEnquiry = (enquiryId) => resolvePerson(receiverByEnquiryId.get(enquiryId));

            // Total Enquiries: enquiries created in range, by receiver name.
            (allEnquiries || []).forEach(e => {
                if (!inRange(e.created_at)) return;
                const person = resolvePerson(e.enquiry_receiver_name);
                if (person) stats.get(person).enquiries++;
            });

            // Total Quotation Value: one quotation per family (latest
            // revision) made in range -- same rule as the Calling Data tab.
            latestQuotationPerFamily(makeQuotationRows, "enquiry_id").forEach(q => {
                const person = personOfEnquiry(q.enquiry_id);
                if (person) stats.get(person).quotationValue += parseMoney(q.quotation_value_without_tax);
            });

            // Order Converted + Converted Order Value: orders received in
            // range, one per enquiry, valued at the exact revision ordered.
            const orderValueByQuotationNo = await fetchOrderQuotationValues("lto_enquiry_tracker", orderRows);
            const orderedEnquiryIds = new Set();
            (orderRows || []).forEach(row => {
                if (!row.enquiry_id || orderedEnquiryIds.has(row.enquiry_id)) return;
                orderedEnquiryIds.add(row.enquiry_id);
                const person = personOfEnquiry(row.enquiry_id);
                if (!person) return;
                stats.get(person).ordersConverted++;
                stats.get(person).orderConvertedValue += orderValueByQuotationNo.get(String(row.quotation_number || "").trim()) || 0;
            });

            // Pipeline: enquiries with a tracker row in range that has no
            // order status, and that never reached yes/no/hold on ANY tracker
            // row (so an enquiry that has since converted, been lost or been
            // put on hold drops out). Pipeline Value = their make-quotation values (latest
            // revision per quotation family).
            const candidateIds = [...new Set((openRows || []).map(r => r.enquiry_id).filter(Boolean))];
            const pipelineQuotationRows = [];
            for (let i = 0; i < candidateIds.length; i += 100) {
                const idChunk = candidateIds.slice(i, i + 100);
                const { data: rows, error: rowsErr } = await fetchAllRows(() =>
                    supabase.from("lto_enquiry_tracker")
                        .select("enquiry_id, current_stage, quotation_number, quotation_value_without_tax, is_order_received_status")
                        .in("enquiry_id", idChunk)
                );
                if (rowsErr) throw rowsErr;
                const resolved = new Set();
                (rows || []).forEach(r => {
                    const status = String(r.is_order_received_status || "").trim().toLowerCase();
                    if (status === "yes" || status === "no" || status === "hold") resolved.add(r.enquiry_id);
                });
                idChunk.forEach(id => {
                    if (resolved.has(id)) return;
                    const person = personOfEnquiry(id);
                    if (person) stats.get(person).pipelineCount++;
                });
                (rows || []).forEach(r => {
                    if (!resolved.has(r.enquiry_id) && r.current_stage === "make-quotation") pipelineQuotationRows.push(r);
                });
            }
            latestQuotationPerFamily(pipelineQuotationRows, "enquiry_id").forEach(q => {
                const person = personOfEnquiry(q.enquiry_id);
                if (person) stats.get(person).pipelineValue += parseMoney(q.quotation_value_without_tax);
            });

            const rows = [...stats.values()]
                .map(r => ({ ...r, avgTicket: r.ordersConverted > 0 ? r.orderConvertedValue / r.ordersConverted : 0 }))
                .sort((a, b) => a.name.localeCompare(b.name));

            // A newer call for this tab has since started (e.g. the date
            // filter changed again while this one was still fetching) --
            // discard this now-stale result rather than overwriting
            // whatever that newer call ends up committing.
            if (requestId !== fosRequestIdRef.current) return;
            setFosTableData(rows);
        } catch (err) {
            console.error("FOS fetch error:", err);
            if (requestId === fosRequestIdRef.current) {
                setFosError(err?.message || "Failed to load FOS report data.");
                setFosTableData([]);
            }
        } finally {
            if (requestId === fosRequestIdRef.current) setIsLoading(false);
        }
    }, [fosFilters.startDate, fosFilters.endDate, activeTab]);

    // The Receiver dropdown only lists people present in the current rows, so
    // drop a stale selection (e.g. after the date range changed) back to "all".
    useEffect(() => {
        if (fosFilters.receiverName !== "all" && fosTableData && !fosTableData.some(r => r.name === fosFilters.receiverName)) {
            setFosFilters(prev => ({ ...prev, receiverName: "all" }));
        }
    }, [fosTableData, fosFilters.receiverName]);

    const normalizeCategory = (rawSalesType) => {
        const s = String(rawSalesType || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
        if (s === "NBD_CRR") return "NBD_CRR";
        if (s === "CRR") return "CRR";
        if (s === "NBD") return "NBD";
        return null;
    };
    const fetchScPipelineMetrics = useCallback(async () => {
        if (activeTab !== "sc_pipeline") return;
        const requestId = ++scPipelineRequestIdRef.current;
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
            // Leads are attributed by their own lead_receiver_name (same
            // field the Calling Data tab uses, and fetchScPipelinePersons'
            // classification above) -- NOT enquiry_assign_to_person via
            // lto_call_tracker_for_leads, which is only set once a call has
            // been logged for a lead (9 of 1188 leads in practice) and was
            // the reason this section used to come out all zero.
            const [{ data: allLeads }, { data: allLeadTrackers }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_leads").select("id, sales_type, created_at, lead_receiver_name")
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
            const leadRecordsWithPerson = (allLeads || []).map(l => ({ ...l, _assignedPerson: l.lead_receiver_name || null }));
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

            // A newer call for this tab has since started (e.g. the date
            // filter changed again while this one was still fetching) --
            // discard this now-stale result rather than overwriting
            // whatever that newer call ends up committing.
            if (requestId !== scPipelineRequestIdRef.current) return;

            setScPipelineData({ leads: leadsSection, enquiries: enquiriesSection });

        } catch (error) {
            console.error("Error fetching SC Pipeline metrics:", error);
            if (requestId === scPipelineRequestIdRef.current) setScPipelineError(error?.message || "Failed to load SC Pipeline data.");
        } finally {
            if (requestId === scPipelineRequestIdRef.current) setIsLoading(false);
        }
    }, [activeTab, scPipelineFilters, scPipelinePersons]);

    // Lost Details tab -- one row per curated SC (same master list as SC
    // Pipeline: scPipelinePersons.multi + nbdOnly combined, since this tab
    // doesn't need the CRR/NBD tier split, just "every curated SC"). Total
    // count is EVERY lead/enquiry ever assigned to that SC, regardless of
    // status; Lost count/value are the same set filtered to
    // enquiry_status === "not-interested".
    const fetchLostSummary = useCallback(async () => {
        if (activeTab !== "lost_details") return;
        const requestId = ++lostSummaryRequestIdRef.current;
        setIsLoading(true);
        setIsLoadingMoreLost(true);
        setLostSummaryError(null);
        try {
            const startDateISO = lostSummaryFilters.startDate ? `${lostSummaryFilters.startDate}T00:00:00` : undefined;
            const endDateISO = lostSummaryFilters.endDate ? getEndDateWithTime(lostSummaryFilters.endDate) : undefined;

            // Fetch Leads in parallel
            const leadPromise = fetchLostDetails({
                source: "lead",
                startDateISO,
                endDateISO,
            }).then((leadRows) => {
                if (requestId !== lostSummaryRequestIdRef.current) return;
                const lostLeads = (leadRows || []).filter((r) => isLostStatus(r.orderReceivedStatus));
                lostLeads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                setLostDetailsRecords((prev) => ({ ...prev, leads: lostLeads }));
                if (lostSource === "lead") {
                    setIsLoading(false);
                }
            });

            // Fetch Enquiries progressively in parts
            const enquiryPromise = fetchLostDetails({
                source: "enquiry",
                startDateISO,
                endDateISO,
                onProgress: (partialRows, meta) => {
                    if (requestId !== lostSummaryRequestIdRef.current) return;
                    const lostEnquiries = (partialRows || []).filter((r) => isLostStatus(r.orderReceivedStatus));
                    lostEnquiries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    setLostDetailsRecords((prev) => ({ ...prev, enquiries: lostEnquiries }));
                    if (meta?.totalCount) {
                        setExpectedTotalEnquiries(meta.totalCount);
                    }
                    // Unblock page loading as soon as the first part arrives so Page 1 renders immediately!
                    setIsLoading(false);
                },
            }).then((finalRows) => {
                if (requestId !== lostSummaryRequestIdRef.current) return;
                const lostEnquiries = (finalRows || []).filter((r) => isLostStatus(r.orderReceivedStatus));
                lostEnquiries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                setLostDetailsRecords((prev) => ({ ...prev, enquiries: lostEnquiries }));
                setExpectedTotalEnquiries(lostEnquiries.length);
            });

            await Promise.all([leadPromise, enquiryPromise]);
        } catch (error) {
            console.error("Error fetching Lost Details records:", error);
            if (requestId === lostSummaryRequestIdRef.current) setLostSummaryError(error?.message || "Failed to load Lost Details.");
        } finally {
            if (requestId === lostSummaryRequestIdRef.current) {
                setIsLoading(false);
                setIsLoadingMoreLost(false);
            }
        }
    }, [activeTab, lostSummaryFilters, lostSource]);


    useEffect(() => {
        fetchCallingPersons();
        fetchScPipelinePersons();
    }, [fetchCallingPersons, fetchScPipelinePersons]);


    useEffect(() => {
        if (activeTab === "calling") {
            fetchCallingDataReport();
        } else if (activeTab === "fos") {
            fetchFosMetrics();
        } else if (activeTab === "sc_pipeline") {
            fetchScPipelineMetrics();
        } else if (activeTab === "lost_details") {
            fetchLostSummary();
        }
    }, [fetchCallingDataReport, fetchFosMetrics, fetchScPipelineMetrics, fetchLostSummary, activeTab]);

    return (
        <div className="flex flex-col">
            <div className="mx-auto w-full max-w-[1600px]">
                {/* Tabs */}
                <StatusTabs
                    variant="underline"
                    label="Report views"
                    className="mb-5"
                    activeTab={activeTab}
                    onChange={setActiveTab}
                    tabs={[
                        { id: "calling", label: "Calling Data" },
                        { id: "fos", label: "FOS Report" },
                        { id: "sc_pipeline", label: "SC Pipeline" },
                        { id: "lost_details", label: "Lost Details" },
                    ]}
                />

                {/* CALLING DATA TAB CONTENT */}
                {activeTab === "calling" && (
                    <>
                        <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
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
                            <h2 className="text-base font-semibold text-foreground mb-3">Leads</h2>
                            <div className="bg-card rounded-lg border overflow-hidden">
                                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Calling data: leads, scrollable">
                                    <table className="min-w-full divide-y">
                                        <thead className="bg-secondary">
                                            <tr>
                                                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-brand-800">Person</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Total Leads</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">No. of Calls</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Converted to Enquiries</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Total Quotations</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Quotation Amount</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Order Converted</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Converted Order Value</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Incoming</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Outgoing</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {isLoading ? (
                                                <tr><td colSpan="10" className="px-4 py-8 text-center text-sm text-primary"><span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Loading...</span></td></tr>
                                            ) : leadsReportRows.length === 0 ? (
                                                <tr><td colSpan="10" className="px-4 py-6 text-center text-sm text-muted-foreground">No rows to show</td></tr>
                                            ) : (
                                                leadsReportRows.map(row => (
                                                    <tr key={row.name} className="hover:bg-secondary/60">
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium text-foreground">{row.name}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.totalLeads}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.calls}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.convertedToEnquiry}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.quotations}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.quotationAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center">
                                                            <span className={`inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded-full text-xs font-semibold ${row.orderConverted > 0 ? "bg-success/10 text-success" : "text-muted-foreground"}`}>{row.orderConverted}</span>
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.orderValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-info">{row.incoming}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-warning-foreground">{row.outgoing}</td>
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
                            <h2 className="text-base font-semibold text-foreground mb-3">Enquiries</h2>
                            <div className="bg-card rounded-lg border overflow-hidden">
                                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Calling data: enquiries, scrollable">
                                    <table className="min-w-full divide-y">
                                        <thead className="bg-secondary">
                                            <tr>
                                                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-brand-800">Person</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Total Enquiries</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Total Quotations</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Quotation Amount</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Order Converted</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Converted Order Value</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Incoming</th>
                                                <th scope="col" className="px-4 py-2 text-center text-xs font-semibold text-brand-800">Outgoing</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {isLoading ? (
                                                <tr><td colSpan="8" className="px-4 py-8 text-center text-sm text-primary"><span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Loading...</span></td></tr>
                                            ) : enquiriesReportRows.length === 0 ? (
                                                <tr><td colSpan="8" className="px-4 py-6 text-center text-sm text-muted-foreground">No rows to show</td></tr>
                                            ) : (
                                                enquiriesReportRows.map(row => (
                                                    <tr key={row.name} className="hover:bg-secondary/60">
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium text-foreground">{row.name}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.totalEnquiries}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.quotations}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.quotationAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center">
                                                            <span className={`inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded-full text-xs font-semibold ${row.orderConverted > 0 ? "bg-success/10 text-success" : "text-muted-foreground"}`}>{row.orderConverted}</span>
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-foreground">{row.orderValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-info">{row.incoming}</td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center text-warning-foreground">{row.outgoing}</td>
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
                        <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
                            {fosFilters.startDate || fosFilters.endDate
                                ? "Custom date range applies to every metric below, visits included -- one row per person with a visit in the range."
                                : "Last Monday through today applies to every metric below -- one row per person with a visit in that range."}
                            {!isAdmin() && " You're seeing only your own row."}
                            {isLoading && <Spinner className="h-3.5 w-3.5 text-primary" />}
                        </p>

                        <DateRangeFilterBar
                            startDate={fosFilters.startDate}
                            endDate={fosFilters.endDate}
                            onStartDateChange={(v) => setFosFilters(prev => ({ ...prev, startDate: v }))}
                            onEndDateChange={(v) => setFosFilters(prev => ({ ...prev, endDate: v }))}
                            onReset={() => setFosFilters(prev => ({ ...prev, startDate: "", endDate: "" }))}
                            defaultRangeLabel="Showing last Monday through today"
                        >
                            {isAdmin() && (
                                <div className="w-full md:w-1/4">
                                    <label htmlFor="fos-receiver" className="block text-xs font-medium text-muted-foreground mb-1">Receiver Name</label>
                                    <select
                                        id="fos-receiver"
                                        className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                                        value={fosFilters.receiverName}
                                        onChange={(e) => setFosFilters(prev => ({ ...prev, receiverName: e.target.value }))}
                                    >
                                        <option value="all">All Receivers</option>
                                        {(fosTableData || []).map(row => (
                                            <option key={row.name} value={row.name}>{row.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </DateRangeFilterBar>

                        {fosError && (
                            <div className="mb-5 px-4 py-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive" role="alert">
                                Couldn't load FOS report data: {fosError}
                            </div>
                        )}

                        {fosVisitError && (
                            <div className="mb-5 px-4 py-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive" role="alert">
                                Couldn't load visit counts: {fosVisitError}
                            </div>
                        )}

                        <FosMetricsTable
                            title="FOS Report"
                            rows={fosTableData}
                            visibleNames={getScFilterList(fosFilters.receiverName)}
                            isLoading={isLoading}
                        />
                    </>
                )}

                {/* SC PIPELINE TAB CONTENT */}
                {activeTab === "sc_pipeline" && (
                    <>
                        <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
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
                            <div className="mb-5 px-4 py-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive" role="alert">
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

                {/* LOST DETAILS TAB CONTENT (OPTION A: ALL-IN-ONE) */}
                {activeTab === "lost_details" && (
                    <>
                        {lostSummaryError && (
                            <div className="mb-5 px-4 py-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive" role="alert">
                                Couldn't load Lost Details: {lostSummaryError}
                            </div>
                        )}

                        <LostDetailsAllInOne
                            records={lostDetailsRecords}
                            isLoading={isLoading}
                            isLoadingMore={isLoadingMoreLost}
                            expectedTotal={expectedTotalEnquiries}
                            isAdmin={isAdmin}
                            getUsernamesToFilter={getUsernamesToFilter}
                            source={lostSource}
                            setSource={setLostSource}
                            startDate={lostSummaryFilters.startDate}
                            endDate={lostSummaryFilters.endDate}
                            onStartDateChange={(v) => setLostSummaryFilters(prev => ({ ...prev, startDate: v }))}
                            onEndDateChange={(v) => setLostSummaryFilters(prev => ({ ...prev, endDate: v }))}
                            onReset={() => setLostSummaryFilters({ startDate: "", endDate: "" })}
                        />
                    </>
                )}

            </div>
        </div>
    );
}

export default Report;
