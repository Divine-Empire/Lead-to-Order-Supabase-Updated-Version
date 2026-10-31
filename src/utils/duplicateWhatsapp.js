import supabase from "./supabase";

// Asks the send-duplicate-entry-notification Edge Function to WhatsApp the
// Master > WhatsApp Recipients list ("lto_duplicate_entries" template)
// whenever a new duplicate enquiry/lead log is created in lto_duplicate_enquiry_logs.
// Never throws -- WhatsApp issues should not block lead/enquiry operations.
export async function notifyDuplicateEntryCreated(logId, options = {}) {
  try {
    const payload = typeof logId === "object" && logId !== null
      ? logId
      : { logId, ...options };

    const { data, error } = await supabase.functions.invoke("send-duplicate-entry-notification", {
      body: payload,
    });

    if (error) {
      console.error("Duplicate-entry WhatsApp notification failed:", error);
      return { success: false, error: error.message };
    }
    if (!data?.success) {
      console.error("Duplicate-entry WhatsApp notification failed:", data?.error);
      return { success: false, error: data?.error };
    }
    return { success: true, sent: data.sent ?? 0, skipped: data.skipped };
  } catch (error) {
    console.error("Duplicate-entry WhatsApp notification failed:", error);
    return { success: false, error: error.message };
  }
}

