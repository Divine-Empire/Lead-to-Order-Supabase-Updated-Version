// Edge Function: notify
//
// Rule-based WhatsApp / email notifications. Who receives an event, on which channel and
// under which conditions comes from Master Data (lto_notification_rules); contact details
// come from the login table. The caller only names the event and gives the values that
// fill its template -- it cannot choose recipients or free text.
//
// Request body: { event, payload?, dedupeKey?, testTo? }
//   event      key from lto_notification_events
//   payload    flat map of values for the template / email and for rule conditions
//   dedupeKey  optional: each person gets this event + key once per channel
//   testTo     optional { whatsapp?: "10 digits", email?: "a@b.com" }: sends only the first
//              matching person's message there and logs nothing
//
// Secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, RESEND_API_KEY, RESEND_FROM
// Deploy:  supabase functions deploy notify

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
    const { event, payload, dedupeKey, testTo } = await req.json().catch(() => ({}));
    if (typeof event !== "string" || !event.trim()) return json({ success: false, error: "event is required" }, 400);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const result = await dispatch(db, event.trim(), payload && typeof payload === "object" ? payload : {}, { dedupeKey, testTo });
    // attempts hold phone numbers / emails: the browser only needs the summary.
    const { attempts: _attempts, ...summary } = result;
    return json(summary, result.success || !("error" in result) ? 200 : 400);
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
