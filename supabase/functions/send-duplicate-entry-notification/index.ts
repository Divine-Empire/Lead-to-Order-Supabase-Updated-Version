// Edge Function: send-duplicate-entry-notification
//
// WhatsApps the active rows of lto_whatsapp_recipients (Master Data >
// WhatsApp Recipients) with the "lto_duplicate_entries" template when a
// new duplicate enquiry/lead log is created in lto_duplicate_enquiry_logs.
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

const TEMPLATE_NAME = Deno.env.get("WHATSAPP_DUPLICATE_ENTRIES_TEMPLATE") ?? "lto_duplicate_entries";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const param = (value: unknown) => {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return { type: "text", text: text || "-" };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { logId } = await req.json().catch(() => ({}));

    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    if (!token || !phoneNumberId) {
      return json({ success: false, error: "WhatsApp credentials are not configured" }, 500);
    }

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

    const { data: recipients, error: rErr } = await db
      .from("lto_whatsapp_recipients")
      .select("name, phone")
      .eq("is_active", true);

    if (rErr) throw rErr;
    if (!recipients?.length) {
      if (logId) {
        await db.from("lto_duplicate_enquiry_logs").update({ wa_notified_at: null }).eq("id", logId).catch(() => {});
      }
      return json({ success: true, sent: 0, skipped: "no_active_recipients" });
    }

    const url = `https://graph.facebook.com/${Deno.env.get("WHATSAPP_API_VERSION") ?? "v21.0"}/${phoneNumberId}/messages`;
    const language = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";

    const results = await Promise.all(
      recipients.map(async (r) => {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: `91${r.phone}`,
              type: "template",
              template: {
                name: TEMPLATE_NAME,
                language: { code: language },
                components: [
                  {
                    type: "body",
                    parameters: [
                      param(r.name),
                    ],
                  },
                ],
              },
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) return { name: r.name, success: false, error: body?.error?.message ?? `HTTP ${res.status}` };
          return { name: r.name, success: true };
        } catch (e) {
          return { name: r.name, success: false, error: (e as Error).message };
        }
      }),
    );

    const sent = results.filter((r) => r.success).length;
    if (sent === 0 && logId) {
      await db.from("lto_duplicate_enquiry_logs").update({ wa_notified_at: null }).eq("id", logId).catch(() => {});
    }

    return json({
      success: sent > 0,
      sent,
      failed: results.filter((r) => !r.success),
      error: sent === 0 ? results[0]?.error ?? "No message could be sent" : undefined,
    });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

