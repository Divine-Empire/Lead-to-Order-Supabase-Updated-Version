import { useState, useEffect, useRef, useContext, useCallback, useMemo } from "react";
import { RefreshCw, Download, Loader2, ExternalLink, Eye, CalendarDays } from "lucide-react";
import { FilterSearch, filterControlClass } from "../../components/FilterBar";
import DataTable from "../../components/DataTable";
import ColumnSelector from "../../components/ColumnSelector";
import ModalView from "../../components/ModalView";
import supabase from "../../utils/supabase";
import { AuthContext } from "../../App";
import { isHttpUrl } from "../../utils/itemCatalog";
import { downloadCsvText } from "../../utils/itemSpecsCsv";

const LOG_FIELDS =
  "id, serial_code, sales_person_name, visit_datetime, city_location, visit_type, company_name, nature_of_business, f2f_meeting_photo_url, created_at";
const EXPORT_BATCH = 1000;

const COLUMNS = [
  { key: "serial_code", label: "Serial Code" },
  { key: "sales_person_name", label: "Sales Person Name" },
  { key: "visit_datetime", label: "Visit Date" },
  { key: "city_location", label: "City / Location" },
  { key: "visit_type", label: "Visit Type" },
  { key: "company_name", label: "Company Name" },
  { key: "contacts", label: "Contact Persons" },
  { key: "projects", label: "Projects" },
  { key: "nature_of_business", label: "Nature of Business" },
  { key: "photo", label: "Meeting Photo" },
];

const CONTACT_COLS = [
  { key: "contact_person_name", label: "Name" },
  { key: "designation", label: "Designation" },
  { key: "contact_person_mobile", label: "Mobile" },
];
const PROJECT_COLS = [
  { key: "project_name", label: "Project Name" },
  { key: "project_location", label: "Location" },
  { key: "nature_of_project", label: "Nature" },
  { key: "percentage_balance_work", label: "% Balance Work" },
  { key: "project_value", label: "Value" },
  { key: "remarks", label: "Remarks" },
];

// visit_datetime / created_at are timestamptz; the team works in India time.
const IST = "Asia/Kolkata";
const visitFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST, day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const formatVisitDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const p = Object.fromEntries(visitFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
};

// "YYYY-MM-DD" (as picked) -> instant at 00:00 India time of that day.
const istDayStartISO = (ymd) => new Date(`${ymd}T00:00:00+05:30`).toISOString();
const nextDay = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};
const shortDay = (ymd) => {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
};

const dash = (v) => (v === null || v === undefined || String(v).trim() === "" ? "-" : v);

// A designation of "Other" carries its real text in other_designation.
const designationOf = (c) =>
  c.other_designation && String(c.other_designation).trim() ? c.other_designation : c.designation;

// Characters that would break PostgREST's .or() syntax or act as LIKE wildcards.
const cleanSearch = (s) => s.replace(/[,()%*\\_]/g, " ").replace(/\s+/g, " ").trim();

const csvCell = (value) => {
  let s = String(value ?? "");
  if (/^[=@\t\r]/.test(s) || /^[+-](?!\d)/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const contactsText = (rows) =>
  (rows || [])
    .map((c) => {
      const extra = [designationOf(c), c.contact_person_mobile].filter((x) => x && String(x).trim()).join(", ");
      return `${c.contact_person_name || "-"}${extra ? ` (${extra})` : ""}`;
    })
    .join("; ");

const projectsText = (rows) =>
  (rows || [])
    .map((p) => {
      const extra = [p.project_location, p.nature_of_project, p.project_value && `Value: ${p.project_value}`, p.percentage_balance_work && `Balance: ${p.percentage_balance_work}`, p.remarks && `Remarks: ${p.remarks}`]
        .filter((x) => x && String(x).trim())
        .join(", ");
      return `${p.project_name || "-"}${extra ? ` (${extra})` : ""}`;
    })
    .join("; ");

const CSV_VALUE = {
  serial_code: (r) => r.serial_code,
  sales_person_name: (r) => r.sales_person_name,
  visit_datetime: (r) => formatVisitDate(r.visit_datetime),
  city_location: (r) => r.city_location,
  visit_type: (r) => r.visit_type,
  company_name: (r) => r.company_name,
  contacts: (r) => contactsText(r.fos_contact_persons),
  projects: (r) => projectsText(r.fos_projects),
  nature_of_business: (r) => r.nature_of_business,
  photo: (r) => r.f2f_meeting_photo_url,
};

const viewButtonClass =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10";

// Field Sales Logs: read-only list of field_sales_form submissions.
function FieldSalesLogs() {
  const { showNotification } = useContext(AuthContext) || {};

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [visitType, setVisitType] = useState("");
  const [visitTypes, setVisitTypes] = useState([]);
  const [dateFrom, setDateFrom] = useState(""); // "YYYY-MM-DD", inclusive, on created_at
  const [dateTo, setDateTo] = useState("");
  const [showDate, setShowDate] = useState(false);
  const dateRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0);
  const fetchIdRef = useRef(0);

  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const columnToggleRef = useRef(null);

  const [detail, setDetail] = useState(null); // { type: "contacts" | "projects", log }
  const [detailRows, setDetailRows] = useState(null); // null = loading
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(cleanSearch(searchQuery)), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, visitType, dateFrom, dateTo]);

  // Close the Date popover on an outside click or Escape.
  useEffect(() => {
    if (!showDate) return undefined;
    const onDown = (e) => {
      if (dateRef.current && !dateRef.current.contains(e.target)) setShowDate(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setShowDate(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showDate]);

  // Close the Columns popover on an outside click.
  useEffect(() => {
    if (!showColumnToggle) return undefined;
    const onDown = (e) => {
      if (columnToggleRef.current && !columnToggleRef.current.contains(e.target)) setShowColumnToggle(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showColumnToggle]);

  // Visit types actually present in the records (Database/24_...sql).
  const loadVisitTypes = useCallback(async () => {
    const { data, error } = await supabase.rpc("field_sales_visit_types");
    if (error) console.error("Error loading visit types:", error);
    else setVisitTypes((data || []).filter(Boolean));
  }, []);

  useEffect(() => {
    loadVisitTypes();
  }, [loadVisitTypes]);

  // A start after the end is not applied (the popover says so).
  const rangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  const applyFilters = useCallback(
    (query) => {
      let q = query;
      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        q = q.or(`serial_code.ilike.${term},sales_person_name.ilike.${term}`);
      }
      if (visitType) q = q.eq("visit_type", visitType);
      // Both days are included: from 00:00 of the start day up to (not
      // including) 00:00 of the day after the end day, India time.
      if (!rangeInvalid) {
        if (dateFrom) q = q.gte("created_at", istDayStartISO(dateFrom));
        if (dateTo) q = q.lt("created_at", istDayStartISO(nextDay(dateTo)));
      }
      return q;
    },
    [debouncedSearch, visitType, dateFrom, dateTo, rangeInvalid]
  );

  const fetchLogs = useCallback(async () => {
    fetchIdRef.current += 1;
    const currentFetchId = fetchIdRef.current;
    setIsLoading(true);
    try {
      const from = (currentPage - 1) * itemsPerPage;
      const query = applyFilters(supabase.from("field_sales_form").select(LOG_FIELDS, { count: "exact" }))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + itemsPerPage - 1);
      const { data, error, count } = await query;
      if (currentFetchId !== fetchIdRef.current) return;
      if (error) throw error;
      setRows(data || []);
      setTotalResults(count || 0);
    } catch (error) {
      if (currentFetchId !== fetchIdRef.current) return;
      console.error("Error fetching field sales logs:", error);
      showNotification?.("Failed to fetch field sales logs: " + error.message, "error");
    } finally {
      if (currentFetchId === fetchIdRef.current) setIsLoading(false);
    }
  }, [applyFilters, currentPage, itemsPerPage, showNotification]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Contact persons / projects of the opened log, fetched on demand by form_id.
  useEffect(() => {
    if (!detail) return undefined;
    let cancelled = false;
    setDetailRows(null);
    setDetailError("");
    const isContacts = detail.type === "contacts";
    supabase
      .from(isContacts ? "fos_contact_persons" : "fos_projects")
      .select("*")
      .eq("form_id", detail.log.id)
      .order(isContacts ? "contact_order" : "project_order", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setDetailError(error.message);
        else setDetailRows(data || []);
      });
    return () => { cancelled = true; };
  }, [detail]);

  const isVisible = useCallback((key) => !hiddenColumns.includes(key), [hiddenColumns]);
  const shownColumns = useMemo(() => COLUMNS.filter((c) => !hiddenColumns.includes(c.key)), [hiddenColumns]);

  const handleExport = async () => {
    if (shownColumns.length === 0) {
      showNotification?.("Show at least one column to export", "warning");
      return;
    }
    setIsExporting(true);
    try {
      // Children are only fetched when their column is part of the export.
      const embeds = [
        isVisible("contacts") && "fos_contact_persons(contact_order, designation, other_designation, contact_person_name, contact_person_mobile)",
        isVisible("projects") && "fos_projects(project_order, project_name, project_location, nature_of_project, percentage_balance_work, project_value, remarks)",
      ].filter(Boolean);
      const select = [LOG_FIELDS, ...embeds].join(", ");

      const all = [];
      for (let from = 0; ; from += EXPORT_BATCH) {
        let q = applyFilters(supabase.from("field_sales_form").select(select))
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + EXPORT_BATCH - 1);
        if (isVisible("contacts")) q = q.order("contact_order", { referencedTable: "fos_contact_persons", ascending: true });
        if (isVisible("projects")) q = q.order("project_order", { referencedTable: "fos_projects", ascending: true });
        const { data, error } = await q;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < EXPORT_BATCH) break;
      }

      const lines = [shownColumns.map((c) => csvCell(c.label)).join(",")];
      for (const r of all) lines.push(shownColumns.map((c) => csvCell(CSV_VALUE[c.key](r))).join(","));
      downloadCsvText(`field-sales-logs-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\r\n"));
      showNotification?.(`Exported ${all.length} log${all.length === 1 ? "" : "s"}`, "success");
    } catch (err) {
      console.error("Field sales logs export failed:", err);
      showNotification?.("Export failed: " + (err.message || err), "error");
    } finally {
      setIsExporting(false);
    }
  };

  const hasFilters = Boolean(searchQuery || visitType || dateFrom || dateTo);
  const clearFilters = () => { setSearchQuery(""); setVisitType(""); setDateFrom(""); setDateTo(""); setCurrentPage(1); };
  const dateLabel =
    dateFrom && dateTo ? `${shortDay(dateFrom)} - ${shortDay(dateTo)}`
      : dateFrom ? `From ${shortDay(dateFrom)}`
      : dateTo ? `Until ${shortDay(dateTo)}`
      : "Date";

  const openDetail = (type, log) => setDetail({ type, log });

  const viewButton = (type, log) => (
    <button type="button" onClick={() => openDetail(type, log)} className={viewButtonClass}>
      <Eye size={14} aria-hidden="true" />
      View
    </button>
  );

  const photoLink = (url) =>
    isHttpUrl(url) ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className={viewButtonClass}>
        <ExternalLink size={14} aria-hidden="true" />
        View
      </a>
    ) : (
      <span className="text-gray-400 italic">-</span>
    );

  const cell = {
    serial_code: (r) => (
      <td key="serial_code" className="px-4 py-3 whitespace-nowrap text-sm text-center">
        <span className="inline-flex items-center rounded border border-primary/20 bg-primary/5 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">{r.serial_code}</span>
      </td>
    ),
    sales_person_name: (r) => <td key="sales_person_name" className="px-4 py-3 text-sm font-semibold text-gray-900 text-left whitespace-normal break-words">{dash(r.sales_person_name)}</td>,
    visit_datetime: (r) => <td key="visit_datetime" className="px-4 py-3 whitespace-nowrap text-sm text-center">{dash(formatVisitDate(r.visit_datetime))}</td>,
    city_location: (r) => <td key="city_location" className="px-4 py-3 text-sm text-left whitespace-normal break-words">{dash(r.city_location)}</td>,
    visit_type: (r) => <td key="visit_type" className="px-4 py-3 whitespace-nowrap text-sm text-center">{dash(r.visit_type)}</td>,
    company_name: (r) => <td key="company_name" className="px-4 py-3 text-sm text-left whitespace-normal break-words">{dash(r.company_name)}</td>,
    contacts: (r) => <td key="contacts" className="px-4 py-3 whitespace-nowrap text-sm text-center">{viewButton("contacts", r)}</td>,
    projects: (r) => <td key="projects" className="px-4 py-3 whitespace-nowrap text-sm text-center">{viewButton("projects", r)}</td>,
    nature_of_business: (r) => <td key="nature_of_business" className="px-4 py-3 text-sm text-left whitespace-normal break-words">{dash(r.nature_of_business)}</td>,
    photo: (r) => <td key="photo" className="px-4 py-3 whitespace-nowrap text-sm text-center">{photoLink(r.f2f_meeting_photo_url)}</td>,
  };

  const headers = shownColumns.map((c) => ({
    label: c.label,
    className: ["sales_person_name", "city_location", "company_name", "nature_of_business"].includes(c.key) ? "!text-left" : "",
  }));

  const renderRow = (row, index) => (
    <tr key={row.id || index}>{shownColumns.map((c) => cell[c.key](row))}</tr>
  );

  const renderCard = (row, index) => (
    <div key={row.id || index} className="bg-card p-4 rounded-lg border">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-gray-800 break-words">{dash(row.sales_person_name)}</span>
        <span className="shrink-0 rounded border border-primary/20 bg-primary/5 px-2 py-0.5 font-mono text-xs font-semibold text-primary">{row.serial_code}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {shownColumns
          .filter((c) => !["serial_code", "sales_person_name", "contacts", "projects", "photo"].includes(c.key))
          .map((c) => (
            <div key={c.key} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{c.label}</dt>
              <dd className="break-words">{dash(c.key === "visit_datetime" ? formatVisitDate(row.visit_datetime) : row[c.key])}</dd>
            </div>
          ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2 border-t pt-2">
        {isVisible("contacts") && <span className="flex items-center gap-1 text-xs text-muted-foreground">Contacts {viewButton("contacts", row)}</span>}
        {isVisible("projects") && <span className="flex items-center gap-1 text-xs text-muted-foreground">Projects {viewButton("projects", row)}</span>}
        {isVisible("photo") && <span className="flex items-center gap-1 text-xs text-muted-foreground">Photo {photoLink(row.f2f_meeting_photo_url)}</span>}
      </div>
    </div>
  );

  const detailCols = detail?.type === "contacts" ? CONTACT_COLS : PROJECT_COLS;
  const detailValue = (r, key) => (key === "designation" ? designationOf(r) : r[key]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 gap-3">
      <div className="flex flex-wrap items-center gap-2 shrink-0 w-full">

        <FilterSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Serial code or sales person..."
          className="max-w-[320px]"
        />

        <select
          aria-label="Filter by visit type"
          value={visitType}
          onChange={(e) => setVisitType(e.target.value)}
          className={`${filterControlClass} !w-auto min-w-[160px] max-w-[220px]`}
        >
          <option value="">All visit types</option>
          {visitTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <div ref={dateRef} className="relative shrink-0">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={showDate}
            onClick={() => setShowDate((v) => !v)}
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${dateFrom || dateTo ? "border-primary/40 bg-primary/5 font-medium text-primary" : "border-input bg-card text-foreground hover:bg-accent"}`}
          >
            <CalendarDays size={16} aria-hidden="true" />
            <span className="tabular-nums">{dateLabel}</span>
          </button>

          {showDate && (
            <div
              role="dialog"
              aria-label="Filter by date"
              className="absolute left-0 top-full z-50 mt-1 w-64 space-y-3 rounded-md border bg-popover p-3 shadow-lg"
            >
              <div className="space-y-1">
                <label htmlFor="fsl-date-from" className="block text-xs font-medium text-muted-foreground">Start date</label>
                <input
                  id="fsl-date-from"
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={filterControlClass}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="fsl-date-to" className="block text-xs font-medium text-muted-foreground">End date</label>
                <input
                  id="fsl-date-to"
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={filterControlClass}
                />
              </div>
              {rangeInvalid && (
                <p role="alert" className="text-xs text-destructive">Start date is after the end date, so the range is not applied.</p>
              )}
              <div className="flex items-center justify-between gap-2 border-t pt-2">
                <button
                  type="button"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  disabled={!dateFrom && !dateTo}
                  className="h-8 rounded-md px-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setShowDate(false)}
                  className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {hasFilters && (
            <button
              type="button"
              className="h-9 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-md transition-colors shrink-0"
              onClick={clearFilters}
            >
              Clear Filter
            </button>
          )}

          <button
            type="button"
            onClick={() => { fetchLogs(); loadVisitTypes(); }}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Refresh logs"
            title="Refresh"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
          </button>

          <div ref={columnToggleRef}>
            <ColumnSelector
              idPrefix="fsl-col"
              options={COLUMNS}
              visible={Object.fromEntries(COLUMNS.map((c) => [c.key, !hiddenColumns.includes(c.key)]))}
              onToggle={(key) =>
                setHiddenColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
              }
              onSelectAll={() => setHiddenColumns(hiddenColumns.length === 0 ? COLUMNS.map((c) => c.key) : [])}
              open={showColumnToggle}
              onOpenChange={setShowColumnToggle}
            />
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || shownColumns.length === 0}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            title="Export the filtered logs (visible columns) as CSV"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        {shownColumns.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-brand-200 bg-card text-sm text-muted-foreground">
            All columns are hidden. Use Columns to show some.
          </div>
        ) : (
          <DataTable
            ariaLabel="Field sales logs"
            emptyTitle={isLoading ? "Loading logs..." : "No logs found"}
            emptyDescription={isLoading ? "" : "Adjust your search, visit type or date filter."}
            headers={headers}
            data={rows}
            renderRow={renderRow}
            renderCard={renderCard}
            minWidth="min-w-0"
            currentPage={currentPage}
            totalPages={Math.ceil(totalResults / itemsPerPage) || 1}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
            totalResults={totalResults}
            itemsPerPageOptions={[10, 20, 50, 100]}
          />
        )}
      </div>

      <ModalView
        isOpen={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.type === "contacts" ? "Contact Persons" : "Projects"} - ${detail.log.serial_code}${detail.log.company_name ? ` (${detail.log.company_name})` : ""}` : ""}
        maxWidth="max-w-4xl"
      >
        {detailError ? (
          <p className="text-sm text-destructive">Could not load: {detailError}</p>
        ) : detailRows === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading...</p>
        ) : detailRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {detail?.type === "contacts" ? "contact persons" : "projects"} were added for this visit.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th scope="col" className="border-b px-3 py-2 text-center text-xs font-semibold text-brand-800">#</th>
                  {detailCols.map((c) => (
                    <th key={c.key} scope="col" className="whitespace-nowrap border-b px-3 py-2 text-left text-xs font-semibold text-brand-800">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {detailRows.map((r, i) => (
                  <tr key={r.id || i}>
                    <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">{i + 1}</td>
                    {detailCols.map((c) => (
                      <td key={c.key} className="px-3 py-2 text-left break-words">{dash(detailValue(r, c.key))}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ModalView>
    </div>
  );
}

export default FieldSalesLogs;
