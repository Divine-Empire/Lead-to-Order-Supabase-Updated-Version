// Edge Function: send-duplicate-entry-notification
//
// Notifies the users who have the "duplicate_entry" event (Settings > user >
// "Send this user messages for"; rules in lto_notification_rules, sent by
// _shared/notify.ts) when a new duplicate enquiry/lead log is created in lto_duplicate_enquiry_logs.
//
// Template body:
//   Hi {{1}},
//   Duplicate Entries Found.
//   Click below to show the Details.
//   https://new-lead-to-order-supabase.vercel.app/duplicate-logs
//   {{1}} Receiver name
//
// Secrets (Supabase > Edge Functions > Secrets):
//   WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
// optional:
//   WHATSAPP_DUPLICATE_ENTRIES_TEMPLATE (default "lto_duplicate_entries"),
//   WHATSAPP_TEMPLATE_LANGUAGE (default "en"),
//   WHATSAPP_API_VERSION (default "v21.0")
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase itself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatch } from "../_shared/notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { logId } = await req.json().catch(() => ({}));

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // If logId is passed, claim it so two concurrent calls don't send duplicate alerts
    if (logId) {
      try {
        const { data: logRow, error: logErr } = await db
          .from("lto_duplicate_enquiry_logs")
          .select("id, wa_notified_at")
          .eq("id", logId)
          .maybeSingle();

        if (logErr) console.warn("Could not check duplicate log:", logErr.message);
        if (logRow?.wa_notified_at) {
          return json({ success: true, sent: 0, skipped: "already_notified" });
        }

        // Claim notification
        const { data: claimed } = await db
          .from("lto_duplicate_enquiry_logs")
          .update({ wa_notified_at: new Date().toISOString() })
          .eq("id", logId)
          .is("wa_notified_at", null)
          .select("id");

        if (claimed && claimed.length === 0) {
          return json({ success: true, sent: 0, skipped: "already_notified" });
        }
      } catch (checkErr) {
        // If wa_notified_at column doesn't exist yet, proceed with sending
        console.warn("Claim check skipped:", checkErr);
      }
    }

    const result = await dispatch(db, "duplicate_entry", {}, { dedupeKey: logId ?? null });

    // Nobody got it: release the claim so a later call can try again.
    if (!result.sent && logId) {
      await db.from("lto_duplicate_enquiry_logs").update({ wa_notified_at: null }).eq("id", logId).catch(() => {});
    }

    return json({
      success: !!result.sent,
      sent: result.sent ?? 0,
      failed: result.failed ?? [],
      skipped: result.skipped,
      error: result.sent ? undefined : (result.failed?.[0]?.error ?? result.error ?? "No message could be sent"),
    });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

