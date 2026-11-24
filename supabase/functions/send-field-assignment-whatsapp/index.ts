// Edge Function: send-field-assignment-whatsapp
//
// WhatsApps each field person an enquiry / lead assignment
// (lto_assigned_to_field_person) with the "lto_enquiry_assignment_to_field_person"
// template, and records success / failure on the assignment row itself
// (wa_status, wa_sent_at, wa_error, wa_results -- Database/39_assignment_whatsapp_status.sql).
//
// Template (UTILITY, en) -- header "CLIENT VISIT ASSIGNMENT", footer "DIVINE EMPIRE INDIA PVT. LTD.", body:
//   Assigned By: {{1}}
//   Assigned To: {{2}}
//
//   Client: {{3}}
//   Contact Person: {{4}}
//   Mobile: {{5}}
//   Location: {{6}}
//
//   NOB: {{7}}
//   Project Value: {{8}}
//
//   Visit Date: {{9}}            e.g. "26/11/2026 to 28/11/2026" (or just "26/11/2026" for one day)
//
//   Please visit the client during the scheduled dates.
// (each placeholder is bold in the template: *{{1}}* ... *{{9}}*)
//
// Request body: { assignmentId, event, persons?, testPhone? }
//   event "new"     message the assigned persons who have not been messaged successfully yet
//   event "changed" message every assigned person (visit dates or the person list changed)
//   event "resend"  message the persons whose last attempt failed or who were never messaged
//   persons         optional: restrict to these names
//   testPhone       optional 10-digit number: send the first person's message there instead and do
//                   NOT touch the assignment row (for testing the approved template)
// Recipients: an assigned person is messaged only if the "Enquiry Assigned to Field Person" event
// (lto_notification_events.field_assignment) is ticked for their user in Settings. The user is
// found by Full Name (upper-cased, space-collapsed) and the number is login.whatsapp_number.
// Messages go to 91 + a valid 10-digit number; anything else (no such user, event not ticked,
// missing / invalid number) is recorded as failed with the reason.
//
// Secrets (already set for the other WhatsApp functions): WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
// optional: WHATSAPP_FIELD_ASSIGNMENT_TEMPLATE (default below), WHATSAPP_TEMPLATE_LANGUAGE (default "en"),
//   WHATSAPP_API_VERSION (default "v21.0")
// Deploy: supabase functions deploy send-field-assignment-whatsapp

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TEMPLATE_NAME = Deno.env.get("WHATSAPP_FIELD_ASSIGNMENT_TEMPLATE") ?? "lto_enquiry_assignment_to_field_person";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Template variables cannot be empty or hold line breaks / tabs / 4+ spaces.
const param = (value: unknown) => {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 900);
  return { type: "text", text: text || "-" };
};

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();

// from = meeting_at ("2026-11-26T00:00:00"), to = meeting_to ("2026-11-28")
//   -> "26/11/2026 to 28/11/2026", or "26/11/2026" when it is a single day
const visitDates = (from: unknown, to: unknown) => {
  const dmy = (v: unknown) => {
    const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  };
  const f = dmy(from);
  if (!f) return "-";
  const t = dmy(to);
  return t && t !== f ? `${f} to ${t}` : f;
};

const money = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  return Number.isFinite(n) ? `Rs. ${n.toLocaleString("en-IN")}` : "-";
};

type Result = { person: string; phone: string | null; status: "sent" | "failed"; wamid?: string | null; at: string; error?: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { assignmentId, event = "new", persons, testPhone } = await req.json().catch(() => ({}));
    if (!assignmentId) return json({ success: false, error: "assignmentId is required" }, 400);

    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    if (!token || !phoneNumberId) return json({ success: false, error: "WhatsApp credentials are not configured" }, 500);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: a, error: aErr } = await db.from("lto_assigned_to_field_person").select("*").eq("id", assignmentId).maybeSingle();
    if (aErr) throw aErr;
    if (!a) return json({ success: false, error: "Assignment not found" }, 404);

    const previous: Result[] = Array.isArray(a.wa_results) ? a.wa_results : [];
    const sentBefore = new Set(previous.filter((r) => r.status === "sent").map((r) => norm(r.person)));
    const only = Array.isArray(persons) && persons.length ? new Set(persons.map(norm)) : null;

    let targets: string[] = (a.assigned_to ?? []).filter((p: string) => !only || only.has(norm(p)));
    if (event !== "changed") targets = targets.filter((p) => !sentBefore.has(norm(p)));
    if (testPhone) targets = targets.slice(0, 1);
    if (!targets.length) return json({ success: true, sent: 0, skipped: "nobody_to_message" });

    // Recipients: a person is messaged only if the "Enquiry Assigned to Field Person" event
    // (field_assignment) is ticked for their user in Settings; the number is login.whatsapp_number.
    const [{ data: users, error: uErr }, { data: rules, error: rErr }, { data: ev }] = await Promise.all([
      db.from("login").select("id, full_name, whatsapp_number"),
      db.from("lto_notification_rules").select("login_id").eq("event_key", "field_assignment").eq("target_type", "user").eq("is_active", true),
      db.from("lto_notification_events").select("is_active").eq("event_key", "field_assignment").maybeSingle(),
    ]);
    if (uErr) throw uErr;
    if (rErr) throw rErr;
    if (!testPhone && ev && ev.is_active === false) return json({ success: true, sent: 0, skipped: "event_inactive" });
    const enabledIds = new Set((rules ?? []).map((r: { login_id: string }) => r.login_id));
    const userByName = new Map<string, { id: string; whatsapp_number: string | null }>(
      (users ?? []).map((u: { id: string; full_name: string; whatsapp_number: string | null }) => [norm(u.full_name), u]),
    );
    // Accept exactly 10 digits (optionally with a leading 91 / 0); never guess from a longer or shorter number.
    const cleanPhone = (raw?: string) => {
      let d = String(raw ?? "").replace(/\D/g, "");
      if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
      else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
      return /^[6-9]\d{9}$/.test(d) ? d : null;
    };

    const url = `https://graph.facebook.com/${Deno.env.get("WHATSAPP_API_VERSION") ?? "v21.0"}/${phoneNumberId}/messages`;
    const language = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";

    const results: Result[] = await Promise.all(
      targets.map(async (person): Promise<Result> => {
        const at = new Date().toISOString();
        const user = userByName.get(norm(person));
        if (!testPhone) {
          if (!user) return { person, phone: null, status: "failed", at, error: "No user with this name in Settings" };
          if (!enabledIds.has(user.id)) {
            return { person, phone: null, status: "failed", at, error: "Enquiry Assigned to Field Person is not ticked for this user in Settings" };
          }
        }
        const raw = user?.whatsapp_number ?? "";
        const phone = testPhone ? cleanPhone(String(testPhone)) : cleanPhone(raw);
        if (!phone) {
          return { person, phone: raw || null, status: "failed", at, error: raw ? "Invalid WhatsApp number in Settings" : "No WhatsApp number in Settings" };
        }
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: `91${phone}`,
              type: "template",
              template: {
                name: TEMPLATE_NAME,
                language: { code: language },
                components: [
                  {
                    type: "body",
                    parameters: [
                      param(a.assigned_by),
                      param(person),
                      param(a.company_name),
                      param(a.person_name),
                      param(a.contact_number),
                      param(a.address),
                      param(a.nob),
                      param(money(a.project_value)),
                      param(visitDates(a.meeting_at, a.meeting_to)),
                    ],
                  },
                ],
              },
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) return { person, phone, status: "failed", at, error: body?.error?.message ?? `HTTP ${res.status}` };
          return { person, phone, status: "sent", at, wamid: body?.messages?.[0]?.id ?? null };
        } catch (e) {
          return { person, phone, status: "failed", at, error: (e as Error).message };
        }
      }),
    );

    // A test send never touches the assignment's audit fields.
    if (testPhone) return json({ success: results[0]?.status === "sent", test: true, results });

    // Newest attempt per person wins; people who are no longer assigned are dropped.
    const byPerson = new Map<string, Result>();
    for (const r of previous) byPerson.set(norm(r.person), r);
    for (const r of results) byPerson.set(norm(r.person), r);
    const assignedNow = new Set((a.assigned_to ?? []).map(norm));
    const merged = [...byPerson.values()].filter((r) => assignedNow.has(norm(r.person)));
    const okCount = merged.filter((r) => r.status === "sent").length;
    const status = merged.length === 0 ? null : okCount === merged.length ? "sent" : okCount === 0 ? "failed" : "partial";
    const lastSent = results.filter((r) => r.status === "sent").map((r) => r.at).sort().pop();
    const lastError = results.filter((r) => r.status === "failed").map((r) => `${r.person}: ${r.error}`).join("; ") || null;

    const { error: uErr } = await db
      .from("lto_assigned_to_field_person")
      .update({
        wa_results: merged,
        wa_status: status,
        wa_sent_at: lastSent ?? a.wa_sent_at ?? null,
        wa_error: status === "sent" ? null : lastError ?? a.wa_error ?? null,
      })
      .eq("id", assignmentId);
    if (uErr) console.warn("Could not save WhatsApp status:", uErr.message);

    const sent = results.filter((r) => r.status === "sent").length;
    return json({
      success: sent > 0,
      sent,
      failed: results.filter((r) => r.status === "failed").map((r) => ({ person: r.person, error: r.error })),
      status,
    });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
