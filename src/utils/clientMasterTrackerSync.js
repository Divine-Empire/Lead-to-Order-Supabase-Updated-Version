import supabase from "./supabase";

// Recomputes lto_client_master.already_in_tracker + is_newly_converted for a
// single company from the CURRENT real state of its enquiries/leads/
// trackers, and writes the result. Call this for a company_name any time an
// enquiry or lead belonging to it is created, or its company_name is
// changed -- for a rename, call it for BOTH the old and the new name, so a
// stale tag never gets left behind on the row it moved away from (that
// stale-row bug is why this exists: every site that wrote already_in_tracker
// before only ever touched the CURRENT company_name's row, never the one a
// record used to belong to).
export async function recomputeAlreadyInTracker(companyName) {
  const name = (companyName || "").trim();
  if (!name) return;

  const events = [];

  const { data: enquiries, error: enqErr } = await supabase
    .from("lto_enquiries")
    .select("id, enquiry_no, created_at")
    .ilike("company_name", name);
  if (enqErr) {
    console.error("recomputeAlreadyInTracker: failed to fetch enquiries:", enqErr);
    return;
  }

  for (const e of enquiries || []) {
    events.push({ ts: new Date(e.created_at).getTime(), label: `Enquiry Tracker (${e.enquiry_no})`, isConversion: false });
    const { data: trackers } = await supabase
      .from("lto_enquiry_tracker")
      .select("is_order_received_status, created_at")
      .eq("enquiry_id", e.id);
    for (const t of trackers || []) {
      if (t.is_order_received_status === "yes") {
        events.push({ ts: new Date(t.created_at).getTime(), label: `Order Received (${e.enquiry_no})`, isConversion: true });
      } else if (t.is_order_received_status === "no") {
        events.push({ ts: new Date(t.created_at).getTime(), label: `Order Lost (${e.enquiry_no})`, isConversion: false });
      }
    }
  }

  const { data: leads, error: leadErr } = await supabase
    .from("lto_leads")
    .select("id, lead_no, created_at")
    .ilike("company_name", name);
  if (leadErr) {
    console.error("recomputeAlreadyInTracker: failed to fetch leads:", leadErr);
    return;
  }

  for (const l of leads || []) {
    events.push({ ts: new Date(l.created_at).getTime(), label: `Call-Tracker (${l.lead_no})`, isConversion: false });
    const { data: leadTrackers } = await supabase
      .from("lto_enquiry_tracker_for_leads")
      .select("is_order_received_status, created_at")
      .eq("lead_id", l.id);
    for (const t of leadTrackers || []) {
      if (t.is_order_received_status === "yes") {
        events.push({ ts: new Date(t.created_at).getTime(), label: `Order Received (${l.lead_no})`, isConversion: true });
      } else if (t.is_order_received_status === "no") {
        events.push({ ts: new Date(t.created_at).getTime(), label: `Order Lost (${l.lead_no})`, isConversion: false });
      } else {
        events.push({ ts: new Date(t.created_at).getTime(), label: `Enquiry Tracker (${l.lead_no})`, isConversion: false });
      }
    }
  }

  events.sort((a, b) => b.ts - a.ts);
  const latest = events[0];
  const alreadyInTracker = latest ? latest.label : null;
  // Only "newly converted" if the latest event is a conversion AND nothing
  // (another lead/enquiry) has happened for this company since.
  const isNewlyConverted = !!(latest?.isConversion && !events.some((ev) => ev.ts > latest.ts));

  const { error: updateErr } = await supabase
    .from("lto_client_master")
    .update({ already_in_tracker: alreadyInTracker, is_newly_converted: isNewlyConverted })
    .ilike("company_name", name);
  if (updateErr) {
    console.error("recomputeAlreadyInTracker: failed to update client_master for", name, updateErr);
  }
}

// Convenience wrapper for the common "company_name may have been renamed"
// case -- recomputes the new name always, and the old name too only if it
// actually differs, so the row the record moved away from gets its stale
// tag cleaned up instead of left dangling.
export async function recomputeAlreadyInTrackerForRename(oldCompanyName, newCompanyName) {
  const oldName = (oldCompanyName || "").trim();
  const newName = (newCompanyName || "").trim();
  if (newName) await recomputeAlreadyInTracker(newName);
  if (oldName && oldName.toLowerCase() !== newName.toLowerCase()) {
    await recomputeAlreadyInTracker(oldName);
  }
}
