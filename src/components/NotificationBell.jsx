import { useState, useEffect, useRef, useContext, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Bell, CheckCheck, Check } from "lucide-react";
import { AuthContext } from "../App";
import { fetchUnreadLogs, markLogsRead } from "../utils/duplicateLogs";

// Header bell: duplicate-enquiry alerts (lto_duplicate_enquiry_logs).
// - SC / CRM of the company see their own unread alerts and can mark them read.
// - Admins see every alert unread by an admin, with who has read it, and mark
//   them read (the admin's full name is stored).

const POLL_MS = 60000;
const whenFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const formatWhen = (value) => (value ? whenFmt.format(new Date(value)) : "");

const Chip = ({ label, state }) => (
  <span
    className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${
      state === "read" ? "border-success/25 bg-success/10 text-success"
        : state === "unread" ? "border-warning/40 bg-warning/10 text-warning-foreground"
        : "border-border bg-muted text-muted-foreground"
    }`}
  >
    {label}: {state === "read" ? "Read" : state === "unread" ? "Unread" : "-"}
  </span>
);

export function NotificationList({ logs, hasMore, isAdmin, busyId, onMarkOne, onMarkAll }) {
  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-sm font-semibold text-foreground">Duplicate enquiry alerts</p>
        {logs.length > 1 && (
          <button
            type="button"
            onClick={onMarkAll}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <CheckCheck size={14} aria-hidden="true" />
            Mark all as read
          </button>
        )}
      </div>

      {logs.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No new alerts.</p>
      ) : (
        <ul className="max-h-96 divide-y overflow-y-auto">
          {logs.map((log) => {
            const open = Array.isArray(log.open_records) ? log.open_records : [];
            return (
              <li key={log.id} className="space-y-1.5 px-3 py-2.5">
                <p className="text-sm font-medium text-foreground break-words">{log.companyName || "Company"}</p>
                <p className="text-xs text-muted-foreground">
                  {log.new_record_type === "lead" ? "Lead" : "Enquiry"} <span className="font-semibold text-foreground">{log.new_record_no || ""}</span>
                  {log.created_by ? ` created by ${log.created_by}` : " created"} while {open.length} open record{open.length === 1 ? "" : "s"} existed:
                  {" "}{open.map((r) => r.number).filter(Boolean).join(", ") || "-"}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] tabular-nums text-muted-foreground">{formatWhen(log.created_at)}</span>
                  <button
                    type="button"
                    disabled={busyId === log.id}
                    onClick={() => onMarkOne(log)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Check size={13} aria-hidden="true" />
                    Mark as read
                  </button>
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap gap-1">
                    <Chip label="SC" state={!log.sc_name ? "none" : log.read_by_sc ? "read" : "unread"} />
                    <Chip label="CRM" state={!log.crm_name ? "none" : log.read_by_crm ? "read" : "unread"} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && <p className="border-t px-3 py-1.5 text-center text-[11px] text-muted-foreground">Showing the latest {logs.length}. Mark some as read to see older ones.</p>}
    </>
  );
}

export default function NotificationBell() {
  const { currentUser = null, isAdmin = () => false, getUsernamesToFilter = () => [], showNotification = () => {} } = useContext(AuthContext) || {};
  const location = useLocation();
  const admin = isAdmin();

  const [logs, setLogs] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const wrapRef = useRef(null);
  const requestRef = useRef(0);

  const names = getUsernamesToFilter();
  const namesKey = names.join("|");

  const refresh = useCallback(async () => {
    if (!currentUser) return;
    const requestId = ++requestRef.current;
    try {
      const result = await fetchUnreadLogs({ isAdmin: admin, names: namesKey ? namesKey.split("|") : [] });
      if (requestId !== requestRef.current) return;
      setLogs(result.logs);
      setHasMore(result.hasMore);
    } catch (err) {
      console.warn("Could not load duplicate-enquiry alerts:", err);
    }
  }, [currentUser, admin, namesKey]);

  // Load on mount / page change, then every minute and when the tab regains focus.
  useEffect(() => {
    refresh();
    const onFocus = () => { if (document.visibilityState !== "hidden") refresh(); };
    const timer = setInterval(onFocus, POLL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh, location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const adminName = currentUser?.fullName || currentUser?.username || "";

  const mark = async (targets, busy) => {
    setBusyId(busy);
    try {
      await markLogsRead({ logs: targets, adminName });
      setLogs((prev) => prev.filter((l) => !targets.some((t) => t.id === l.id)));
      refresh();
    } catch (err) {
      console.error("Could not mark alerts as read:", err);
      showNotification("Could not mark as read: " + (err.message || err), "error");
    } finally {
      setBusyId(null);
    }
  };

  if (!currentUser) return null;

  const count = logs.length;
  const badge = count > 99 ? "99+" : String(count);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Bell size={18} aria-hidden="true" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Duplicate enquiry alerts"
          className="absolute right-0 top-full z-50 mt-1 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border bg-popover shadow-lg"
        >
          <NotificationList
            logs={logs}
            hasMore={hasMore}
            isAdmin={admin}
            busyId={busyId}
            onMarkOne={(log) => mark([log], log.id)}
            onMarkAll={() => mark(logs, "all")}
          />
        </div>
      )}
    </div>
  );
}
