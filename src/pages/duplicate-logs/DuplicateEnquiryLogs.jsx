import { useState, useEffect, useRef, useContext, useCallback } from "react";
import { RefreshCw, Eye, Check } from "lucide-react";
import { FilterSearch, filterControlClass } from "../../components/FilterBar";
import DataTable from "../../components/DataTable";
import ModalView from "../../components/ModalView";
import OpenRecordsTable from "../../components/OpenRecordsTable";
import supabase from "../../utils/supabase";
import { AuthContext } from "../../App";
import { DUP_LOG_TABLE, DUP_LOG_SELECT, markLogsRead } from "../../utils/duplicateLogs";

// Duplicate Enquiry Logs (admin): every time a lead / enquiry was created for a
// company that already had open ones. Shows who has read each log (company's
// SC, CRM, an admin) -- written by Leads.jsx / DirectEnquiryForm.jsx via
// create_duplicate_enquiry_log (Database/28_duplicate_enquiry_logs.sql).

const HEADERS = [
  "Date", "Company", "New Record", "Created By", "SC", "CRM", "Open Records", "Read by SC", "Read by CRM", "Read by Admin", "Action",
].map((label) => (["Company", "Created By", "SC", "CRM"].includes(label) ? { label, className: "!text-left" } : label));

const whenFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const formatWhen = (value) => (value ? whenFmt.format(new Date(value)) : "-");

// Characters that would break PostgREST's .or() syntax or act as LIKE wildcards.
const cleanSearch = (s) => s.replace(/[,()%*\\_]/g, " ").replace(/\s+/g, " ").trim();

const ReadChip = ({ named, read }) => {
  if (!named) return <span className="text-gray-400">-</span>;
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
        read ? "border-success/25 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning-foreground"
      }`}
    >
      {read ? "Read" : "Unread"}
    </span>
  );
};

function DuplicateEnquiryLogs() {
  const { showNotification, currentUser } = useContext(AuthContext) || {};

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState(""); // "" | "unread" | "read"  (admin read)
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0);
  const [recordsFor, setRecordsFor] = useState(null); // log whose open records are shown
  const [busyId, setBusyId] = useState(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(cleanSearch(searchQuery)), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, status]);

  const fetchLogs = useCallback(async () => {
    fetchIdRef.current += 1;
    const currentFetchId = fetchIdRef.current;
    setIsLoading(true);
    try {
      let query = supabase.from(DUP_LOG_TABLE).select(DUP_LOG_SELECT, { count: "exact" });

      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        // company names live in lto_client_master (the log only holds company_id)
        const { data: companies, error: companyError } = await supabase
          .from("lto_client_master").select("uuid").ilike("company_name", term).limit(500);
        if (companyError) throw companyError;
        const ids = (companies || []).map((c) => c.uuid);
        const parts = [
          `new_record_no.ilike.${term}`, `created_by.ilike.${term}`, `sc_name.ilike.${term}`, `crm_name.ilike.${term}`,
          ...(ids.length ? [`company_id.in.(${ids.join(",")})`] : []),
        ];
        query = query.or(parts.join(","));
      }
      if (status === "unread") query = query.eq("read_by_admin", false);
      if (status === "read") query = query.eq("read_by_admin", true);

      const from = (currentPage - 1) * itemsPerPage;
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + itemsPerPage - 1);
      if (currentFetchId !== fetchIdRef.current) return;
      if (error) throw error;
      setRows((data || []).map((l) => ({ ...l, companyName: l.lto_client_master?.company_name || "" })));
      setTotalResults(count || 0);
    } catch (err) {
      if (currentFetchId !== fetchIdRef.current) return;
      console.error("Error fetching duplicate enquiry logs:", err);
      showNotification?.("Failed to fetch logs: " + err.message, "error");
    } finally {
      if (currentFetchId === fetchIdRef.current) setIsLoading(false);
    }
  }, [debouncedSearch, status, currentPage, itemsPerPage, showNotification]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const adminName = currentUser?.fullName || currentUser?.username || "";

  const markRead = async (log) => {
    setBusyId(log.id);
    try {
      await markLogsRead({ logs: [{ ...log, roles: ["admin"] }], adminName });
      await fetchLogs();
    } catch (err) {
      console.error("Could not mark the log as read:", err);
      showNotification?.("Could not mark as read: " + (err.message || err), "error");
    } finally {
      setBusyId(null);
    }
  };

  const openRecords = (log) => (Array.isArray(log.open_records) ? log.open_records : []);

  const renderRow = (log) => (
    <tr key={log.id}>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center tabular-nums">{formatWhen(log.created_at)}</td>
      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-left whitespace-normal break-words">{log.companyName || "-"}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
        <span className="font-medium">{log.new_record_no || "-"}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">{log.new_record_type === "lead" ? "Lead" : "Enquiry"}</span>
      </td>
      <td className="px-4 py-3 text-sm text-left whitespace-normal break-words">{log.created_by || "-"}</td>
      <td className="px-4 py-3 text-sm text-left whitespace-normal break-words">{log.sc_name || "-"}</td>
      <td className="px-4 py-3 text-sm text-left whitespace-normal break-words">{log.crm_name || "-"}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
        <button
          type="button"
          onClick={() => setRecordsFor(log)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Eye size={14} aria-hidden="true" />
          View ({openRecords(log).length})
        </button>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center"><ReadChip named={!!log.sc_name} read={log.read_by_sc} /></td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center"><ReadChip named={!!log.crm_name} read={log.read_by_crm} /></td>
      <td className="px-4 py-3 text-sm text-center">
        <ReadChip named read={log.read_by_admin} />
        {log.read_by_admin && (
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            {log.admin_name || ""}<br />{formatWhen(log.read_by_admin_timestamp)}
          </p>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
        {log.read_by_admin ? (
          <span className="text-gray-400">-</span>
        ) : (
          <button
            type="button"
            disabled={busyId === log.id}
            onClick={() => markRead(log)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            <Check size={14} aria-hidden="true" />
            Mark as read
          </button>
        )}
      </td>
    </tr>
  );

  const renderCard = (log) => (
    <div key={log.id} className="bg-card p-4 rounded-lg border space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-gray-800 break-words">{log.companyName || "-"}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatWhen(log.created_at)}</span>
      </div>
      <p className="text-sm">
        <span className="font-medium">{log.new_record_no}</span> ({log.new_record_type === "lead" ? "Lead" : "Enquiry"}){log.created_by ? ` by ${log.created_by}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">SC: {log.sc_name || "-"} | CRM: {log.crm_name || "-"}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">SC</span><ReadChip named={!!log.sc_name} read={log.read_by_sc} />
        <span className="text-xs text-muted-foreground">CRM</span><ReadChip named={!!log.crm_name} read={log.read_by_crm} />
        <span className="text-xs text-muted-foreground">Admin</span><ReadChip named read={log.read_by_admin} />
      </div>
      <div className="flex justify-end gap-2 border-t pt-2">
        <button type="button" onClick={() => setRecordsFor(log)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary">
          <Eye size={14} aria-hidden="true" />Open records ({openRecords(log).length})
        </button>
        {!log.read_by_admin && (
          <button type="button" disabled={busyId === log.id} onClick={() => markRead(log)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium disabled:opacity-50">
            <Check size={14} aria-hidden="true" />Mark as read
          </button>
        )}
      </div>
    </div>
  );

  const hasFilters = Boolean(searchQuery || status);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 gap-3">
      <div className="flex flex-wrap items-center gap-2 shrink-0 w-full">
        <h2 className="mr-2 text-base font-semibold text-foreground shrink-0">Duplicate Enquiry Logs</h2>

        <FilterSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Company, record no., creator, SC or CRM..."
          className="max-w-[340px]"
        />

        <select
          aria-label="Filter by admin read status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`${filterControlClass} !w-auto min-w-[150px] max-w-[200px]`}
        >
          <option value="">All logs</option>
          <option value="unread">Unread by admin</option>
          <option value="read">Read by admin</option>
        </select>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {hasFilters && (
            <button
              type="button"
              className="h-9 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-md transition-colors shrink-0"
              onClick={() => { setSearchQuery(""); setStatus(""); setCurrentPage(1); }}
            >
              Clear Filter
            </button>
          )}
          <button
            type="button"
            onClick={fetchLogs}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Refresh logs"
            title="Refresh"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        <DataTable
          ariaLabel="Duplicate enquiry logs"
          emptyTitle={isLoading ? "Loading logs..." : "No logs found"}
          emptyDescription={isLoading ? "" : "A log is added whenever a lead or enquiry is created over existing open ones. Logs an admin has read are removed 15 days later."}
          headers={HEADERS}
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
      </div>

      <ModalView
        isOpen={Boolean(recordsFor)}
        onClose={() => setRecordsFor(null)}
        title={recordsFor ? `Open records - ${recordsFor.companyName || "Company"} (when ${recordsFor.new_record_no || "record"} was created)` : ""}
        maxWidth="max-w-4xl"
      >
        {recordsFor && (openRecords(recordsFor).length === 0
          ? <p className="text-sm text-muted-foreground">No open records were stored for this log.</p>
          : <OpenRecordsTable records={openRecords(recordsFor)} />)}
      </ModalView>
    </div>
  );
}

export default DuplicateEnquiryLogs;
