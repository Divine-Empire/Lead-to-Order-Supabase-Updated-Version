import supabase from "./supabase";

// Reads / marks lto_duplicate_enquiry_logs (Database/28_duplicate_enquiry_logs.sql).
// Used by the header notification bell and the Duplicate Enquiry Logs stage.

export const DUP_LOG_TABLE = "lto_duplicate_enquiry_logs";
export const DUP_LOG_SELECT =
  "id, created_at, company_id, new_record_type, new_record_no, created_by, sc_name, crm_name, open_records, " +
  "read_by_sc, read_by_crm, read_by_admin, read_by_admin_timestamp, admin_name, lto_client_master(company_name)";

const BELL_LIMIT = 50;
const norm = (s) => String(s || "").trim().toLowerCase();

// Which "read" flags this person can still tick on a log. Admins act as
// 'admin'; anyone else acts as 'sc' and/or 'crm' when the company's SC / CRM
// is one of their names (same name list the rest of the app scopes data by).
export function rolesForLog(log, { isAdmin, names }) {
  if (isAdmin) return log.read_by_admin ? [] : ["admin"];
  const mine = new Set((names || []).map(norm).filter(Boolean));
  const roles = [];
  if (log.sc_name && mine.has(norm(log.sc_name)) && !log.read_by_sc) roles.push("sc");
  if (log.crm_name && mine.has(norm(log.crm_name)) && !log.read_by_crm) roles.push("crm");
  return roles;
}

const withCompany = (log) => ({ ...log, companyName: log.lto_client_master?.company_name || "" });

/**
 * Unread logs for the bell, newest first: all admin-unread logs for an admin;
 * for anyone else the logs where they are the SC / CRM and have not read it.
 * -> { logs: [{ ...log, companyName, roles }], hasMore }
 */
export async function fetchUnreadLogs({ isAdmin, names }) {
  const q = () => supabase.from(DUP_LOG_TABLE).select(DUP_LOG_SELECT).order("created_at", { ascending: false }).limit(BELL_LIMIT);

  let rows;
  let hasMore;
  if (isAdmin) {
    const { data, error } = await q().eq("read_by_admin", false);
    if (error) throw error;
    rows = data || [];
    hasMore = rows.length >= BELL_LIMIT;
  } else {
    const list = [...new Set((names || []).map((n) => String(n || "").trim()).filter(Boolean))];
    if (list.length === 0) return { logs: [], hasMore: false };
    const [sc, crm] = await Promise.all([
      q().in("sc_name", list).eq("read_by_sc", false),
      q().in("crm_name", list).eq("read_by_crm", false),
    ]);
    if (sc.error) throw sc.error;
    if (crm.error) throw crm.error;
    const byId = new Map();
    [...(sc.data || []), ...(crm.data || [])].forEach((l) => byId.set(l.id, l));
    rows = [...byId.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    hasMore = (sc.data || []).length >= BELL_LIMIT || (crm.data || []).length >= BELL_LIMIT;
  }

  const logs = rows
    .map((l) => ({ ...withCompany(l), roles: rolesForLog(l, { isAdmin, names }) }))
    .filter((l) => l.roles.length > 0);
  return { logs, hasMore };
}

/**
 * Marks logs read for each of the roles in log.roles (see rolesForLog).
 * adminName = the admin's full name, stored with an admin read.
 * Resolves the number of flags newly set; throws on a DB error.
 */
export async function markLogsRead({ logs, adminName }) {
  const idsByRole = { sc: [], crm: [], admin: [] };
  logs.forEach((l) => (l.roles || []).forEach((r) => idsByRole[r]?.push(l.id)));

  let marked = 0;
  for (const role of ["sc", "crm", "admin"]) {
    if (idsByRole[role].length === 0) continue;
    const { data, error } = await supabase.rpc("mark_duplicate_enquiry_logs_read", {
      p_ids: idsByRole[role],
      p_role: role,
      p_admin_name: role === "admin" ? adminName : null,
    });
    if (error) throw error;
    marked += data || 0;
  }
  return marked;
}
