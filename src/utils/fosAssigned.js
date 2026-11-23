// Enquiries / leads an admin assigns to field persons for a visit.
// Table + RPC: Database/37_assigned_to_field_person.sql.
import supabase from "./supabase";

const TABLE = "lto_assigned_to_field_person";

export const CLIENT_TYPES = ["NBD", "Existing"];

// "YYYY-MM-DDTHH:mm" (datetime-local) <-> the timestamp the table keeps (no timezone shift).
export const toInputDateTime = (v) => (v ? String(v).replace(" ", "T").slice(0, 16) : "");

const dropdown = async (category) => {
  const { data, error } = await supabase.from("lto_dropdown").select("value").eq("category", category).order("value", { ascending: true });
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.value).filter(Boolean))];
};
export const fetchNobOptions = () => dropdown("nob");

// Field person names: Consignor Details "reference_name".
export async function fetchFieldPersonNames() {
  const { data, error } = await supabase.from("lto_consignor_details").select("reference_name").not("reference_name", "is", null);
  if (error) throw error;
  const names = (data || []).map((r) => String(r.reference_name || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export async function fetchAssignment(sourceType, recordId) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("source_type", sourceType).eq("record_id", recordId).maybeSingle();
  if (error) throw error;
  return data;
}

// One row per enquiry / lead: assigning again updates it (status resets to Open unless explicitly set).
export async function saveAssignment(payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ status: "Open", ...payload, updated_at: new Date().toISOString() }, { onConflict: "source_type,record_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

// Close the assignment for a person+company (called from Field Sales Form on submit).
export async function closeAssignmentByPersonAndCompany(personName, companyName) {
  const { error } = await supabase
    .from(TABLE)
    .update({ status: "Closed", updated_at: new Date().toISOString() })
    .eq("status", "Open")
    .eq("company_name", companyName)
    .contains("assigned_to", [personName]);
  if (error) throw error;
}

// Open assignments for a given person (used by Field Sales Form company dropdown).
export async function fetchOpenAssignmentsForPerson(personName) {
  if (!personName) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, company_name")
    .eq("status", "Open")
    .contains("assigned_to", [personName]);
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.company_name).filter(Boolean))];
}

export async function deleteAssignment(id) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

// names: null = everyone. Returns { total, rows }.
export async function listAssigned({ names = null, search = "", from = null, to = null, limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc("lto_fos_assigned_list", {
    p_names: names,
    p_search: search || null,
    p_from: from || null,
    p_to: to || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return { total: data?.total || 0, rows: data?.rows || [] };
}

// Names whose assignments the signed-in user may see (null = all, for admin).
export const namesForUser = (isAdmin, currentUser) =>
  isAdmin ? null : [currentUser?.fullName, currentUser?.username].filter(Boolean);
