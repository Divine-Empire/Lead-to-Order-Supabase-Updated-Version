// Edge Function: send-quotation-reference-changed
//
// WhatsApps the active rows of lto_whatsapp_recipients (Master Data >
// WhatsApp Recipients) with the "lto_quotation_reference_changed" template
// when a quotation REVISION is saved with a Reference Name different from the
// previous revision of the same root quotation.
//
// Template body:
//   Hi {{1}} Sir,
//   New quotation created with Reference Name: {{2}}, Quotation No: {{3}},
//   Quotation Copy: {{4}}, Company: {{5}}. Please verify. Thank You.
//   {{1}} recipient name  {{2}} Reference Name  {{3}} Quotation No
//   {{4}} PDF link        {{5}} Company
//
// The browser only sends { quotationNo }. Everything else (is it a revision,
// did the Reference Name change, was it already notified, who the recipients
// are) is decided here from the DB, so the endpoint cannot be used to send
// arbitrary text or to send twice for one quotation.
//
// Secrets (Supabase > Edge Functions > Secrets): the same Meta credentials
// the Service-Support functions use --
//   WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
// optional: WHATSAPP_TEMPLATE_LANGUAGE (default "en"), WHATSAPP_API_VERSION (default "v21.0")
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase itself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TEMPLATE_NAME = "lto_quotation_reference_changed";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Meta rejects template parameters containing newlines/tabs or 4+ spaces in a
// row, and empty parameters.
const param = (value: unknown) => {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return { type: "text", text: text || "-" };
};

const revisionOf = (quotationNo: string) => {
  const parts = quotationNo.split("-");
  if (parts.length === 5 && /^\d{2}$/.test(parts[4])) {
    return { root: parts.slice(0, 4).join("-"), rev: parseInt(parts[4], 10) };
  }
  return { root: quotationNo, rev: 0 };
};

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { quotationNo } = await req.json();
    if (typeof quotationNo !== "string" || !quotationNo.trim()) {
      return json({ success: false, error: "quotationNo is required" }, 400);
    }

    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    if (!token || !phoneNumberId) return json({ success: false, error: "WhatsApp credentials are not configured" }, 500);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: quotation, error: qErr } = await db
      .from("lto_make_quotations")
      .select("id, quotation_no, reference_name, pdf_url, consignee_client_id, wa_notified_at")
      .eq("quotation_no", quotationNo)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!quotation) return json({ success: false, error: "Quotation not found" }, 404);
    if (quotation.wa_notified_at) return json({ success: true, sent: 0, skipped: "already_notified" });

    const { root, rev } = revisionOf(quotation.quotation_no);
    if (rev === 0) return json({ success: true, sent: 0, skipped: "not_a_revision" });

    const newRef = String(quotation.reference_name ?? "").trim();
    if (!newRef) return json({ success: true, sent: 0, skipped: "no_reference_name" });

    // Previous revision = the highest earlier revision of the same root
    // (the root quotation itself counts as revision 0).
    const { data: siblings, error: sErr } = await db
      .from("lto_make_quotations")
      .select("quotation_no, reference_name")
      .like("quotation_no", `${root}%`);
    if (sErr) throw sErr;
    let previous: { rev: number; reference_name: string | null } | null = null;
    for (const s of siblings ?? []) {
      const r = revisionOf(s.quotation_no);
      if (r.root !== root || r.rev >= rev) continue;
      if (!previous || r.rev > previous.rev) previous = { rev: r.rev, reference_name: s.reference_name };
    }
    if (!previous) return json({ success: true, sent: 0, skipped: "no_previous_revision" });
    if (norm(previous.reference_name) === norm(newRef)) return json({ success: true, sent: 0, skipped: "reference_unchanged" });

    // Claim the notification first so two concurrent calls cannot both send.
    const { data: claimed, error: cErr } = await db
      .from("lto_make_quotations")
      .update({ wa_notified_at: new Date().toISOString() })
      .eq("id", quotation.id)
      .is("wa_notified_at", null)
      .select("id");
    if (cErr) throw cErr;
    if (!claimed?.length) return json({ success: true, sent: 0, skipped: "already_notified" });

    const { data: recipients, error: rErr } = await db
      .from("lto_whatsapp_recipients")
      .select("name, phone")
      .eq("is_active", true);
    if (rErr) throw rErr;
    if (!recipients?.length) {
      await db.from("lto_make_quotations").update({ wa_notified_at: null }).eq("id", quotation.id);
      return json({ success: true, sent: 0, skipped: "no_active_recipients" });
    }

    let company = "";
    if (quotation.consignee_client_id) {
      const { data: client } = await db
        .from("lto_client_master")
        .select("company_name")
        .eq("uuid", quotation.consignee_client_id)
        .maybeSingle();
      company = client?.company_name ?? "";
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
                      param(newRef),
                      param(quotation.quotation_no),
                      param(quotation.pdf_url || "PDF not available"),
                      param(company),
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
    // Nobody got it: release the claim so a later save/retry can try again.
    if (sent === 0) await db.from("lto_make_quotations").update({ wa_notified_at: null }).eq("id", quotation.id);

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
