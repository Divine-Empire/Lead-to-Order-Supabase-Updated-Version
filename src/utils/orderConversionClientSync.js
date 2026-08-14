// Client Master sync that runs when an enquiry/lead's order status flips to
// "yes" -- extracted from EnquiryTrackerForm.jsx's Order Status submit
// handler (its only previous caller) so it can also be called from
// EnquiryTracker.jsx's two inline-edit paths that can set the same flag but
// never ran this logic at all. Behavior is preserved exactly as it was in
// EnquiryTrackerForm.jsx -- this is a relocation, not a redesign:
//
//   1. SC reassignment on conversion: NBD -> NBD_CRR sales-type upgrade,
//      then re-resolve SC via group-copy (Priority 1) or sc_distribution
//      round-robin (Priority 2) -- same two-priority shape as
//      scAssignment.js's resolveScAndCreForNewCompany, but re-evaluated at
//      conversion time against the upgraded sales type.
//   2. CRM/CRE distribution: Group tier (Priority 1) -> State-NOB tier
//      (Priority 2, scored match) -> round-robin through the matched
//      rule's crm_names[]. Only runs if crm_name isn't already set --
//      which is what makes group-copied CRE (assigned back at company
//      creation, see scAssignment.js) a no-op here, and "OTHER CLIENTS"
//      companies (which deliberately have no CRE yet) get one assigned
//      for the first time right now, at conversion.
//   3. Upserts lto_client_master, syncs crm_name back to the lead/enquiry
//      record, and triggers client code generation.

import supabase from "./supabase";
import { generateAndAssignClientCode } from "../pages/Master/ClientCodeGen";

/**
 * @param {string} enquiryNo - "EN-..." or "LD-..." identifier. Everything
 *   else needed is resolved internally from this one value, same as the
 *   original inline code did.
 * @returns {Promise<{ scName: string, crmName: string|null }>} whatever got
 *   resolved/assigned, in case a caller wants to reflect it in the UI.
 *   Never throws -- logs and returns best-effort values on failure, same
 *   as the original code's try/catch-per-step shape.
 */
export const syncClientOnOrderConversion = async (enquiryNo) => {
  let resolvedHandlePerson = "";
  let assignedCrmName = null;

  try {
    let leadData = null;
    let enqData = null;

    if (enquiryNo && enquiryNo.toUpperCase().startsWith("LD-")) {
      const { data: ld } = await supabase
        .from("lto_leads")
        .select("sc_name, company_name, person_name, phone_number, email_address, location, state, address, gst_number, company_group_name, nob, crm_name, sales_type, lead_source")
        .eq("lead_no", enquiryNo)
        .maybeSingle();
      leadData = ld;
    } else {
      const { data: ed } = await supabase
        .from("lto_enquiries")
        .select("company_name, sales_coordinator_name, sales_person_name, phone_number, email, location, enquiry_for_state, shipping_address, gst_number, crm_name, sales_type, lead_source, nob")
        .eq("enquiry_no", enquiryNo)
        .maybeSingle();
      enqData = ed;
    }

    resolvedHandlePerson = leadData?.sc_name || leadData?.handle_person || enqData?.sales_coordinator_name || "";

    const clientName = leadData?.person_name || leadData?.salesperson_name || enqData?.sales_person_name || enqData?.sales_coordinator_name || enqData?.scName || "";
    const compName = (leadData?.company_name || enqData?.company_name || enqData?.companyName || "").trim();

    if (!compName) {
      console.warn("syncClientOnOrderConversion: no company name found, skipping client_master sync");
      return { scName: resolvedHandlePerson, crmName: null };
    }

    const { data: clientMatches } = await supabase
      .from("lto_client_master")
      .select("uuid, company_name, crm_name, company_group_name, sales_type, sc_name, state")
      .ilike("company_name", compName)
      .limit(1);
    const existingClient = clientMatches && clientMatches.length > 0 ? clientMatches[0] : null;

    // Sales Type Upgrade & Dynamic SC Reassignment upon Order Conversion
    let currentSalesType = (existingClient?.sales_type || leadData?.sales_type || enqData?.sales_type || "").trim();
    let targetSalesType = currentSalesType.toUpperCase() === "NBD" ? "NBD_CRR" : currentSalesType;
    const targetGroup = (existingClient?.company_group_name || leadData?.company_group_name || enqData?.company_group_name || "").trim();

    let assignedScFromGroup = false;
    if (targetGroup) {
      try {
        const { data: groupClients } = await supabase
          .from("lto_client_master")
          .select("sc_name")
          .ilike("company_group_name", targetGroup)
          .not("sc_name", "is", null)
          .not("sc_name", "eq", "")
          .order("updated_at", { ascending: false })
          .limit(1);

        if (groupClients && groupClients.length > 0 && groupClients[0].sc_name) {
          resolvedHandlePerson = groupClients[0].sc_name;
          assignedScFromGroup = true;
        }
      } catch (groupErr) {
        console.error("syncClientOnOrderConversion: error fetching group SC during order conversion", groupErr);
      }
    }

    if (!assignedScFromGroup) {
      try {
        const { data: activeRules } = await supabase
          .from("lto_sc_distribution")
          .select("*")
          .order("sequence_order", { ascending: true })
          .order("created_at", { ascending: true });

        if (activeRules && activeRules.length > 0) {
          const currentNob = (leadData?.nob || enqData?.nob || "").trim().toUpperCase();
          const currentSource = (leadData?.lead_source || enqData?.lead_source || "").trim().toUpperCase();
          const currentType = targetSalesType.toUpperCase();

          const matchedRules = activeRules.filter((rule) => {
            const types = (rule.sales_types || []).map((t) => t.toUpperCase());
            const sources = (rule.lead_sources || []).map((s) => s.toUpperCase());
            const nobs = (rule.nobs || []).map((n) => n.toUpperCase());

            const typeMatch = types.length === 0 || types.includes(currentType);
            const sourceMatch = sources.length === 0 || sources.includes("ALL SOURCES") || sources.includes(currentSource);
            const nobMatch = nobs.length === 0 || nobs.some((n) => {
              if (n === "ALL NOBS") return true;
              if (n === "ALL NOBS (EXCEPT RESELLER)") return currentNob !== "RESELLER";
              return n === currentNob;
            });

            return typeMatch && sourceMatch && nobMatch;
          });

          if (matchedRules.length > 0) {
            const candidate = matchedRules.find((r) => r.is_next_in_line) || matchedRules[0];
            if (candidate && candidate.sc_name) {
              resolvedHandlePerson = candidate.sc_name;
            }

            if (matchedRules.length > 1 && candidate?.id) {
              const currentIndex = matchedRules.findIndex((item) => item.id === candidate.id);
              const nextIndex = (currentIndex + 1) % matchedRules.length;
              const nextItem = matchedRules[nextIndex];

              if (candidate.id !== nextItem.id) {
                await supabase.from("lto_sc_distribution").update({ is_next_in_line: false }).eq("id", candidate.id);
              }
              await supabase.from("lto_sc_distribution").update({ is_next_in_line: true, updated_at: new Date().toISOString() }).eq("id", nextItem.id);
            }
          }
        }
      } catch (scErr) {
        console.error("syncClientOnOrderConversion: error evaluating SC conversion reassignment", scErr);
      }
    }

    // CRM Distribution Algorithm (Priority 1: Group -> Priority 2: State-NOB combined with Round-Robin)
    assignedCrmName = (existingClient?.crm_name || leadData?.crm_name || enqData?.crm_name || "").trim() || null;

    // Evaluate rules whenever CRM Name is currently blank/null (even for existing unconverted client_master records)
    if (!assignedCrmName) {
      const targetState = (existingClient?.state || leadData?.state || enqData?.enquiry_for_state || enqData?.enquiryState || "").trim();
      const targetNob = (leadData?.nob || enqData?.nob || "").trim();

      try {
        const { data: crmRules, error: rulesErr } = await supabase
          .from("lto_crm_distribution")
          .select("*");

        if (!rulesErr && crmRules && crmRules.length > 0) {
          const groupRules = crmRules.filter((r) => (r.tier || "").trim().toLowerCase() === "group");
          const stateNobRules = crmRules.filter((r) => (r.tier || "").trim().toLowerCase() !== "group");

          let matchedRule = null;

          // Priority 1: Group Tier
          if (targetGroup) {
            matchedRule = groupRules.find((r) => {
              const gList = Array.isArray(r.group_name) ? r.group_name.map((g) => String(g).trim().toLowerCase()) : [];
              return gList.includes(targetGroup.toLowerCase());
            });
          }

          // Priority 2: State-NOB Tier
          if (!matchedRule) {
            const candidates = [];
            stateNobRules.forEach((r) => {
              const stateList = Array.isArray(r.state_keys) ? r.state_keys.map((s) => String(s).trim().toLowerCase()) : [];
              const nobList = Array.isArray(r.nob_keys) ? r.nob_keys.map((n) => String(n).trim().toLowerCase()) : [];

              const stateMatches =
                stateList.length === 0 ||
                stateList.includes("any") ||
                (targetState && stateList.includes(targetState.toLowerCase()));

              const nobMatches =
                nobList.length === 0 ||
                nobList.includes("any") ||
                (targetNob && nobList.includes(targetNob.toLowerCase()));

              if (stateMatches && nobMatches) {
                let score = 0;
                if (stateList.length > 0 && !stateList.includes("any") && targetState && stateList.includes(targetState.toLowerCase())) score += 2;
                if (nobList.length > 0 && !nobList.includes("any") && targetNob && nobList.includes(targetNob.toLowerCase())) score += 1;
                candidates.push({ rule: r, score });
              }
            });

            if (candidates.length > 0) {
              candidates.sort((a, b) => b.score - a.score);
              matchedRule = candidates[0].rule;
            }
          }

          if (matchedRule) {
            const crmList = Array.isArray(matchedRule.crm_names) ? matchedRule.crm_names.map((c) => String(c).trim()).filter(Boolean) : [];

            if (crmList.length > 0) {
              let nextCrm = crmList[0];
              const lastCrm = matchedRule.last_assigned_crm;
              if (lastCrm && crmList.includes(lastCrm)) {
                const lastIdx = crmList.indexOf(lastCrm);
                nextCrm = crmList[(lastIdx + 1) % crmList.length];
              }
              assignedCrmName = nextCrm;

              try {
                await supabase
                  .from("lto_crm_distribution")
                  .update({
                    last_assigned_crm: nextCrm,
                    last_assigned_ref: enquiryNo || null,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("uuid", matchedRule.uuid);
              } catch (rrErr) {
                console.error("syncClientOnOrderConversion: error updating CRM round-robin tracking", rrErr);
              }
            }
          }
        }
      } catch (crmErr) {
        console.error("syncClientOnOrderConversion: error evaluating CRM distribution rules", crmErr);
      }
    }

    const clientPayload = {
      company_name: compName,
      client_name: clientName,
      sc_name: resolvedHandlePerson,
      sales_type: targetSalesType || null,
      crm_name: assignedCrmName || null,
      client_mobile_number: leadData?.phone_number || enqData?.phone_number || enqData?.phoneNumber || "",
      state: leadData?.state || enqData?.enquiry_for_state || enqData?.enquiryState || "",
      billing_address: leadData?.address || enqData?.shipping_address || enqData?.shippingAddress || "",
      gst_number: leadData?.gst_number || enqData?.gst_number || enqData?.gstNumber || "",
      already_in_tracker: `Order Received (${enquiryNo})`,
    };

    let cmError = null;
    if (existingClient) {
      const { error: err } = await supabase.from("lto_client_master").update(clientPayload).eq("uuid", existingClient.uuid);
      cmError = err;
    } else {
      const { error: err } = await supabase.from("lto_client_master").insert([clientPayload]);
      cmError = err;
    }

    if (cmError) {
      console.error("syncClientOnOrderConversion: error syncing client_master", cmError);
    }

    // Sync assigned crm_name back to the parent lead or enquiry record
    if (assignedCrmName) {
      if (enquiryNo && enquiryNo.toUpperCase().startsWith("LD-")) {
        await supabase.from("lto_leads").update({ crm_name: assignedCrmName }).eq("lead_no", enquiryNo);
      } else if (enquiryNo) {
        await supabase.from("lto_enquiries").update({ crm_name: assignedCrmName }).eq("enquiry_no", enquiryNo);
      }
    }

    // Immediately trigger client code generation (CXXX format) upon Order confirmation!
    await generateAndAssignClientCode(compName);

    return { scName: resolvedHandlePerson, crmName: assignedCrmName };
  } catch (error) {
    console.error("syncClientOnOrderConversion: unexpected error", error);
    return { scName: resolvedHandlePerson, crmName: assignedCrmName };
  }
};
