import supabase from "./supabase";
import { notifyDuplicateEntryCreated } from "./duplicateWhatsapp";

// Writes the duplicate-enquiry log (lto_duplicate_enquiry_logs) for a lead /
// enquiry that was just created although the company already had open ones.
// Goes through the create_duplicate_enquiry_log RPC (Database/28_...sql): it
// finds the company by name and reads its SC / CRM itself.
// Resolves the log id, or null when there was nothing to log (company not in
// the client master, or this record already has a log). Throws on a DB error --
// callers treat logging as best-effort and must not block the creation.
export async function logDuplicateEnquiry({ companyName, newRecordType, newRecordId, newRecordNo, createdBy, openRecords }) {
  if (!openRecords || openRecords.length === 0 || !newRecordId) return null;

  // What the confirmation dialog showed, frozen at this moment.
  const snapshot = openRecords.map((r) => ({
    key: r.key,
    sourceType: r.sourceType,
    recordId: r.recordId,
    number: r.number,
    createdAt: r.createdAt,
    referencePerson: r.referencePerson,
    quotationNo: r.quotationNo,
    lastFollowUpAt: r.lastFollowUpAt,
    lastFollowUpSource: r.lastFollowUpSource,
    items: r.items,
    itemsSource: r.itemsSource,
  }));

  const { data, error } = await supabase.rpc("create_duplicate_enquiry_log", {
    p_company_name: companyName,
    p_new_record_type: newRecordType,
    p_new_record_id: newRecordId,
    p_new_record_no: newRecordNo || null,
    p_created_by: createdBy || null,
    p_open_records: snapshot,
  });
  if (error) throw error;

  // When a new log was created, alert admins via WhatsApp (fire-and-forget).
  if (data) {
    notifyDuplicateEntryCreated(data).catch((err) => {
      console.warn("Could not send duplicate entry WhatsApp notification:", err);
    });
  }

  return data;
}
