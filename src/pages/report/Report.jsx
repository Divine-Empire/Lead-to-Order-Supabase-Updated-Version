"use client";

import { useState, useEffect, useContext, useCallback } from "react";
import { AuthContext } from "../../App";
import supabase from "../../utils/supabase";
import { FileTextIcon, ShoppingCartIcon, UsersIcon } from "../../components/Icons";
import { MapPin } from "lucide-react";

// import { supabaseVisit } from "../supabaseClientVisit";


// Applies any already-built filters to every chunk of a paginated fetch,
// bypassing PostgREST's silent 1000-row cap on unbounded selects -- needed
// here since `enquiries` alone is already well past that count.
async function fetchAllRows(buildQuery) {
    let allRows = [];
    let from = 0;
    const step = 1000;
    let fetchMore = true;
    let lastError = null;

    while (fetchMore) {
        const { data, error } = await buildQuery().range(from, from + step - 1);
        if (error) {
            lastError = error;
            break;
        }
        if (data && data.length > 0) {
            allRows = allRows.concat(data);
            from += step;
            if (data.length < step) fetchMore = false;
        } else {
            fetchMore = false;
        }
    }
    return { data: allRows, error: lastError };
}

// FOS Team Members List
const FOS_RECEIVERS = [
    "PRANAV VINAYAKRAO BHOGAWAR",
    "RANJAN KUMAR PRUSTY",
    "SAMIRAN RAJBONGSHI",
    "ROSHAN DEWANGAN",
    "TUSHAR ATRAM",
    "SUBHRAJIT BEHERA",
    "MANOSH ROY CHOUDHURY",
    "AMAN JHA"
];

function Report() {
    const { isAdmin, getUsernamesToFilter } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState("calling"); // "calling" or "fos"

    // Non-admins (USER role) are always scoped to their own SC name (plus any
    // delegated alternate access); admins may additionally narrow further via
    // the SC filter dropdown. Returns an array of allowed names, or null when
    // there is no restriction to apply (admin, "All" selected).
    const getScFilterList = (adminSelectedScName) => {
        if (!isAdmin()) return getUsernamesToFilter();
        if (adminSelectedScName && adminSelectedScName !== "all") return [adminSelectedScName];
        return null;
    };

    // Calling Data tab state -- one row per SC (from `login`, admin/user role
    // excluded), always scoped to the current week (Monday 00:00 -> now), no
    // date/SC filters since the whole point is "everyone's current-week
    // snapshot at a glance". Non-admins only ever see their own row (or none,
    // if their name isn't a known SC).
    const [leadsReportRows, setLeadsReportRows] = useState([]);
    const [enquiriesReportRows, setEnquiriesReportRows] = useState([]);
    const [scNames, setScNames] = useState([]);

    // FOS report state
    const [fosMetrics, setFosMetrics] = useState({
        enquiryCount: 0,
        totalValue: 0,
        orderConvert: 0,
    });

    // Total Visit (Tankhwa Patra)
    const [totalVisitCount, setTotalVisitCount] = useState(0);

    // Pipeline state (for non-converted enquiries)
    const [pipelineMetrics, setPipelineMetrics] = useState({
        enquiryCount: 0,
        totalValue: 0,
    });

    // SC Pipeline state
    const [scPipelineMetrics, setScPipelineMetrics] = useState({
        leadsCount: 0,
        leadsValue: 0,
        enquiryCount: 0,
        enquiryValue: 0,
    });
    const [scPipelineFilters, setScPipelineFilters] = useState({
        scName: "all",
        startDate: "",
        endDate: "",
    });

    // Conversion Metrics Table (per enquiry receiver)
    const [conversionMetrics, setConversionMetrics] = useState([]);

    const [fosFilters, setFosFilters] = useState({
        receiverName: "all",
        startDate: "",
        endDate: "",
    });

    const [isLoading, setIsLoading] = useState(true);

    // Helper to format date for query if needed, or use directly
    const getEndDateWithTime = (date) => {
        if (!date) return null
        return `${date}T23:59:59`
    }

    // Fetch unique SC names for the filter dropdown
    const fetchSCNames = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from("login")
                .select("username")
                .order("username", { ascending: true });

            if (error) {
                console.error("Error fetching SC names from login:", error);
                return;
            }

            const uniqueNames = (data || [])
                .map(item => item.username)
                .filter(Boolean)
                .filter(name => name.toLowerCase() !== 'admin');
            setScNames(uniqueNames);
        } catch (error) {
            console.error("Error fetching SC names:", error);
        }
    }, []);

    // Monday 00:00 of the current week -> now. "Always started from Monday"
    // per the spec -- this tab has no date picker, it's always this week.
    const getMondayStart = () => {
        const now = new Date();
        const day = now.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
        const diffToMonday = day === 0 ? 6 : day - 1;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
    };

    // Root quotation = no revision suffix. Quotation.jsx's own numbering
    // scheme (see nextRevision in Quotation.jsx) is unambiguous about this:
    // "PREFIX-YY-YY-NNN" (4 hyphen-separated parts) is a root quotation;
    // appending "-01", "-02", ... for each revision makes it 5 parts.
    const isRootQuotationNo = (quotationNo) => String(quotationNo || "").split("-").length === 4;

    const parseMoney = (v) => {
        const value = parseFloat(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        return isNaN(value) ? 0 : value;
    };

    const fetchCallingDataReport = useCallback(async () => {
        if (activeTab !== "calling") return;
        setIsLoading(true);
        try {
            const monday = getMondayStart();
            const mondayISO = monday.toISOString();
            const now = new Date();
            const inThisWeek = (dateStr) => {
                if (!dateStr) return false;
                const d = new Date(dateStr);
                return !isNaN(d.getTime()) && d >= monday && d <= now;
            };

            // Visible rows: admin sees every known SC; a non-admin sees only
            // their own row (by exact name match against `login`), or none
            // at all if their name isn't a recognized SC.
            const allowedNames = isAdmin() ? scNames : (getUsernamesToFilter() || []);
            const visibleScNames = scNames.filter(name => allowedNames.includes(name));

            if (visibleScNames.length === 0) {
                setLeadsReportRows([]);
                setEnquiriesReportRows([]);
                return;
            }

            // ---- Base tables (unbounded -- a quotation created this week can
            // reference a lead/enquiry created any time in the past, so the
            // lead_no/enquiry_no -> sc_name lookup needs the full table) ----
            const [{ data: allLeads }, { data: allEnquiries }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_leads").select("id, lead_no, sc_name, created_at")),
                fetchAllRows(() => supabase.from("lto_enquiries").select("id, enquiry_no, sc_name, enquiry_approach, created_at")),
            ]);

            // ---- This week's call-tracker rows (leads only -- there is no
            // equivalent call-tracker table for direct enquiries) ----
            const { data: weekCalls } = await fetchAllRows(() =>
                supabase.from("lto_call_tracker_for_leads")
                    .select("lead_id, sc_name, created_at, enquiry_approach")
                    .gte("created_at", mondayISO)
            );

            // ---- Full tracker history per lead, needed to determine
            // "currently pending" regardless of when that history was
            // logged (a lead created this week could have tracker rows
            // from any point up to now) ----
            const { data: allLeadTrackers } = await fetchAllRows(() =>
                supabase.from("lto_enquiry_tracker_for_leads").select("lead_id, is_order_received_status")
            );
            const leadTrackersByLeadId = new Map();
            (allLeadTrackers || []).forEach(t => {
                if (!t.lead_id) return;
                if (!leadTrackersByLeadId.has(t.lead_id)) leadTrackersByLeadId.set(t.lead_id, []);
                leadTrackersByLeadId.get(t.lead_id).push(t);
            });
            const isPending = (rows) => rows.length > 0 && rows.every(r => {
                const s = String(r.is_order_received_status || "").trim().toLowerCase();
                return s !== "yes" && s !== "no";
            });

            // ---- Order conversions THIS WEEK (any lead/enquiry, regardless
            // of its own creation date -- "their updation has been done
            // within this week") ----
            const [{ data: weekLeadOrders }, { data: weekEnquiryOrders }] = await Promise.all([
                fetchAllRows(() => supabase.from("lto_enquiry_tracker_for_leads")
                    .select("lead_id, created_at")
                    .gte("created_at", mondayISO)
                    .eq("is_order_received_status", "yes")),
                fetchAllRows(() => supabase.from("lto_enquiry_tracker")
                    .select("enquiry_id, created_at")
                    .gte("created_at", mondayISO)
                    .eq("is_order_received_status", "yes")),
            ]);

            // ---- Root quotations created this week, plus their pre-tax
            // item totals (lto_make_quotations has no "value without tax"
            // column of its own -- grand_total is post-tax) ----
            const { data: weekQuotations } = await fetchAllRows(() =>
                supabase.from("lto_make_quotations")
                    .select("id, quotation_no, enquiry_reference_no, created_at")
                    .gte("created_at", mondayISO)
            );
            const rootWeekQuotations = (weekQuotations || []).filter(q => isRootQuotationNo(q.quotation_no));

            const quotationAmountByQId = new Map();
            const quotationIds = rootWeekQuotations.map(q => q.id);
            if (quotationIds.length > 0) {
                const { data: items } = await fetchAllRows(() =>
                    supabase.from("lto_make_quotation_items").select("quotation_id, amount").in("quotation_id", quotationIds)
                );
                (items || []).forEach(it => {
                    quotationAmountByQId.set(it.quotation_id, (quotationAmountByQId.get(it.quotation_id) || 0) + parseMoney(it.amount));
                });
            }

            // ---- Lookups: lead_no / enquiry_no -> owning SC, for tying a
            // quotation back to whichever SC's lead/enquiry it belongs to ----
            const leadById = new Map();
            const leadScByLeadNo = new Map();
            (allLeads || []).forEach(l => {
                leadById.set(l.id, l);
                if (l.lead_no) leadScByLeadNo.set(l.lead_no.trim().toUpperCase(), l.sc_name);
            });
            const enquiryById = new Map();
            const enquiryScByEnquiryNo = new Map();
            (allEnquiries || []).forEach(e => {
                enquiryById.set(e.id, e);
                if (e.enquiry_no) enquiryScByEnquiryNo.set(e.enquiry_no.trim().toUpperCase(), e.sc_name);
            });

            // ==================== LEADS SECTION ====================
            const leadStats = {};
            visibleScNames.forEach(name => {
                leadStats[name] = {
                    name, totalLeads: 0, calls: 0, convertedToEnquiry: 0,
                    quotations: 0, quotationAmount: 0, orderConverted: 0, incoming: 0, outgoing: 0,
                };
            });

            const callsByLeadId = new Map();
            (weekCalls || []).forEach(c => {
                if (!c.lead_id) return;
                if (!callsByLeadId.has(c.lead_id)) callsByLeadId.set(c.lead_id, { sc_name: c.sc_name, approaches: new Set() });
                if (c.enquiry_approach) callsByLeadId.get(c.lead_id).approaches.add(String(c.enquiry_approach).trim().toUpperCase());
            });

            (allLeads || []).forEach(lead => {
                if (!inThisWeek(lead.created_at)) return;
                const sc = lead.sc_name;
                if (!sc || !leadStats[sc]) return;
                leadStats[sc].totalLeads++;

                if (isPending(leadTrackersByLeadId.get(lead.id) || [])) leadStats[sc].convertedToEnquiry++;

                const callEntry = callsByLeadId.get(lead.id);
                if (callEntry) {
                    if (callEntry.approaches.has("INCOMING")) leadStats[sc].incoming++;
                    if (callEntry.approaches.has("OUTGOING")) leadStats[sc].outgoing++;
                }
            });

            // No. of Calls: distinct leads (any creation date) called this
            // week, credited to the call's own sc_name, max one per lead.
            callsByLeadId.forEach(entry => {
                if (entry.sc_name && leadStats[entry.sc_name]) leadStats[entry.sc_name].calls++;
            });

            // Order Converted: any lead (any creation date) whose order was
            // marked received this week, credited to the lead's own SC.
            (weekLeadOrders || []).forEach(row => {
                const lead = leadById.get(row.lead_id);
                if (lead?.sc_name && leadStats[lead.sc_name]) leadStats[lead.sc_name].orderConverted++;
            });

            // Quotations: root quotations created this week whose reference
            // no. points at a lead (LD-...), credited to that lead's SC.
            rootWeekQuotations.forEach(q => {
                const ref = String(q.enquiry_reference_no || "").trim().toUpperCase();
                if (!ref.startsWith("LD-")) return;
                const sc = leadScByLeadNo.get(ref);
                if (sc && leadStats[sc]) {
                    leadStats[sc].quotations++;
                    leadStats[sc].quotationAmount += quotationAmountByQId.get(q.id) || 0;
                }
            });

            setLeadsReportRows(visibleScNames.map(name => leadStats[name]));

            // ==================== ENQUIRIES SECTION ====================
            const enquiryStats = {};
            visibleScNames.forEach(name => {
                enquiryStats[name] = {
                    name, totalEnquiries: 0, quotations: 0, quotationAmount: 0,
                    orderConverted: 0, incoming: 0, outgoing: 0,
                };
            });

            (allEnquiries || []).forEach(e => {
                if (!inThisWeek(e.created_at)) return;
                const sc = e.sc_name;
                if (!sc || !enquiryStats[sc]) return;
                enquiryStats[sc].totalEnquiries++;
                const approach = String(e.enquiry_approach || "").trim().toUpperCase();
                if (approach === "INCOMING") enquiryStats[sc].incoming++;
                if (approach === "OUTGOING") enquiryStats[sc].outgoing++;
            });

            (weekEnquiryOrders || []).forEach(row => {
                const e = enquiryById.get(row.enquiry_id);
                if (e?.sc_name && enquiryStats[e.sc_name]) enquiryStats[e.sc_name].orderConverted++;
            });

            rootWeekQuotations.forEach(q => {
                const ref = String(q.enquiry_reference_no || "").trim().toUpperCase();
                if (!ref.startsWith("EN-")) return;
                const sc = enquiryScByEnquiryNo.get(ref);
                if (sc && enquiryStats[sc]) {
                    enquiryStats[sc].quotations++;
                    enquiryStats[sc].quotationAmount += quotationAmountByQId.get(q.id) || 0;
                }
            });

            setEnquiriesReportRows(visibleScNames.map(name => enquiryStats[name]));

        } catch (error) {
            console.error("Error fetching calling data report:", error);
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, isAdmin, getUsernamesToFilter, scNames]);

    // Fetch FOS Data
    const fetchFosMetrics = useCallback(async () => {
        if (activeTab !== "fos") return;
        setIsLoading(true);
        try {
            const { data: rawData, error } = await fetchAllRows(() => {
                let q = supabase
                    .from("lto_enquiries")
                    .select("id, created_at, enquiry_receiver_name");

                const scList = getScFilterList(fosFilters.receiverName);
                if (scList) {
                    q = q.in("enquiry_receiver_name", scList);
                }
                if (fosFilters.startDate) {
                    q = q.gte("created_at", fosFilters.startDate);
                }
                if (fosFilters.endDate) {
                    q = q.lte("created_at", getEndDateWithTime(fosFilters.endDate));
                }
                return q;
            });

            if (error) {
                console.error("Error fetching FOS data:", error);
                setFosMetrics({ enquiryCount: 0, totalValue: 0, orderConvert: 0 });
                setPipelineMetrics({ enquiryCount: 0, totalValue: 0 });
                return;
            }

            // quotation_value_without_tax / order_no / is_order_received_status all
            // live on lto_enquiry_tracker, not on lto_enquiries -- fetch and reduce
            // to one representative (latest) row per enquiry.
            const { data: trackerRows, error: trackerErr } = await fetchAllRows(() =>
                supabase.from("lto_enquiry_tracker")
                    .select("enquiry_id, created_at, quotation_value_without_tax, order_no, is_order_received_status")
            );
            if (trackerErr) console.error("Error fetching enquiry tracker data for FOS report:", trackerErr);

            const latestTrackerByEnquiryId = new Map();
            (trackerRows || []).forEach(t => {
                const existing = latestTrackerByEnquiryId.get(t.enquiry_id);
                if (!existing || new Date(t.created_at) > new Date(existing.created_at)) {
                    latestTrackerByEnquiryId.set(t.enquiry_id, t);
                }
            });

            const data = (rawData || []).map(row => {
                const tracker = latestTrackerByEnquiryId.get(row.id);
                const hasOrder = (trackerRows || []).some(t =>
                    t.enquiry_id === row.id &&
                    t.is_order_received_status &&
                    String(t.is_order_received_status).trim().toLowerCase() === "yes"
                );
                return {
                    ...row,
                    quotation_value_without_tax: tracker?.quotation_value_without_tax ?? null,
                    order_no: tracker?.order_no ?? null,
                    is_order_received_status: tracker?.is_order_received_status ?? null,
                    hasOrder,
                };
            });

            // FOS Team metrics (all enquiries)
            let fosEnquiryCount = data.length;
            let fosTotalValue = 0;
            let fosConvertedValue = 0; // NEW: Track sum of converted orders only
            let orderConvert = 0;

            // Pipeline metrics (only non-converted: actual1 is null)
            let pipelineEnquiryCount = 0;
            let pipelineTotalValue = 0;

            data.forEach(row => {
                // Count total value for all enquiries
                if (row.quotation_value_without_tax) {
                    const value = parseFloat(
                        String(row.quotation_value_without_tax)
                            .replace(/,/g, "")
                            .replace(/[^\d.-]/g, "")
                    );

                    if (!isNaN(value)) {
                        fosTotalValue += value;

                        // NEW: If converted to order, add to converted value
                        const isOrderReceived = row.is_order_received_status &&
                            String(row.is_order_received_status).toLowerCase() === "yes";

                        if (row.hasOrder && isOrderReceived) {
                            fosConvertedValue += value;
                        }
                    }
                }

                // Check if this enquiry was converted to order
                if (row.hasOrder) {
                    orderConvert++;
                }

                // Pipeline metrics (only non-converted)
                if (!row.hasOrder) {
                    pipelineEnquiryCount++;

                    if (row.quotation_value_without_tax) {
                        const value = parseFloat(
                            String(row.quotation_value_without_tax)
                                .replace(/,/g, "")
                                .replace(/[^\d.-]/g, "")
                        );

                        if (!isNaN(value)) {
                            pipelineTotalValue += value;
                        }
                    }
                }

            });

            setFosMetrics({
                enquiryCount: fosEnquiryCount,
                totalValue: fosTotalValue,
                convertedValue: fosConvertedValue, // Added
                orderConvert
            });

            setPipelineMetrics({
                enquiryCount: pipelineEnquiryCount,
                totalValue: pipelineTotalValue
            });

            // Calculate per-person conversion metrics
            // Initialize with all FOS team members
            const personMetrics = {};
            FOS_RECEIVERS.forEach(name => {
                personMetrics[name] = {
                    name: name,
                    totalEnquiries: 0,
                    orderConversions: 0,
                    totalOrderValue: 0
                };
            });

            data.forEach(row => {
                const receiverName = row.enquiry_receiver_name;

                // Only process if receiver name exists in FOS_RECEIVERS
                if (receiverName && personMetrics[receiverName]) {
                    // Count every enquiry
                    personMetrics[receiverName].totalEnquiries++;

                    // Check if this enquiry was converted to order
                    const hasOrder = row.hasOrder;

                    if (hasOrder) {
                        personMetrics[receiverName].orderConversions++;

                        if (row.quotation_value_without_tax) {
                            const value = parseFloat(
                                String(row.quotation_value_without_tax)
                                    .replace(/,/g, "")
                                    .replace(/[^\d.-]/g, "")
                            );

                            if (!isNaN(value)) {
                                personMetrics[receiverName].totalOrderValue += value;
                            }
                        }
                    }
                }
            });

            // Convert to array and calculate conversion percentage and average ticket size (preserve FOS_RECEIVERS order)
            let metricsArray = FOS_RECEIVERS.map(name => ({
                name: name,
                totalEnquiries: personMetrics[name].totalEnquiries,
                orderConversions: personMetrics[name].orderConversions,
                conversionPercentage: personMetrics[name].totalEnquiries > 0
                    ? (personMetrics[name].orderConversions / personMetrics[name].totalEnquiries) * 100
                    : 0,
                avgTicketSize: personMetrics[name].orderConversions > 0
                    ? personMetrics[name].totalOrderValue / personMetrics[name].orderConversions
                    : 0
            }));

            // If a specific receiver is selected (or a non-admin is scoped to their
            // own name), filter the table to show only allowed row(s).
            const conversionScList = getScFilterList(fosFilters.receiverName);
            if (conversionScList) {
                metricsArray = metricsArray.filter(met => conversionScList.includes(met.name));
            }

            setConversionMetrics(metricsArray);

        } catch (err) {
            console.error("FOS fetch error:", err);
        } finally {
            setIsLoading(false);
        }
    }, [fosFilters, activeTab, isAdmin, getUsernamesToFilter]);

    // Fetch SC Pipeline Metrics
    const fetchScPipelineMetrics = useCallback(async () => {
        if (activeTab !== "sc_pipeline") return;
        setIsLoading(true);
        try {
            const parseDate = (dateStr) => {
                if (!dateStr) return null;
                const datePart = String(dateStr).split(" ")[0];

                const parts = datePart.split(/[/|-]/);
                if (parts.length === 3) {
                    if (parts[0].length === 4) {
                        return new Date(parts[0], parts[1] - 1, parts[2]);
                    } else {
                        return new Date(parts[2], parts[1] - 1, parts[0]);
                    }
                }

                const isoDate = new Date(dateStr);
                return isNaN(isoDate.getTime()) ? null : isoDate;
            };

            const isDateInRange = (date, start, end) => {
                if (!date) return false;
                const target = new Date(date).getTime();
                const s = start ? new Date(start).setHours(0, 0, 0, 0) : null;
                const e = end ? new Date(end).setHours(23, 59, 59, 999) : null;

                if (s && target < s) return false;
                if (e && target > e) return false;
                return true;
            };

            const { data: leadsData, error: leadsError } = await fetchAllRows(() => {
                let q = supabase.from("lto_leads").select("*");
                const scList = getScFilterList(scPipelineFilters.scName);
                if (scList) {
                    q = q.in("sc_name", scList);
                }
                return q;
            });

            let leadsCount = 0;
            let leadsValue = 0;
            let enquiryCount = 0;
            let enquiryValue = 0;

            if (leadsError) {
                console.error("Error fetching SC Pipeline data:", leadsError);
            } else if (leadsData) {
                leadsData.forEach(row => {
                    const tDate = parseDate(row.created_at);

                    // Total Leads + Total Value logic
                    if (tDate) {
                        if (isDateInRange(tDate, scPipelineFilters.startDate, scPipelineFilters.endDate)) {
                            leadsCount++;
                        }
                    }
                });
            }

            // Fetch No. of Enquiry from enquiries table
            const { data: enquiryData, error: enquiryError } = await fetchAllRows(() =>
                supabase.from("lto_enquiries").select("id, created_at, enquiry_assign_to_project")
            );

            // quotation_value_with_tax lives on lto_enquiry_tracker, not on
            // lto_enquiries -- reduce to one representative (latest) value per enquiry.
            const { data: scTrackerRows, error: scTrackerError } = await fetchAllRows(() =>
                supabase.from("lto_enquiry_tracker").select("enquiry_id, created_at, quotation_value_with_tax")
            );
            if (scTrackerError) console.error("Error fetching enquiry tracker data for SC Pipeline:", scTrackerError);

            const latestQuotationValueByEnquiryId = new Map();
            (scTrackerRows || []).forEach(t => {
                const existing = latestQuotationValueByEnquiryId.get(t.enquiry_id);
                if (!existing || new Date(t.created_at) > new Date(existing.created_at)) {
                    latestQuotationValueByEnquiryId.set(t.enquiry_id, t);
                }
            });

            if (enquiryError) {
                console.error("Error fetching enquiry data:", enquiryError);
            } else if (enquiryData) {
                // Extract first word of a string, lowercased for partial name matching
                const firstWord = (str) => String(str || '').trim().toLowerCase().split(/\s+/)[0];

                const scList = getScFilterList(scPipelineFilters.scName);
                const scFirstWords = scList ? scList.map(firstWord) : null;

                enquiryData.forEach(row => {
                    const eDate = parseDate(row.created_at);

                    // Name matching: compare first word of enquiry_assign_to_project against allowed SC names
                    const nameMatches = scFirstWords === null
                        ? true // no restriction — count every record
                        : scFirstWords.includes(firstWord(row.enquiry_assign_to_project));

                    if (!nameMatches) return;

                    // Date filter using the enquiry's own created_at
                    if (isDateInRange(eDate, scPipelineFilters.startDate, scPipelineFilters.endDate)) {
                        enquiryCount++;
                        // Sum quotation_value_with_tax (from the latest tracker row) for Total Value of Enquiries
                        const quotationValueWithTax = latestQuotationValueByEnquiryId.get(row.id)?.quotation_value_with_tax;
                        if (quotationValueWithTax) {
                            const parsed = parseFloat(String(quotationValueWithTax).replace(/,/g, '').replace(/[^\d.-]/g, ''));
                            if (!isNaN(parsed)) enquiryValue += parsed;
                        }
                    }
                });
            }

            setScPipelineMetrics({
                leadsCount,
                leadsValue,
                enquiryCount,
                enquiryValue
            });

        } catch (error) {
            console.error("Error fetching SC Pipeline metrics:", error);
        } finally {
            setIsLoading(false);
        }
    }, [scPipelineFilters, activeTab, isAdmin, getUsernamesToFilter]);


    useEffect(() => {
        fetchSCNames();
    }, [fetchSCNames]);


    const fetchFilteredVisitCount = useCallback(async () => {
        if (activeTab !== "fos") return;

        try {
            // 📊 Default logic: Tables tankhwa_patra and total_visit have been removed.
            setTotalVisitCount(0);
        } catch (err) {
            console.error("Visit count error:", err);
        }
    }, [fosFilters, activeTab, isAdmin]);

    useEffect(() => {
        if (activeTab === "calling") {
            fetchCallingDataReport();
        } else if (activeTab === "fos") {
            fetchFosMetrics();
            fetchFilteredVisitCount();
        } else if (activeTab === "sc_pipeline") {
            fetchScPipelineMetrics();
        }
    }, [fetchCallingDataReport, fetchFosMetrics, fetchFilteredVisitCount, fetchScPipelineMetrics, activeTab]);








    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        Overview of calls, enquiries, quotations, and orders.
                    </p>
                </div>

                {/* Tabs */}
                <div className="mb-6 border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            onClick={() => setActiveTab("calling")}
                            className={`${activeTab === "calling"
                                ? "border-info/40 text-info"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            Calling Data
                        </button>
                        <button
                            onClick={() => setActiveTab("fos")}
                            className={`${activeTab === "fos"
                                ? "border-info/40 text-info"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            FOS Report
                        </button>
                        <button
                            onClick={() => setActiveTab("sc_pipeline")}
                            className={`${activeTab === "sc_pipeline"
                                ? "border-info/40 text-info"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            SC Pipeline
                        </button>
                    </nav>
                </div>

                {/* CALLING DATA TAB CONTENT */}
                {activeTab === "calling" && (
                    <>
                        <p className="text-sm text-gray-500 mb-6">
                            Current week (Monday through today) -- one row per Sales Coordinator.
                            {!isAdmin() && " You're seeing only your own row."}
                        </p>

                        {/* Leads Section */}
                        <div className="mb-12">
                            <h2 className="text-xl font-semibold text-gray-800 mb-4">Leads</h2>
                            <div className="bg-white rounded-lg shadow overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SC Name</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Leads</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No. of Calls</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Converted to Enquiries</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Quotations</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Quotation Amount</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order Converted</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Incoming</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outgoing</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {isLoading ? (
                                                <tr><td colSpan="9" className="px-4 py-4 text-center text-sm text-gray-500">Loading...</td></tr>
                                            ) : leadsReportRows.length === 0 ? (
                                                <tr><td colSpan="9" className="px-4 py-4 text-center text-sm text-gray-500">No rows to show</td></tr>
                                            ) : (
                                                leadsReportRows.map(row => (
                                                    <tr key={row.name} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{row.name}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.totalLeads}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.calls}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.convertedToEnquiry}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.quotations}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.quotationAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.orderConverted}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.incoming}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.outgoing}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Enquiries Section */}
                        <div>
                            <h2 className="text-xl font-semibold text-gray-800 mb-4">Enquiries</h2>
                            <div className="bg-white rounded-lg shadow overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SC Name</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Enquiries</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Quotations</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Quotation Amount</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order Converted</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Incoming</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outgoing</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {isLoading ? (
                                                <tr><td colSpan="7" className="px-4 py-4 text-center text-sm text-gray-500">Loading...</td></tr>
                                            ) : enquiriesReportRows.length === 0 ? (
                                                <tr><td colSpan="7" className="px-4 py-4 text-center text-sm text-gray-500">No rows to show</td></tr>
                                            ) : (
                                                enquiriesReportRows.map(row => (
                                                    <tr key={row.name} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{row.name}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.totalEnquiries}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.quotations}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.quotationAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.orderConverted}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.incoming}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{row.outgoing}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* FOS REPORT TAB CONTENT */}
                {activeTab === "fos" && (
                    <>
                        {/* FOS Filters */}
                        <div className="bg-white p-4 rounded-lg shadow mb-8 flex flex-col md:flex-row gap-4 items-end md:items-center">
                            {isAdmin() && (
                                <div className="w-full md:w-1/3">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Enquiry Receiver Name</label>
                                    <select
                                        className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 border"
                                        value={fosFilters.receiverName}
                                        onChange={(e) => setFosFilters(prev => ({ ...prev, receiverName: e.target.value }))}
                                    >
                                        <option value="all">All Receivers</option>
                                        {FOS_RECEIVERS.map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="w-full md:w-1/4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                                <input
                                    type="date"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 border"
                                    value={fosFilters.startDate}
                                    onChange={(e) => setFosFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                />
                            </div>
                            <div className="w-full md:w-1/4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                                <input
                                    type="date"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 border"
                                    value={fosFilters.endDate}
                                    onChange={(e) => setFosFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                />
                            </div>
                            <div className="w-full md:w-1/6">
                                <button
                                    onClick={() => setFosFilters({ receiverName: "all", startDate: "", endDate: "" })}
                                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-md transition-colors"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>

                        {/* FOS Team and Pipeline Sections */}
                        <div className="space-y-12">
                            {/* Section 1: FOS Team */}
                            <div>
                                <h2 className="text-xl font-semibold text-gray-800 mb-4">FOS Team</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {/* Total Visit */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-info/40">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                                                Total Visit
                                            </p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">
                                                {isLoading ? "..." : totalVisitCount}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-full bg-info/10 text-info">
                                            <MapPin className="h-8 w-8" />
                                        </div>
                                    </div>



                                    {/* No. of Enquiry */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-primary">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">No. of Enquiries</p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">{isLoading ? "..." : fosMetrics.enquiryCount}</p>
                                        </div>
                                        <div className="p-3 rounded-full bg-primary/5 text-primary">
                                            <UsersIcon className="h-8 w-8" />
                                        </div>
                                    </div>


                                    {/* Total Enquiry Value */}

                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-success/40">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Enquiry Value </p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">
                                                {isLoading ? "..." : (fosMetrics.totalValue || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-full bg-success/5 text-success">
                                            <span className="text-2xl font-bold">₹</span>
                                        </div>
                                    </div>


                                    {/* Order Convert */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-primary">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Orders Converted</p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">{isLoading ? "..." : fosMetrics.orderConvert}</p>
                                        </div>
                                        <div className="p-3 rounded-full bg-primary/5 text-primary">
                                            <ShoppingCartIcon className="h-8 w-8" />
                                        </div>
                                    </div>


                                    {/*Order Converted Total Value */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-success/40">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Order Converted Total Value </p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">
                                                {/* {isLoading ? "..." : (fosMetrics.totalValue || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} */}
                                                {isLoading ? "..." : (fosMetrics.convertedValue || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-full bg-success/5 text-success">
                                            <span className="text-2xl font-bold">₹</span>
                                        </div>
                                    </div>


                                    {/* Avg Ticket Size */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-warning/40">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Avg Ticket Size</p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">
                                                {isLoading ? "..." : fosMetrics.orderConvert > 0
                                                    ? (fosMetrics.convertedValue / fosMetrics.orderConvert).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
                                                    : '₹0.00'}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-full bg-warning/5 text-warning-foreground">
                                            <span className="text-2xl font-bold">₹</span>
                                        </div>
                                    </div>


                                </div>
                            </div>

                            {/* Section 2: Pipeline (Non-converted Enquiries Only) */}
                            <div>
                                <h2 className="text-xl font-semibold text-gray-800 mb-4">Pipeline</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* No. of Enquiry (Non-converted only) */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-primary">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">No. of Enquiries</p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">{isLoading ? "..." : pipelineMetrics.enquiryCount}</p>
                                        </div>
                                        <div className="p-3 rounded-full bg-primary/5 text-primary">
                                            <UsersIcon className="h-8 w-8" />
                                        </div>
                                    </div>

                                    {/* Value (Non-converted only) */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-success/40">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Value</p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">
                                                {isLoading ? "..." : (pipelineMetrics.totalValue || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-full bg-success/5 text-success">
                                            <span className="text-2xl font-bold">₹</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Conversion Metrics Table */}
                            <div>
                                <h2 className="text-xl font-semibold text-gray-800 mb-4">Enquiry to Order Conversion Metrics</h2>
                                <div className="bg-white rounded-lg shadow overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Enquiry Receiver Name
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Enquiry to Order Conversion
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Enquiry to Order (Avg Ticket Size)
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {isLoading ? (
                                                    <tr>
                                                        <td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">
                                                            Loading...
                                                        </td>
                                                    </tr>
                                                ) : conversionMetrics.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">
                                                            No data available
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    conversionMetrics.map((person, index) => (
                                                        <tr key={index} className="hover:bg-gray-50">
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                {person.name}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                                {person.conversionPercentage.toFixed(2)}%
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                                {person.avgTicketSize > 0
                                                                    ? person.avgTicketSize.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
                                                                    : '₹0.00'
                                                                }
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* SC PIPELINE TAB CONTENT */}
                {activeTab === "sc_pipeline" && (
                    <>
                        {/* Filters */}
                        <div className="bg-white p-4 rounded-lg shadow mb-8 flex flex-col md:flex-row gap-4 items-end md:items-center">
                            {isAdmin() && (
                                <div className="w-full md:w-1/4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">SC Name</label>
                                    <select
                                        className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 border"
                                        value={scPipelineFilters.scName}
                                        onChange={(e) => setScPipelineFilters(prev => ({ ...prev, scName: e.target.value }))}
                                    >
                                        <option value="all">All Sales Coordinators</option>
                                        {scNames.map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="w-full md:w-1/4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                                <input
                                    type="date"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 border"
                                    value={scPipelineFilters.startDate}
                                    onChange={(e) => setScPipelineFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                />
                            </div>
                            <div className="w-full md:w-1/4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                                <input
                                    type="date"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 border"
                                    value={scPipelineFilters.endDate}
                                    onChange={(e) => setScPipelineFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                />
                            </div>
                            <div className="w-full md:w-1/4">
                                <button
                                    onClick={() => setScPipelineFilters({ scName: "all", startDate: "", endDate: "" })}
                                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-md transition-colors"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>

                        {/* Pipeline Section */}
                        <div className="space-y-12">
                            <div>
                                <h2 className="text-xl font-semibold text-gray-800 mb-4">SC Pipeline</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                                    {/* No. of Leads */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-info/40">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">No. of Leads</p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">{isLoading ? "..." : scPipelineMetrics.leadsCount}</p>
                                        </div>
                                        <div className="p-3 rounded-full bg-info/10 text-info">
                                            <UsersIcon className="h-8 w-8" />
                                        </div>
                                    </div>

                                    {/* Total Value */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-primary">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Value</p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">
                                                {isLoading ? "..." : (scPipelineMetrics.leadsValue || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-full bg-primary/5 text-primary">
                                            <span className="text-2xl font-bold">₹</span>
                                        </div>
                                    </div>

                                    {/* No. of Enquiry */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-success/40">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">No. of Enquiries</p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">{isLoading ? "..." : scPipelineMetrics.enquiryCount}</p>
                                        </div>
                                        <div className="p-3 rounded-full bg-success/5 text-success">
                                            <FileTextIcon className="h-8 w-8" />
                                        </div>
                                    </div>

                                    {/* Total Value of Enquiries */}
                                    <div className="bg-white rounded-lg shadow px-6 py-8 flex items-center justify-between border-l-4 border-primary">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Value of Enquiries</p>
                                            <p className="text-3xl font-bold text-gray-900 mt-2">
                                                {isLoading ? "..." : (scPipelineMetrics.enquiryValue || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-full bg-primary/5 text-primary">
                                            <span className="text-2xl font-bold">₹</span>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
}

export default Report;
