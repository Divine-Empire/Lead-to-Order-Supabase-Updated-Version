import { useState, useEffect, useCallback, useContext, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { FilterSearch } from "../../components/FilterBar";
import DataTable from "../../components/DataTable";
import AssignFieldPersonModal from "../../components/AssignFieldPersonModal";
import useConfirmDialog from "../../components/useConfirmDialog";
import { AuthContext } from "../../App";
import { listAssigned, deleteAssignment, namesForUser } from "../../utils/fosAssigned";

// Field Sales Logs > Assigned Enquiries: enquiries / leads the admin assigned for
// a visit. Admin sees all (and can edit / delete); a field person sees their own.

const dash = (v) => (v === null || v === undefined || v === "" ? <span className="text-gray-400 italic">-</span> : v);
const pad = (n) => String(n).padStart(2, "0");

export const formatMeeting = (v) => {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return String(v);
  const h = Number(m[4]);
  return `${m[3]}/${m[2]}/${m[1]} ${pad(h % 12 || 12)}:${m[5]} ${h >= 12 ? "PM" : "AM"}`;
};
const formatCreated = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const money = (v) => (v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("en-IN"));

const HEADERS = [
  "Status", "Meeting Date & Time", "Enquiry / Lead No", "Company Name", "Person Name", "Contact Number",
  "Address", "NOB", "Project Value", "Client Type", "Assigned To", "Assigned By", "Assigned On",
];
const LEFT = new Set(["Company Name", "Person Name", "Address", "Assigned To"]);

export default function AssignedEnquiries({ refreshKey = 0, leading = null, trailing = null }) {
  const { isAdmin = () => false, currentUser = null, showNotification } = useContext(AuthContext) || {};
  const admin = isAdmin();
  const names = namesForUser(admin, currentUser);
  const namesKey = JSON.stringify(names);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const fetchId = useRef(0);
  const { askConfirm, confirmDialog } = useConfirmDialog();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debounced]);

  const load = useCallback(async () => {
    const id = ++fetchId.current;
    setIsLoading(true);
    try {
      const res = await listAssigned({ names: JSON.parse(namesKey), search: debounced, limit: perPage, offset: (page - 1) * perPage });
      if (id !== fetchId.current) return;
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      if (id !== fetchId.current) return;
      console.error("Assigned enquiries load failed:", err);
      showNotification?.("Could not load assigned enquiries: " + (err.message || err), "error");
      setRows([]);
      setTotal(0);
    } finally {
      if (id === fetchId.current) setIsLoading(false);
    }
  }, [namesKey, debounced, perPage, page, showNotification]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const remove = (row) =>
    askConfirm(
      { title: "Delete assignment?", message: `${row.display_no || ""} ${row.company_name || ""} will be removed from the field person's list.`, confirmText: "Delete" },
      async () => {
        try {
          await deleteAssignment(row.id);
          showNotification?.("Assignment deleted", "success");
          load();
        } catch (err) {
          showNotification?.("Could not delete: " + (err.message || err), "error");
        }
      }
    );

  const headers = [...(admin ? ["Actions"] : []), ...HEADERS].map((label) => ({ label, className: LEFT.has(label) ? "!text-left" : "" }));

  const renderRow = (r) => (
    <tr key={r.id}>
      {admin && (
        <td className="px-3 py-3 whitespace-nowrap text-sm">
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(r)} className="inline-flex h-7 items-center rounded-md border border-input bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent">Edit</button>
            <button type="button" onClick={() => remove(r)} className="inline-flex h-7 items-center rounded-md border border-destructive/30 px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10">Delete</button>
          </div>
        </td>
      )}
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "Closed" ? "bg-gray-100 text-gray-500" : "bg-green-100 text-green-700"}`}>
          {r.status || "Open"}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-medium">{dash(formatMeeting(r.meeting_at))}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
        <span className="inline-flex items-center rounded border border-primary/20 bg-primary/5 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">{dash(r.display_no)}</span>
      </td>
      <td className="px-4 py-3 text-sm text-left font-semibold text-gray-900 whitespace-normal break-words">{dash(r.company_name)}</td>
      <td className="px-4 py-3 text-sm text-left whitespace-normal break-words">{dash(r.person_name)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">{dash(r.contact_number)}</td>
      <td className="px-4 py-3 text-sm text-left whitespace-normal break-words min-w-[200px]">{dash(r.address)}</td>
      <td className="px-4 py-3 text-sm text-center whitespace-normal break-words">{dash(r.nob)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center tabular-nums">{dash(money(r.project_value))}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">{dash(r.client_type)}</td>
      <td className="px-4 py-3 text-sm text-left whitespace-normal break-words">{dash((r.assigned_to || []).join(", "))}</td>
      <td className="px-4 py-3 text-sm text-center whitespace-normal break-words">{dash(r.assigned_by)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">{dash(formatCreated(r.created_at))}</td>
    </tr>
  );

  const renderCard = (r) => (
    <div key={r.id} className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="break-words font-semibold text-gray-800">{dash(r.company_name)}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "Closed" ? "bg-gray-100 text-gray-500" : "bg-green-100 text-green-700"}`}>{r.status || "Open"}</span>
          <span className="rounded border border-primary/20 bg-primary/5 px-2 py-0.5 font-mono text-xs font-semibold text-primary">{r.display_no}</span>
        </div>
      </div>
      <p className="mt-1 text-sm font-medium text-primary">{formatMeeting(r.meeting_at)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {[["Person", r.person_name], ["Contact", r.contact_number], ["NOB", r.nob], ["Project Value", money(r.project_value)], ["Client Type", r.client_type], ["Assigned To", (r.assigned_to || []).join(", ")]].map(([k, v]) => (
          <div key={k} className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words">{dash(v)}</dd></div>
        ))}
        <div className="col-span-2 min-w-0"><dt className="text-xs text-muted-foreground">Address</dt><dd className="break-words">{dash(r.address)}</dd></div>
      </dl>
      {admin && (
        <div className="mt-3 flex gap-2 border-t pt-2">
          <button type="button" onClick={() => setEditing(r)} className="h-8 flex-1 rounded-md border border-input text-xs font-medium hover:bg-accent">Edit</button>
          <button type="button" onClick={() => remove(r)} className="h-8 flex-1 rounded-md border border-destructive/30 text-xs font-medium text-destructive hover:bg-destructive/10">Delete</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex w-full shrink-0 flex-wrap items-center gap-2">
        {leading}
        <FilterSearch value={search} onChange={setSearch} placeholder="Company, enquiry no, person, address..." className="max-w-[360px]" />
        <button
          type="button"
          onClick={load}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Refresh assigned enquiries"
          title="Refresh"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
        </button>
        {trailing}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <DataTable
          ariaLabel="Assigned enquiries"
          emptyTitle={isLoading ? "Loading..." : "No assigned enquiries"}
          emptyDescription={isLoading ? "" : admin ? "Use Assign in Enquiry Tracker to assign one to a field person." : "Nothing is assigned to you yet."}
          headers={headers}
          data={rows}
          renderRow={renderRow}
          renderCard={renderCard}
          minWidth="min-w-0"
          currentPage={page}
          totalPages={Math.ceil(total / perPage) || 1}
          itemsPerPage={perPage}
          onPageChange={setPage}
          onItemsPerPageChange={(n) => { setPerPage(n); setPage(1); }}
          totalResults={total}
          itemsPerPageOptions={[10, 20, 50, 100]}
        />
      </div>

      {editing && (
        <AssignFieldPersonModal
          isOpen
          onClose={() => setEditing(null)}
          record={{ sourceType: editing.source_type, dbId: editing.record_id, leadNo: editing.display_no }}
          assignedBy={currentUser?.fullName || currentUser?.username}
          showNotification={showNotification}
          onSaved={load}
        />
      )}
      {confirmDialog}
    </div>
  );
}
