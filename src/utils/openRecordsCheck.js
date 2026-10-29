import supabase from "./supabase";
import { formatPersons } from "./assignToPerson";

// "Open" = still in Enquiry Tracker > Pending (enquiry_pending_view: no
// tracker row has recorded an order yes/no yet). Used by the duplicate
// warning shown when a new lead / enquiry is created for a company that
// already has some.

const FREIGHT_NAMES = new Set(["FREIGHT", "PACKAGING AND FORWARDING"]); // same rule as Database/01_sync_items_from_quotation.sql
const CHUNK = 25; // ids per .in() filter -- keeps URLs short and result sets under PostgREST's 1000-row cap

const chunks = (list, n = CHUNK) => {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};

// Run one query per chunk of ids and concatenate the rows.
const inChunks = async (ids, run) => {
  const results = await Promise.all(chunks(ids).map(run));
  const rows = [];
  for (const { data, error } of results) {
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
};

const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&"); // match the name literally, not as a pattern
const normRef = (s) => String(s || "").trim().toUpperCase();
const ts = (v) => (v ? new Date(v).getTime() : 0);

// created_at / planned_at on these tables are "timestamp without time zone"
// holding UTC (the app writes toISOString()). PostgREST returns them with no
// zone, which the browser would read as local time -- tag them as UTC so the
// dialog shows the right IST date.
const asUtc = (v) => (v && !/(Z|[+-]d{2}(:?d{2})?)$/i.test(v) ? `${String(v).replace(" ", "T")}Z` : v || null);

/**
 * Open leads + enquiries of a company (case-insensitive exact name), newest
 * first. Each entry:
 *   { key, sourceType: "lead"|"enquiry", recordId, number, createdAt,
 *     referencePerson, quotationNo,
 *     lastFollowUpAt, lastFollowUpSource: "followup"|"planned"|"none",
 *     items: [{ name, quantity, unit }], itemsSource: "quotation"|"enquiry"|"lead"|"none" }
 *
 * - referencePerson: the latest quotation's reference_name; with no quotation
 *   (or none filled in) the record's enquiry_assign_to_person.
 * - items: the latest quotation's items (Freight / Packaging lines left out);
 *   else the enquiry's / lead's own items; else [].
 * - lastFollowUp: newest Enquiry Tracker row; else the record's planned_at.
 * Throws on a query error (callers treat the check as best-effort).
 */
export async function fetchOpenRecordsForCompany(companyName) {
  const name = String(companyName || "").trim();
  if (!name) return [];

  const { data: open, error: openError } = await supabase
    .from("enquiry_pending_view")
    .select("source_type, record_id, display_no, planned_at, enquiry_assign_to_person")
    .ilike("company_name", escapeLike(name));
  if (openError) throw openError;
  if (!open || open.length === 0) return [];

  const enquiryIds = open.filter((r) => r.source_type === "enquiry").map((r) => r.record_id);
  const leadIds = open.filter((r) => r.source_type === "lead").map((r) => r.record_id);
  const numbers = [...new Set(open.map((r) => r.display_no).filter(Boolean))];
  const numberVariants = [...new Set(numbers.flatMap((n) => [n, n.toUpperCase(), n.toLowerCase()]))];

  const [enquiryRows, leadRows, enquiryTrackers, leadTrackers, quotations, enquiryItems, leadItems] = await Promise.all([
    // Creation date: the view's created_at for a lead is its call-tracker row's, so read the record itself.
    inChunks(enquiryIds, (ids) => supabase.from("lto_enquiries").select("id, created_at").in("id", ids)),
    inChunks(leadIds, (ids) => supabase.from("lto_leads").select("id, created_at").in("id", ids)),
    inChunks(enquiryIds, (ids) => supabase.from("lto_enquiry_tracker").select("enquiry_id, created_at").in("enquiry_id", ids).order("created_at", { ascending: false })),
    inChunks(leadIds, (ids) => supabase.from("lto_enquiry_tracker_for_leads").select("lead_id, created_at").in("lead_id", ids).order("created_at", { ascending: false })),
    inChunks(numberVariants, (nos) => supabase.from("lto_make_quotations").select("id, quotation_no, reference_name, enquiry_reference_no, created_at").in("enquiry_reference_no", nos).order("created_at", { ascending: false })),
    inChunks(enquiryIds, (ids) => supabase.from("lto_enquiry_items").select("enquiry_id, item_name, quantity").in("enquiry_id", ids)),
    inChunks(leadIds, (ids) => supabase.from("lto_lead_items").select("lead_id, item_name, quantity").in("lead_id", ids)),
  ]);

  const createdAt = new Map([...enquiryRows, ...leadRows].map((r) => [r.id, r.created_at]));

  const lastFollowUp = new Map(); // rows are newest-first, so the first one seen wins
  enquiryTrackers.forEach((r) => { if (!lastFollowUp.has(r.enquiry_id)) lastFollowUp.set(r.enquiry_id, r.created_at); });
  leadTrackers.forEach((r) => { if (!lastFollowUp.has(r.lead_id)) lastFollowUp.set(r.lead_id, r.created_at); });

  const latestQuotation = new Map(); // normalised enquiry/lead number -> newest quotation
  quotations.forEach((q) => {
    const k = normRef(q.enquiry_reference_no);
    if (!latestQuotation.has(k)) latestQuotation.set(k, q);
  });

  const quotationItemRows = await inChunks([...new Set([...latestQuotation.values()].map((q) => q.id))], (ids) =>
    supabase.from("lto_make_quotation_items").select("quotation_id, item_name, quantity, unit, item_order").in("quotation_id", ids).order("item_order", { ascending: true })
  );
  const quotationItems = new Map();
  quotationItemRows.forEach((i) => {
    if (FREIGHT_NAMES.has(normRef(i.item_name))) return;
    if (!quotationItems.has(i.quotation_id)) quotationItems.set(i.quotation_id, []);
    quotationItems.get(i.quotation_id).push({ name: i.item_name, quantity: i.quantity, unit: i.unit || "" });
  });

  const ownItems = new Map();
  [...enquiryItems.map((i) => [i.enquiry_id, i]), ...leadItems.map((i) => [i.lead_id, i])].forEach(([id, i]) => {
    if (!ownItems.has(id)) ownItems.set(id, []);
    ownItems.get(id).push({ name: i.item_name, quantity: i.quantity, unit: "" });
  });

  return open
    .map((r) => {
      const q = latestQuotation.get(normRef(r.display_no)) || null;
      const fromQuotation = q ? quotationItems.get(q.id) || [] : [];
      const own = ownItems.get(r.record_id) || [];
      const items = fromQuotation.length ? fromQuotation : own;
      const lastFollow = lastFollowUp.get(r.record_id) || null;
      return {
        key: `${r.source_type}:${r.record_id}`,
        sourceType: r.source_type,
        recordId: r.record_id,
        number: r.display_no || "",
        createdAt: asUtc(createdAt.get(r.record_id)),
        referencePerson: String(q?.reference_name || "").trim() || formatPersons(r.enquiry_assign_to_person),
        quotationNo: q?.quotation_no || null,
        lastFollowUpAt: asUtc(lastFollow || r.planned_at),
        lastFollowUpSource: lastFollow ? "followup" : r.planned_at ? "planned" : "none",
        items,
        itemsSource: fromQuotation.length ? "quotation" : own.length ? (r.source_type === "lead" ? "lead" : "enquiry") : "none",
      };
    })
    .sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}
