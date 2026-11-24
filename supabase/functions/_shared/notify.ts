// Shared notification dispatcher (WhatsApp via Meta + email via Resend).
//
// Reads lto_notification_events / lto_notification_rules (Database/43_notification_rules.sql)
// and the contact details on public.login (whatsapp_number, email, position), then sends
// and records every attempt in lto_notification_log.
//
//   dispatch(db, "quotation_reference_changed", { company_name: "...", ... }, { dedupeKey: "Q-1-01" })
//
// Secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID (already set),
//          RESEND_API_KEY, RESEND_FROM  e.g. "Divine Empire <alerts@yourdomain.com>"  (email only)
// optional: WHATSAPP_TEMPLATE_LANGUAGE (default "en"), WHATSAPP_API_VERSION (default "v21.0")

// deno-lint-ignore no-explicit-any
type Db = any;

export type Payload = Record<string, unknown>;
export type DispatchOptions = {
  dedupeKey?: string | null; // a person gets this event + key once per channel
  testTo?: { whatsapp?: string; email?: string }; // send only the first matched person's message here; nothing is logged as sent to them
};
export type Attempt = {
  login_id: string | null;
  recipient_name: string;
  channel: "whatsapp" | "email";
  address: string | null;
  status: "sent" | "failed" | "skipped";
  error?: string | null;
  provider_id?: string | null;
};

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// Meta rejects empty parameters, newlines/tabs and 4+ spaces in a row.
const waParam = (value: unknown) => {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 900);
  return { type: "text", text: text || "-" };
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fill = (template: string, values: Record<string, unknown>) =>
  template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => String(values[k] ?? "-"));

const firstName = (full: string) => {
  const w = String(full ?? "").trim().split(/\s+/)[0] ?? "";
  return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "there";
};

// Every condition ({field: [allowed values]}) must match the payload; an empty list means "any".
const matches = (conditions: Record<string, unknown> | null, payload: Payload) =>
  Object.entries(conditions ?? {}).every(([field, allowed]) => {
    const list = Array.isArray(allowed) ? allowed : [allowed];
    if (!list.length) return true;
    return list.some((a) => norm(a) === norm(payload[field]));
  });

export type DispatchResult = {
  success: boolean;
  sent?: number;
  skipped?: string;
  error?: string;
  failed?: { person: string; channel: string; status: string; error?: string | null }[];
  attempts: Attempt[];
};

export async function dispatch(db: Db, eventKey: string, payload: Payload, opts: DispatchOptions = {}): Promise<DispatchResult> {
  const { data: event, error: eErr } = await db.from("lto_notification_events").select("*").eq("event_key", eventKey).maybeSingle();
  if (eErr) throw eErr;
  if (!event) return { success: false, error: `Unknown event "${eventKey}"`, attempts: [] as Attempt[] };
  if (!event.is_active) return { success: true, sent: 0, skipped: "event_inactive", attempts: [] as Attempt[] };

  const { data: rules, error: rErr } = await db
    .from("lto_notification_rules").select("*").eq("event_key", eventKey).eq("is_active", true);
  if (rErr) throw rErr;

  const { data: logins, error: lErr } = await db
    .from("login").select("id, full_name, position, whatsapp_number, email");
  if (lErr) throw lErr;
  const byId = new Map<string, any>((logins ?? []).map((l: any) => [l.id, l]));

  // person -> channels, merged across every matching rule
  const wanted = new Map<string, Set<"whatsapp" | "email">>();
  for (const rule of rules ?? []) {
    if (!matches(rule.conditions, payload)) continue;
    const people = rule.target_type === "user"
      ? [byId.get(rule.login_id)].filter(Boolean)
      : (logins ?? []).filter((l: any) => norm(l.position) === norm(rule.position));
    const chans = rule.channel === "both" ? ["whatsapp", "email"] : [rule.channel];
    for (const p of people) {
      const set = wanted.get(p.id) ?? new Set();
      for (const c of chans) if ((event.channels ?? []).includes(c)) set.add(c as "whatsapp" | "email");
      wanted.set(p.id, set);
    }
  }
  if (!wanted.size) return { success: true, sent: 0, skipped: "no_matching_rules", attempts: [] as Attempt[] };

  // Already delivered for this dedupe key?
  const done = new Set<string>();
  if (opts.dedupeKey && !opts.testTo) {
    const { data: prior } = await db.from("lto_notification_log").select("login_id, channel")
      .eq("event_key", eventKey).eq("dedupe_key", opts.dedupeKey).eq("status", "sent");
    for (const p of prior ?? []) done.add(`${p.login_id}|${p.channel}`);
  }

  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const waUrl = `https://graph.facebook.com/${Deno.env.get("WHATSAPP_API_VERSION") ?? "v21.0"}/${phoneNumberId}/messages`;
  const language = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM");

  const sendWhatsapp = async (to: string, values: Record<string, unknown>) => {
    if (!event.wa_template) throw new Error("No WhatsApp template set for this event");
    if (!token || !phoneNumberId) throw new Error("WhatsApp credentials are not configured");
    const res = await fetch(waUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: `91${to}`,
        type: "template",
        template: {
          name: event.wa_template,
          language: { code: language },
          components: [{ type: "body", parameters: (event.wa_params ?? []).map((k: string) => waParam(values[k])) }],
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    return String(body?.messages?.[0]?.id ?? "");
  };

  const sendEmail = async (to: string, values: Record<string, unknown>) => {
    if (!resendKey || !resendFrom) throw new Error("Email is not configured (RESEND_API_KEY / RESEND_FROM)");
    if (!event.email_subject || !event.email_body) throw new Error("No email text set for this event");
    const html = escapeHtml(fill(event.email_body, values)).replace(/\n/g, "<br>");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: resendFrom, to: [to], subject: fill(event.email_subject, values), html }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
    return String(body?.id ?? "");
  };

  const attempts: Attempt[] = [];
  const jobs: Promise<void>[] = [];
  let tested = false;

  for (const [loginId, chans] of wanted) {
    const person = byId.get(loginId);
    const values = { ...payload, recipient_name: firstName(person.full_name), recipient_full_name: person.full_name };
    for (const channel of chans) {
      if (opts.testTo && tested) continue;
      if (done.has(`${loginId}|${channel}`)) continue;
      const address = opts.testTo ? opts.testTo[channel] ?? null : channel === "whatsapp" ? person.whatsapp_number : person.email;
      const base = { login_id: loginId as string | null, recipient_name: person.full_name as string, channel, address };
      if (!address) {
        attempts.push({ ...base, status: "skipped", error: channel === "whatsapp" ? "No WhatsApp number on the user" : "No email on the user" });
        continue;
      }
      jobs.push((async () => {
        try {
          const id = channel === "whatsapp" ? await sendWhatsapp(address, values) : await sendEmail(address, values);
          attempts.push({ ...base, status: "sent", provider_id: id || null });
        } catch (e) {
          attempts.push({ ...base, status: "failed", error: (e as Error).message });
        }
      })());
    }
    if (opts.testTo && jobs.length) tested = true;
  }
  await Promise.all(jobs);

  if (!opts.testTo && attempts.length) {
    const { error } = await db.from("lto_notification_log").insert(
      attempts.map((a) => ({ ...a, event_key: eventKey, dedupe_key: opts.dedupeKey ?? null, payload })),
    );
    if (error) console.warn("Could not write notification log:", error.message);
  }

  const sent = attempts.filter((a) => a.status === "sent").length;
  return {
    success: sent > 0,
    sent,
    failed: attempts.filter((a) => a.status !== "sent").map((a) => ({ person: a.recipient_name, channel: a.channel, status: a.status, error: a.error })),
    attempts,
  };
}
