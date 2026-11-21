// Field Sales Person weekly plan: week / financial-year maths and data access.
// Tables and RPCs: Database/36_fos_weekly_plans.sql.
//
// Financial year = 1 April - 31 March. A week runs Monday..Saturday and belongs
// to the FY its Saturday falls in. Week 1 is the week whose Saturday is the
// first Saturday on or after 1 April (so 16-21 Nov 2026 = Week 34 of 2026-27).
import supabase from "./supabase";
import { fetchAllRows } from "./fetchAllRows";

export const MEETING_TYPES = ["Existing", "MDO / Important Projects", "Self Identified", "Referral"];
export const PLAN_DAYS = 6; // Monday..Saturday

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");

// Dates are handled as "YYYY-MM-DD" strings and computed in UTC so DST/timezones never shift a day.
const toUtc = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const addDays = (ymd, n) => fromUtc(toUtc(ymd) + n * DAY_MS);
export const localToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};

// Monday of the Mon..Sun week containing ymd.
export const mondayOf = (ymd) => {
  const dow = new Date(toUtc(ymd)).getUTCDay(); // 0 = Sunday
  return addDays(ymd, -((dow + 6) % 7));
};

// Monday of week 1 for the FY starting 1 April of `startYear`.
const fyAnchor = (startYear) => {
  const apr1 = `${startYear}-04-01`;
  const dow = new Date(toUtc(apr1)).getUTCDay();
  const firstSaturday = addDays(apr1, (6 - dow + 7) % 7);
  return addDays(firstSaturday, -5);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const shortDate = (ymd) => {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

// { weekStart, weekNo, fyStartYear, fyLabel, label, days: [ymd x6] } for the week starting on a Monday.
export function weekInfo(monday) {
  const saturday = addDays(monday, 5);
  const [sy, sm] = saturday.split("-").map(Number);
  const fyStartYear = sm >= 4 ? sy : sy - 1;
  const weekNo = Math.round((toUtc(monday) - toUtc(fyAnchor(fyStartYear))) / (7 * DAY_MS)) + 1;
  const fyLabel = `${fyStartYear}-${pad((fyStartYear + 1) % 100)}`;
  return {
    weekStart: monday,
    weekNo,
    fyStartYear,
    fyLabel,
    label: `Week ${weekNo} (${shortDate(monday)} - ${shortDate(saturday)})`,
    days: Array.from({ length: PLAN_DAYS }, (_, i) => addDays(monday, i)),
  };
}

export const currentWeekStart = () => mondayOf(localToday());
export const previousWeekStart = (monday) => addDays(monday, -7);

// Every week (Mondays) of a financial year.
export function weeksOfFy(fyStartYear) {
  const weeks = [];
  let monday = fyAnchor(fyStartYear);
  while (weekInfo(monday).fyStartYear === fyStartYear) {
    weeks.push(monday);
    monday = addDays(monday, 7);
  }
  return weeks;
}

export const fyLabelOf = (startYear) => `${startYear}-${pad((startYear + 1) % 100)}`;
export const currentFyStartYear = () => weekInfo(currentWeekStart()).fyStartYear;

// ---- Data access ------------------------------------------------------

// plans: [{ id, fos_name, week_start, week_no, fy_label, days:[{plan_date, location}], meetings:[...] }]
export async function fetchPlans(names, weekStarts) {
  const { data, error } = await supabase.rpc("lto_fos_plan_get", { p_names: names, p_weeks: weekStarts });
  if (error) throw error;
  return data || [];
}

export async function fetchPlanPeople() {
  const { data, error } = await supabase.rpc("lto_fos_plan_people");
  if (error) throw error;
  return data || [];
}

export async function savePlan({ person, weekStart, days, meetings, user }) {
  const info = weekInfo(weekStart);
  const { data, error } = await supabase.rpc("lto_fos_plan_save", {
    p_fos_name: person,
    p_week_start: weekStart,
    p_fy_label: info.fyLabel,
    p_week_no: info.weekNo,
    p_user: user || null,
    p_days: days,
    p_meetings: meetings,
  });
  if (error) throw error;
  return data;
}

let clientCache = null;
// [{ name, uuid }] from Client Master (cached for the session).
export async function fetchClientList() {
  if (clientCache) return clientCache;
  const { data, error } = await fetchAllRows(() =>
    supabase.from("lto_client_master").select("uuid, company_name").order("company_name", { ascending: true })
  );
  if (error) throw error;
  clientCache = (data || []).filter((r) => r.company_name).map((r) => ({ name: r.company_name.trim(), uuid: r.uuid }));
  return clientCache;
}

export async function fetchDropdownValues(category) {
  const { data, error } = await supabase.from("lto_dropdown").select("value").eq("category", category).order("value", { ascending: true });
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.value).filter(Boolean))];
}

// Names an admin can create a plan for: login users + FOS names in the dropdown + people who already have a plan.
export async function fetchPlanPersonOptions() {
  const [{ data: logins }, fosNames, people] = await Promise.all([
    supabase.from("login").select("full_name"),
    fetchDropdownValues("fos_sales_person_name").catch(() => []),
    fetchPlanPeople().catch(() => []),
  ]);
  const seen = new Map();
  [...(logins || []).map((l) => l.full_name), ...fosNames, ...people].forEach((n) => {
    const name = String(n || "").replace(/\s+/g, " ").trim().toUpperCase();
    if (name && !seen.has(name)) seen.set(name, name);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
