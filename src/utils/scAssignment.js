// Decides SC (and, for group companies, CRE) for a brand-new company that
// isn't in lto_client_master yet -- shared by Leads.jsx and
// DirectEnquiryForm.jsx so both compute and insert the SAME values
// atomically into their lto_client_master row.
//
// Leads.jsx previously computed this via a separate useEffect writing to
// React state, gated on Sales Type + NOB + company name all being filled
// and clientMasterRecords already loaded -- if that effect hadn't resolved
// by the time the user submitted, the new company/lead silently got
// sc_name = null with no error surfaced. This replaces that with a single
// atomic call made from inside the submit handler itself, matching the
// pattern DirectEnquiryForm.jsx already used correctly.

import supabase from "./supabase";

const OTHER_CLIENTS_GROUP = "OTHER CLIENTS";

export const isOtherClientsGroup = (groupName) =>
  (groupName || "").trim().toUpperCase() === OTHER_CLIENTS_GROUP;

/**
 * Rule:
 *   - groupName is set and isn't the "OTHER CLIENTS" catch-all: copy
 *     sc_name AND crm_name from the most recently CREATED existing company
 *     in that same group (skips rows with no sc_name at all -- if none of
 *     the group's companies have an SC yet, falls through to the
 *     round-robin below instead of propagating a blank).
 *   - Otherwise (no group, or "OTHER CLIENTS"): run the sc_distribution
 *     round-robin (sales_type + lead_source + nob matching, advancing the
 *     is_next_in_line pointer) for SC. CRE is left null -- it's only ever
 *     assigned later, at order-conversion time (see orderConversionClientSync.js).
 *
 * Returns { scName, crmName } -- crmName is null unless the group-copy
 * path applied and that company actually had one set.
 */
export const resolveScAndCreForNewCompany = async ({ groupName, salesType, leadSource, nob }) => {
  const trimmedGroup = (groupName || "").trim();

  if (trimmedGroup && !isOtherClientsGroup(trimmedGroup)) {
    try {
      const { data: groupClients, error } = await supabase
        .from("lto_client_master")
        .select("sc_name, crm_name")
        .ilike("company_group_name", trimmedGroup)
        .not("sc_name", "is", null)
        .not("sc_name", "eq", "")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!error && groupClients && groupClients.length > 0) {
        return { scName: groupClients[0].sc_name || null, crmName: groupClients[0].crm_name || null };
      }
    } catch (err) {
      console.error("resolveScAndCreForNewCompany: error checking group SC/CRE", err);
    }
  }

  // Fall back to round-robin sc_distribution rules -- SC only, CRE stays null.
  try {
    const { data: activeRules, error } = await supabase
      .from("lto_sc_distribution")
      .select("*")
      .order("sequence_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!error && activeRules && activeRules.length > 0) {
      const currentNob = (nob || "").trim().toUpperCase();
      const currentSource = (leadSource || "").trim().toUpperCase();
      const currentType = (salesType || "").trim().toUpperCase();

      const pool = activeRules.filter((rule) => {
        const types = (rule.sales_types || []).map((t) => t.toUpperCase());
        const sources = (rule.lead_sources || []).map((s) => s.toUpperCase());
        const nobs = (rule.nobs || []).map((n) => n.toUpperCase());

        const typeMatch = types.length === 0 || types.includes(currentType);
        const sourceMatch = sources.length === 0 || sources.includes("ALL SOURCES") || sources.includes(currentSource);
        const nobMatch = nobs.some((n) => {
          if (n === "ALL NOBS") return true;
          if (n === "ALL NOBS (EXCEPT RESELLER)") return currentNob !== "RESELLER";
          return n === currentNob;
        });

        return typeMatch && sourceMatch && nobMatch;
      });

      if (pool.length > 0) {
        const candidate = pool.find((r) => r.is_next_in_line) || pool[0];

        if (pool.length > 1 && candidate?.id) {
          const currentIndex = pool.findIndex((item) => item.id === candidate.id);
          const nextIndex = (currentIndex + 1) % pool.length;
          const nextItem = pool[nextIndex];

          if (candidate.id !== nextItem.id) {
            await supabase.from("lto_sc_distribution").update({ is_next_in_line: false }).eq("id", candidate.id);
          }
          await supabase.from("lto_sc_distribution").update({ is_next_in_line: true, updated_at: new Date().toISOString() }).eq("id", nextItem.id);
        }

        return { scName: candidate?.sc_name || null, crmName: null };
      }
    }
  } catch (err) {
    console.error("resolveScAndCreForNewCompany: error evaluating sc_distribution rules", err);
  }

  return { scName: null, crmName: null };
};
