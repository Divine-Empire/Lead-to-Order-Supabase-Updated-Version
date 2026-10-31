import supabase from "./supabase";

// Asks the send-quotation-reference-changed Edge Function to WhatsApp the
// Master > WhatsApp Recipients list ("lto_quotation_reference_changed"
// template). Call it after a quotation REVISION is saved and its PDF url
// stored. The function itself checks that the Reference Name really changed
// from the previous revision and that this quotation was not notified yet, so
// calling it is always safe. Never throws -- a WhatsApp problem must not
// affect the (already saved) quotation. Meta credentials stay server-side.
export async function notifyReferenceNameChanged(quotationNo, options = {}) {
  try {
    const payload = typeof quotationNo === "object" && quotationNo !== null
      ? quotationNo
      : { quotationNo, ...options };

    const { data, error } = await supabase.functions.invoke("send-quotation-reference-changed", {
      body: payload,
    });
    if (error) {
      console.error("Reference-name WhatsApp notification failed:", error);
      return { success: false, error: error.message };
    }
    if (!data?.success) {
      console.error("Reference-name WhatsApp notification failed:", data?.error);
      return { success: false, error: data?.error };
    }
    return { success: true, sent: data.sent ?? 0, skipped: data.skipped };
  } catch (error) {
    console.error("Reference-name WhatsApp notification failed:", error);
    return { success: false, error: error.message };
  }
}
