import supabase from "./supabase";

// lto_client_master is the source of truth for a company's details. These
// helpers back the Enquiry Tracker Pending > Edit modal: pick a company ->
// its master details fill in; change a master-held detail -> the master row
// is updated too (after a confirm). Updating the master then fans out to the
// company's open leads/enquiries via the trg_client_master_propagate DB
// trigger (Database/31_client_master_propagate_to_open_records.sql).

const MASTER_COLUMNS = "uuid, company_name, gst_number, billing_address, company_group_name, sc_name";

const clean = (v) => String(v ?? "").trim();
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// Records link to the master by company name (no FK). Exact match first, then
// case-insensitive, the same convention syncClientOnOrderConversion uses.
export async function fetchMasterByName(companyName) {
  const name = clean(companyName);
  if (!name) return null;
  const exact = await supabase.from("lto_client_master").select(MASTER_COLUMNS).eq("company_name", name).limit(1);
  if (exact.error) throw exact.error;
  if (exact.data?.length) return exact.data[0];
  const loose = await supabase.from("lto_client_master").select(MASTER_COLUMNS).ilike("company_name", escapeLike(name)).limit(1);
  if (loose.error) throw loose.error;
  return loose.data?.[0] || null;
}

// True when another master row already uses this company name.
export async function masterNameTaken(companyName, exceptUuid) {
  const { data, error } = await supabase
    .from("lto_client_master")
    .select("uuid")
    .ilike("company_name", escapeLike(clean(companyName)))
    .limit(5);
  if (error) throw error;
  return (data || []).some((r) => r.uuid !== exceptUuid);
}

const FIELDS = [
  { form: "gstNumber", column: "gst_number", label: "GST Number" },
  { form: "billingAddress", column: "billing_address", label: "Billing Address" },
  { form: "groupName", column: "company_group_name", label: "Company Group" },
];

// Master changes implied by the edit. A field counts only when the user
// actually changed it in this modal (edited vs original) AND it differs from
// the master, so an untouched field that happens to be stale on the record
// can never overwrite the master.
export function masterChangesFromEdit({ master, edited, original, renameTo }) {
  const changes = [];
  if (renameTo && clean(renameTo) !== clean(master.company_name)) {
    changes.push({ column: "company_name", label: "Company Name", from: master.company_name, to: clean(renameTo) });
  }
  FIELDS.forEach(({ form, column, label }) => {
    const next = clean(edited[form]);
    if (next === clean(original[form])) return;
    if (next === clean(master[column])) return;
    changes.push({ column, label, from: clean(master[column]), to: next });
  });
  return changes;
}

export async function applyMasterChanges(masterUuid, changes) {
  const payload = {};
  changes.forEach((c) => {
    payload[c.column] = c.to || null;
  });
  payload.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("lto_client_master").update(payload).eq("uuid", masterUuid).select("uuid").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Client Master row was not updated (it may have been deleted). Please refresh.");
}

export function describeMasterChanges(changes) {
  return changes.map((c) => `${c.label}: "${c.from || "-"}" -> "${c.to || "-"}"`).join("\n");
}
