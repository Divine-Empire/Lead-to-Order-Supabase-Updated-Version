import supabase from "./supabase";

// Asks the send-field-assignment-whatsapp Edge Function to WhatsApp the assigned field
// person(s) (template "lto_enquiry_assignment_to_field_person"). The function records
// success / failure on the assignment row (wa_status, wa_sent_at, wa_error, wa_results).
//   event: "new" | "changed" | "resend"   (see the function's header for what each does)
// Never throws -- a WhatsApp problem must not undo or block the assignment itself.
export async function notifyFieldAssignment(assignmentId, event = "new", options = {}) {
  try {
    const { data, error } = await supabase.functions.invoke("send-field-assignment-whatsapp", {
      body: { assignmentId, event, ...options },
    });
    if (error) {
      console.error("Field assignment WhatsApp failed:", error);
      return { success: false, error: error.message };
    }
    if (!data?.success && !data?.skipped) {
      console.error("Field assignment WhatsApp failed:", data?.error || data?.failed);
      return { success: false, sent: data?.sent ?? 0, failed: data?.failed, error: data?.error || data?.failed?.[0]?.error };
    }
    return { success: true, sent: data.sent ?? 0, failed: data.failed || [], skipped: data.skipped };
  } catch (error) {
    console.error("Field assignment WhatsApp failed:", error);
    return { success: false, error: error.message };
  }
}
