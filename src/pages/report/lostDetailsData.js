import supabase from "../../utils/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { mergeRowsChronologically } from "../../utils/mergeTrackerRows";
import { toPersonList } from "../../utils/assignToPerson";

// SC of a lost enquiry: its sales coordinator; when it has none, every person
// it is assigned to (enquiry_assign_to_person is multi-select) -- one row per
// person, so each of them gets the same count.
const scNamesOf = (rec) => {
    if (rec.sales_coordinator_name) return [rec.sales_coordinator_name];
    const persons = toPersonList(rec.enquiry_assign_to_person);
    return persons.length ? persons : [null];
};

// Shared by both the Lost Details tab (Report.jsx) and its per-SC
// drill-down page (LostDetailsPage.jsx).
//
// "Lost" = is_order_received_status === "no" on lto_enquiry_tracker /
// lto_enquiry_tracker_for_leads.
const parseMoney = (v) => {
    const value = parseFloat(String(v ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
    return isNaN(value) ? 0 : value;
};

// "no" (Order Status stage: "was the order received?" -> No) -- case varies
// in the live data ("no" / "No"), hence the normalize.
export const isLostStatus = (orderReceivedStatus) => String(orderReceivedStatus || "").trim().toLowerCase() === "no";

// Resolves latest quotation and item sums for a batch of records without
// performing a massive full-table scan.
async function attachQuotations(records) {
    if (!records || records.length === 0) return records;

    const rawRefs = [];
    records.forEach((r) => {
        const raw = String(r.number || "").trim();
        if (raw) rawRefs.push(raw);
    });

    if (rawRefs.length === 0) return records;

    // Fetch quotations in batches of 100 to keep URL length well within HTTP GET limits
    const BATCH_SIZE = 100;
    const allQuotes = [];
    for (let i = 0; i < rawRefs.length; i += BATCH_SIZE) {
        const chunk = rawRefs.slice(i, i + BATCH_SIZE);
        const { data } = await supabase
            .from("lto_make_quotations")
            .select("id, quotation_no, enquiry_reference_no, grand_total, pdf_url, created_at")
            .in("enquiry_reference_no", chunk);
        if (data && data.length > 0) allQuotes.push(...data);
    }

    if (allQuotes.length === 0) return records;

    // Pick latest quotation per enquiry_reference_no
    const latestByRef = new Map();
    allQuotes.forEach((q) => {
        const ref = String(q.enquiry_reference_no || "").trim().toUpperCase();
        if (!ref) return;
        const existing = latestByRef.get(ref);
        if (!existing || new Date(q.created_at) > new Date(existing.created_at)) {
            latestByRef.set(ref, q);
        }
    });

    const latestList = Array.from(latestByRef.values());
    const latestIds = latestList.map((q) => q.id);
    const amountByQId = new Map();

    if (latestIds.length > 0) {
        for (let i = 0; i < latestIds.length; i += BATCH_SIZE) {
            const chunk = latestIds.slice(i, i + BATCH_SIZE);
            const { data: items } = await supabase
                .from("lto_make_quotation_items")
                .select("quotation_id, amount")
                .in("quotation_id", chunk);
            (items || []).forEach((it) => {
                amountByQId.set(it.quotation_id, (amountByQId.get(it.quotation_id) || 0) + parseMoney(it.amount));
            });
        }
    }

    return records.map((row) => {
        const ref = String(row.number || "").trim().toUpperCase();
        const latest = latestByRef.get(ref);
        if (!latest) return row;
        return {
            ...row,
            quotationNumber: latest.quotation_no,
            quotationValueWithoutTax: amountByQId.get(latest.id) ?? row.quotationValueWithoutTax,
            quotationValueWithTax: latest.grand_total ?? row.quotationValueWithTax,
            quotationUpload: latest.pdf_url || row.quotationUpload,
        };
    });
}

// Helper to safely fetch enquiries in chunks of 100 IDs to avoid HTTP 414 URL Too Long
async function fetchEnquiriesByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const BATCH = 100;
    const all = [];
    for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from("lto_enquiries")
            .select("id, sales_coordinator_name, enquiry_assign_to_person, enquiry_no, company_name, created_at")
            .in("id", chunk);
        if (error) throw error;
        if (data) all.push(...data);
    }
    return all;
}

// Fast progressive / chunked fetching of Lost Details.
// Yields initial batch (e.g. first 100 records) to `onProgress` in < 400ms,
// allowing Page 1 to render immediately while subsequent batches stream in.
export async function fetchLostDetails({ source, startDateISO, endDateISO, onProgress }) {
    if (source === "lead") {
        // Leads: small dataset (total ~2300, only ~4 lost leads)
        const { data: baseRecords, error: baseErr } = await fetchAllRows(() => {
            let q = supabase.from("lto_leads").select("id, lead_receiver_name, lead_no, company_name, created_at").order("created_at", { ascending: false });
            if (startDateISO) q = q.gte("created_at", startDateISO);
            if (endDateISO) q = q.lte("created_at", endDateISO);
            return q;
        });
        if (baseErr) throw baseErr;

        const { data: trackerRows, error: trackerErr } = await fetchAllRows(() => {
            let q = supabase.from("lto_enquiry_tracker_for_leads").select(
                "lead_id, created_at, is_order_received_status, if_no_reason_status, if_no_reason_remark, quotation_number, quotation_value_without_tax, quotation_value_with_tax, quotation_upload"
            );
            if (startDateISO) q = q.gte("created_at", startDateISO);
            return q;
        });
        if (trackerErr) throw trackerErr;

        const trackerByRecordId = new Map();
        (trackerRows || []).forEach((t) => {
            if (!t.lead_id) return;
            if (!trackerByRecordId.has(t.lead_id)) trackerByRecordId.set(t.lead_id, []);
            trackerByRecordId.get(t.lead_id).push(t);
        });

        const mergedByRecordId = new Map();
        trackerByRecordId.forEach((rows, recId) => {
            const sorted = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            mergedByRecordId.set(recId, mergeRowsChronologically(sorted));
        });

        const mapped = (baseRecords || []).map((rec) => {
            const merged = mergedByRecordId.get(rec.id) || {};
            return {
                id: rec.id,
                source: "lead",
                scName: rec.lead_receiver_name || null,
                companyName: rec.company_name || "",
                number: rec.lead_no || "",
                createdAt: rec.created_at,
                orderReceivedStatus: merged.is_order_received_status || null,
                quotationNumber: merged.quotation_number || null,
                quotationValueWithoutTax: merged.quotation_value_without_tax ?? null,
                quotationValueWithTax: merged.quotation_value_with_tax ?? null,
                quotationUpload: merged.quotation_upload || null,
                lostReason: [merged.if_no_reason_status, merged.if_no_reason_remark].filter(Boolean).join(" -- ") || null,
            };
        });

        const withQuotes = await attachQuotations(mapped);
        if (onProgress) onProgress(withQuotes, { totalCount: withQuotes.length, isDone: true });
        return withQuotes;
    }

    if (source === "enquiry") {
        // If a date filter is applied, query the date-filtered base enquiries first
        if (startDateISO || endDateISO) {
            const { data: baseRecords, error: baseErr } = await fetchAllRows(() => {
                let q = supabase.from("lto_enquiries")
                    .select("id, sales_coordinator_name, enquiry_assign_to_person, enquiry_no, company_name, created_at")
                    .order("created_at", { ascending: false });
                if (startDateISO) q = q.gte("created_at", startDateISO);
                if (endDateISO) q = q.lte("created_at", endDateISO);
                return q;
            });
            if (baseErr) throw baseErr;

            const enqIds = (baseRecords || []).map((r) => r.id);
            if (enqIds.length === 0) {
                if (onProgress) onProgress([], { totalCount: 0, isDone: true });
                return [];
            }

            // Fetch lost tracker rows for these enquiries in safe batches of 100
            const trackerRows = [];
            const BATCH = 100;
            for (let i = 0; i < enqIds.length; i += BATCH) {
                const chunk = enqIds.slice(i, i + BATCH);
                const { data } = await supabase
                    .from("lto_enquiry_tracker")
                    .select("enquiry_id, created_at, is_order_received_status, if_no_reason_status, if_no_reason_remark, quotation_number, quotation_value_without_tax, quotation_value_with_tax, quotation_upload")
                    .in("enquiry_id", chunk)
                    .ilike("is_order_received_status", "no");
                if (data && data.length > 0) trackerRows.push(...data);
            }

            const trackerByRecordId = new Map();
            trackerRows.forEach((t) => {
                if (!t.enquiry_id) return;
                if (!trackerByRecordId.has(t.enquiry_id)) trackerByRecordId.set(t.enquiry_id, []);
                trackerByRecordId.get(t.enquiry_id).push(t);
            });

            const mergedByRecordId = new Map();
            trackerByRecordId.forEach((rows, recId) => {
                const sorted = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                mergedByRecordId.set(recId, mergeRowsChronologically(sorted));
            });

            const mapped = (baseRecords || [])
                .filter((rec) => mergedByRecordId.has(rec.id))
                .flatMap((rec) => {
                    const merged = mergedByRecordId.get(rec.id) || {};
                    return scNamesOf(rec).map((scName) => ({
                        id: rec.id,
                        source: "enquiry",
                        scName,
                        companyName: rec.company_name || "",
                        number: rec.enquiry_no || "",
                        createdAt: rec.created_at,
                        orderReceivedStatus: merged.is_order_received_status || null,
                        quotationNumber: merged.quotation_number || null,
                        quotationValueWithoutTax: merged.quotation_value_without_tax ?? null,
                        quotationValueWithTax: merged.quotation_value_with_tax ?? null,
                        quotationUpload: merged.quotation_upload || null,
                        lostReason: [merged.if_no_reason_status, merged.if_no_reason_remark].filter(Boolean).join(" -- ") || null,
                    }));
                });

            const withQuotes = await attachQuotations(mapped);
            if (onProgress) onProgress(withQuotes, { totalCount: withQuotes.length, isDone: true });
            return withQuotes;
        }

        // All-time enquiries: Upfront total count query so total is known immediately
        let totalCount = null;
        try {
            const { count } = await supabase
                .from("lto_enquiry_tracker")
                .select("id", { count: "exact", head: true })
                .ilike("is_order_received_status", "no");
            totalCount = count;
        } catch (e) {
            console.warn("Could not get upfront total count:", e);
        }

        // Stream in progressive parts so Page 1 renders in < 400ms!
        // Part 1: First 100 rows
        // Part 2: Next 300 rows
        // Part 3+: 500 rows each until finished
        const chunkSizes = [100, 300, 500, 500, 500, 500, 500, 500, 500, 500];
        let currentOffset = 0;
        const allAccumulated = [];
        const seenEnquiryIds = new Set();

        for (let i = 0; i < chunkSizes.length; i++) {
            const size = chunkSizes[i];
            const from = currentOffset;
            const to = currentOffset + size - 1;

            const { data: trackerChunk, error: trackerErr } = await supabase
                .from("lto_enquiry_tracker")
                .select("enquiry_id, created_at, is_order_received_status, if_no_reason_status, if_no_reason_remark, quotation_number, quotation_value_without_tax, quotation_value_with_tax, quotation_upload")
                .ilike("is_order_received_status", "no")
                .order("created_at", { ascending: false })
                .range(from, to);

            if (trackerErr) throw trackerErr;
            if (!trackerChunk || trackerChunk.length === 0) break;

            // Deduplicate tracker rows by enquiry_id within chunk and overall
            const newTrackers = [];
            const newEnquiryIds = [];
            trackerChunk.forEach((t) => {
                if (t.enquiry_id && !seenEnquiryIds.has(t.enquiry_id)) {
                    seenEnquiryIds.add(t.enquiry_id);
                    newTrackers.push(t);
                    newEnquiryIds.push(t.enquiry_id);
                }
            });

            if (newEnquiryIds.length > 0) {
                // Fetch base enquiries safely in batches of 100 IDs
                const enqs = await fetchEnquiriesByIds(newEnquiryIds);

                const enqById = new Map();
                (enqs || []).forEach((e) => enqById.set(e.id, e));

                const chunkMapped = [];
                newTrackers.forEach((t) => {
                    const enq = enqById.get(t.enquiry_id);
                    if (!enq) return;
                    scNamesOf(enq).forEach((scName) => chunkMapped.push({
                        id: enq.id,
                        source: "enquiry",
                        scName,
                        companyName: enq.company_name || "",
                        number: enq.enquiry_no || "",
                        createdAt: enq.created_at,
                        orderReceivedStatus: t.is_order_received_status || "no",
                        quotationNumber: t.quotation_number || null,
                        quotationValueWithoutTax: t.quotation_value_without_tax ?? null,
                        quotationValueWithTax: t.quotation_value_with_tax ?? null,
                        quotationUpload: t.quotation_upload || null,
                        lostReason: [t.if_no_reason_status, t.if_no_reason_remark].filter(Boolean).join(" -- ") || null,
                    }));
                });

                // Attach latest quotations for this chunk
                const chunkWithQuotes = await attachQuotations(chunkMapped);
                allAccumulated.push(...chunkWithQuotes);

                // Yield progressive batch immediately to frontend!
                if (onProgress) {
                    onProgress([...allAccumulated], {
                        totalCount: totalCount || allAccumulated.length,
                        isDone: false,
                    });
                }
            }

            if (trackerChunk.length < size) {
                // Reached the end of available tracker rows
                break;
            }
            currentOffset += size;
        }

        if (onProgress) {
            onProgress([...allAccumulated], {
                totalCount: allAccumulated.length,
                isDone: true,
            });
        }

        return allAccumulated;
    }

    throw new Error(`Unknown Lost Details source: ${source}`);
}

export { parseMoney };
