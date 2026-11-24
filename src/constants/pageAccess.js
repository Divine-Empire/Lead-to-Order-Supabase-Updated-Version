// Page-wise access (RBAC). Each user has login.page_access: a list of the page keys below that
// they may open. Admins always see everything and never need a list; Settings is admin-only and is
// not assignable. A NULL page_access (account created before this feature) falls back to
// DEFAULT_USER_PAGES -- exactly what a non-admin could see before page access existed.
// The sidebar, the route guard and the Settings user form all read this one list.

export const PAGES = [
  { key: "dashboard", label: "Dashboard", group: "Main", href: "/" },
  { key: "leads", label: "Leads", group: "Main", href: "/leads" },
  { key: "call-tracker", label: "Call Tracker", group: "Main", href: "/call-tracker" },
  { key: "enquiry-tracker", label: "Enquiry Tracker", group: "Main", href: "/enquiry-tracker" },
  { key: "quotation", label: "Quotation", group: "Main", href: "/quotation" },
  { key: "series-quotation", label: "Series Quotation", group: "Main", href: "/series-quotation" },
  { key: "fos-enquiries", label: "FOS Enquiries", group: "Main", href: "/fos-enquiries" },
  { key: "weekly-plan", label: "Weekly Plan", group: "Main", href: "/fos-weekly-plan" },
  { key: "field-sales-logs", label: "Field Sales Logs", group: "Main", href: "/field-sales-logs" },
  { key: "duplicate-logs", label: "Duplicate Enquiry Logs", group: "Main", href: "/duplicate-logs" },
  { key: "report", label: "Report", group: "Main", href: "/report" },
  { key: "master:client", label: "Client Master", group: "Master Data", href: "/master/client" },
  { key: "master:sc-distribution", label: "SC Distribution", group: "Master Data", href: "/master/sc-distribution" },
  { key: "master:crm-distribution", label: "CRM Distribution", group: "Master Data", href: "/master/crm-distribution" },
  { key: "master:dropdowns", label: "Dropdowns", group: "Master Data", href: "/master/dropdowns" },
  { key: "master:consignors", label: "Consignor Details", group: "Master Data", href: "/master/consignors" },
  { key: "master:items", label: "Items", group: "Master Data", href: "/master/items" },
  { key: "master:tat-config", label: "TAT Configuration", group: "Master Data", href: "/master/tat-config" },
  { key: "master:report-persons", label: "Report Persons", group: "Master Data", href: "/master/report-persons" },
];

export const PAGE_GROUPS = ["Main", "Master Data"];
export const ALL_PAGE_KEYS = PAGES.map((p) => p.key);

// What a non-admin could open before page access existed.
export const DEFAULT_USER_PAGES = ALL_PAGE_KEYS.filter((k) => k !== "duplicate-logs" && (!k.startsWith("master:") || k === "master:client"));

// A brand-new user starts with the landing page only.
export const NEW_USER_PAGES = ["dashboard"];

// Whether `access` (a user's page list; null = legacy default) allows the page. "master" = any Master Data page.
export function allows(access, key) {
  const list = Array.isArray(access) ? access : DEFAULT_USER_PAGES;
  if (key === "master") return list.some((k) => k.startsWith("master:"));
  return list.includes(key);
}

// First page the user may open (used when the landing page itself is not allowed).
export function firstAllowedPage(canAccess) {
  return PAGES.find((p) => canAccess(p.key)) || null;
}
