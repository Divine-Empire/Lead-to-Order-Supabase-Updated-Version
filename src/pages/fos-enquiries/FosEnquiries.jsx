import { useState, useEffect, useRef, useContext, useCallback } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import { FilterSearch } from "../../components/FilterBar";
import DataTable from "../../components/DataTable";
import supabase from "../../utils/supabase";
import { AuthContext } from "../../App";
import { isHttpUrl } from "../../utils/itemCatalog";

// FOS Enquiries: the open leads / enquiries the logged-in Field Sales Person is
// on as Enquiry Receiver or Enquiry Assigned Person, newest first. Admins see
// everyone's. Other users see their own Full Name plus the names a HOD was
// given in Settings (login.fos_alternate_access). Data comes from
// lto_fos_enquiries (Database/35_fos_enquiries.sql).

const HEADERS = [
  "Timestamp", "Lead / Enquiry No.", "Source", "Company Name", "Number",
  "Enquiry Receiver Name", "Enquiry Assign to Person", "Quotation Number", "Value (Basic)", "Quotation Copy", "Last Follow-up Date", "Follow-up Remark",
].map((label) => (["Company Name", "Enquiry Receiver Name", "Enquiry Assign to Person", "Follow-up Remark"].includes(label) ? { label, className: "!text-left" } : label));

const whenFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
const moneyFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

// created_at columns are "timestamp without time zone" holding UTC; tag them so
// the browser doesn't read them as local time.
const asUtc = (v) => (v && !/(Z|[+-]\d{2}(:?\d{2})?)$/i.test(v) ? `${String(v).replace(" ", "T")}Z` : v || null);
const formatWhen = (v) => (v ? whenFmt.format(new Date(asUtc(v))) : "-");
const formatDay = (v) => (v ? dateFmt.format(new Date(asUtc(v))) : "-");

// Characters that act as LIKE wildcards in the search.
const cleanSearch = (s) => s.replace(/[%*\\_]/g, " ").replace(/\s+/g, " ").trim();

const TYPE_LABEL = { lead: "Lead", enquiry: "Enquiry" };

function FosEnquiries() {
  const { showNotification, currentUser, isAdmin } = useContext(AuthContext) || {};
  const admin = Boolean(isAdmin && isAdmin());

  const [names, setNames] = useState(undefined); // undefined = still working out whose records to show; null = everyone
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0);
  const fetchIdRef = useRef(0);

  // Whose records: admin = all; otherwise own Full Name + the Settings list,
  // read fresh so a change in Settings applies without logging in again.
  useEffect(() => {
    let cancelled = false;
    if (admin) {
      setNames(null);
      return undefined;
    }
    (async () => {
      let extra = [];
      try {
        const { data, error } = await supabase
          .from("login")
          .select("fos_alternate_access")
          .eq("username", currentUser?.username || "")
          .maybeSingle();
        if (error) throw error;
        extra = data?.fos_alternate_access || [];
      } catch (err) {
        console.error("Could not load FOS alternate access:", err);
      }
      if (!cancelled) setNames([currentUser?.fullName, ...extra].filter(Boolean));
    })();
    return () => { cancelled = true; };
  }, [admin, currentUser?.username, currentUser?.fullName]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(cleanSearch(searchQuery)), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  const fetchRows = useCallback(async () => {
    if (names === undefined) return;
    fetchIdRef.current += 1;
    const currentFetchId = fetchIdRef.current;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("lto_fos_enquiries", {
        p_names: names,
        p_search: debouncedSearch || null,
        p_limit: itemsPerPage,
        p_offset: (currentPage - 1) * itemsPerPage,
      });
      if (currentFetchId !== fetchIdRef.current) return;
      if (error) throw error;
      setRows(data?.rows || []);
      setTotalResults(Number(data?.total) || 0);
    } catch (err) {
      if (currentFetchId !== fetchIdRef.current) return;
      console.error("Error fetching FOS enquiries:", err);
      showNotification?.("Failed to fetch enquiries: " + err.message, "error");
    } finally {
      if (currentFetchId === fetchIdRef.current) setIsLoading(false);
    }
  }, [names, debouncedSearch, currentPage, itemsPerPage, showNotification]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const copyLink = (row) =>
    isHttpUrl(row.quotation_copy) ? (
      <a
        href={row.quotation_copy}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <ExternalLink size={14} aria-hidden="true" />
        View
      </a>
    ) : (
      <span className="text-gray-400">-</span>
    );

  const assignedText = (row) => (Array.isArray(row.assigned) && row.assigned.length ? row.assigned.join(", ") : "-");

  const value = (row) => (row.quotation_value === null || row.quotation_value === undefined ? "-" : moneyFmt.format(Number(row.quotation_value)));

  const renderRow = (row) => (
    <tr key={`${row.source_type}:${row.record_id}`}>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center tabular-nums">{formatWhen(row.created_at)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
        <span className="font-medium">{row.display_no || "-"}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">{TYPE_LABEL[row.source_type] || ""}</span>
      </td>
      <td className="px-4 py-3 text-sm text-center whitespace-normal break-words">{row.lead_source || "-"}</td>
      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-left whitespace-normal break-words">{row.company_name || "-"}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center tabular-nums">{row.phone_number || "-"}</td>
      <td className="px-4 py-3 text-sm text-left whitespace-normal break-words">{row.receiver || "-"}</td>
      <td className="px-4 py-3 text-sm text-left whitespace-normal break-words">{assignedText(row)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">{row.quotation_number || "-"}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center tabular-nums">{value(row)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">{copyLink(row)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center tabular-nums">{formatDay(row.last_followup_at)}</td>
      <td className="px-4 py-3 text-sm text-left whitespace-normal break-words max-w-xs">{row.last_followup_remark || "-"}</td>
    </tr>
  );

  const renderCard = (row) => (
    <div key={`${row.source_type}:${row.record_id}`} className="space-y-2 rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-gray-900 break-words">{row.company_name || "-"}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatWhen(row.created_at)}</span>
      </div>
      <p className="text-sm">
        <span className="font-medium">{row.display_no || "-"}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">{TYPE_LABEL[row.source_type] || ""}</span>
        {row.lead_source ? <span className="ml-1.5 text-xs text-muted-foreground">| {row.lead_source}</span> : null}
      </p>
      <p className="text-sm text-muted-foreground">{row.phone_number || "-"}</p>
      <p className="text-xs text-muted-foreground">
        Receiver: {row.receiver || "-"} | Assigned: {assignedText(row)}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{row.quotation_number || "No quotation"}{row.quotation_number ? ` | ${value(row)}` : ""}</span>
        {copyLink(row)}
      </div>
      <p className="text-xs text-muted-foreground">
        Last follow-up: {formatDay(row.last_followup_at)}{row.last_followup_remark ? ` | ${row.last_followup_remark}` : ""}
      </p>
    </div>
  );

  const noNames = !admin && Array.isArray(names) && names.length === 0;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 gap-3">
      <div className="flex flex-wrap items-center gap-2 shrink-0 w-full">
        <h2 className="mr-2 text-base font-semibold text-foreground shrink-0">FOS Enquiries</h2>

        <FilterSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Company, enquiry no., phone, receiver or assigned person..."
          className="w-full max-w-[560px]"
        />

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {searchQuery && (
            <button
              type="button"
              className="h-9 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-md transition-colors shrink-0"
              onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
            >
              Clear Filter
            </button>
          )}
          <button
            type="button"
            onClick={fetchRows}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Refresh enquiries"
            title="Refresh"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        <DataTable
          ariaLabel="FOS enquiries"
          emptyTitle={isLoading ? "Loading enquiries..." : "No enquiries found"}
          emptyDescription={
            isLoading
              ? ""
              : noNames
                ? "Your account has no Full Name set, so no records can be matched. Ask an admin to add it in Settings."
                : "Open leads and enquiries where you are the Enquiry Receiver or Assigned Person show up here."
          }
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
    </div>
  );
}

export default FosEnquiries;
