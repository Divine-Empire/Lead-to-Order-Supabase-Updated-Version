import supabase from "../../utils/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { mergeRowsChronologically } from "../../utils/mergeTrackerRows";

// Shared by both the Lost Details tab's SC summary (Report.jsx) and its
// per-SC drill-down page (LostDetailsPage.jsx) -- both need the exact same
// "current state per lead/enquiry" computation, just aggregated differently.
//
// "Lost" = is_order_received_status === "no" on lto_enquiry_tracker /
// lto_enquiry_tracker_for_leads -- i.e. a quotation was sent and the
// customer's order did NOT come through -- confirmed via psql against the
// live DB. NOT enquiry_status (that column only ever holds hot/warm/cold,
// the lead's temperature -- a completely different field with no
// "not-interested" value at all, despite that being the "Lost" value used by
// the unrelated call-tracker tables/views).
//
// These tracker tables are append-only (one new row per stage submission),
// so a later "Order Status" row setting is_order_received_status = "no"
// doesn't erase the quotation_number/value fields an earlier "Make
// Quotation" row set -- every row has to be merged chronologically
// (mergeRowsChronologically: later non-empty value wins per field) to get
// the record's true current state, exactly like enquiry-tracker/queries.js's
// attachMergedTrackerFields does for the Pending tab.
const parseMoney = (v) => {
    const value = parseFloat(String(v ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
    return isNaN(value) ? 0 : value;
};

const SOURCE_CONFIG = {
    lead: {
        table: "lto_leads",
        idField: "lead_id",
        scField: "lead_receiver_name",
        numberField: "lead_no",
        trackerTable: "lto_enquiry_tracker_for_leads",
    },
    enquiry: {
        table: "lto_enquiries",
        idField: "enquiry_id",
        scField: "enquiry_assign_to_person",
        numberField: "enquiry_no",
        trackerTable: "lto_enquiry_tracker",
    },
};

// Returns one row per lead/enquiry of the given source, regardless of
// status -- callers filter to isLostStatus(...) (Lost) themselves, since the
// SC summary also needs the UNFILTERED total count per SC as its
// denominator.
//
// `startDateISO`/`endDateISO` (optional) bound the lead/enquiry's OWN
// created_at, same convention as the rest of Report.jsx's tabs -- a record
// created outside the range is excluded even if it was later marked lost
// inside the range.
export async function fetchLostDetails({ source, startDateISO, endDateISO }) {
    const cfg = SOURCE_CONFIG[source];
    if (!cfg) throw new Error(`Unknown Lost Details source: ${source}`);

    // IMPORTANT: build a brand-new query builder on every call -- fetchAllRows
    // fires several `.range()` calls in parallel, and supabase-js's builder
    // mutates itself in place rather than returning a fresh copy per call.
    // Passing one already-built instance (reused across those parallel
    // calls) lets concurrent `.range()` calls race on the same object and
    // corrupts the result -- this is what silently zeroed out the Leads
    // column before. A plain closure that re-builds the query each time it's
    // invoked avoids that entirely, same as every other fetchAllRows call
    // site in Report.jsx.
    const buildBaseQuery = () => {
        let q = supabase.from(cfg.table).select(`id, ${cfg.scField}, ${cfg.numberField}, company_name, created_at`);
        if (startDateISO) q = q.gte("created_at", startDateISO);
        if (endDateISO) q = q.lte("created_at", endDateISO);
        return q;
    };
    const { data: baseRecords, error: baseErr } = await fetchAllRows(buildBaseQuery);
    if (baseErr) throw baseErr;

    // Tracker rows: floor-only bound (no upper bound) -- a tracker row can
    // never predate the record it belongs to, so `created_at >= startDateISO`
    // already captures every tracker row for any in-range record, while
    // deliberately not capping the upper end keeps "is it currently lost"
    // correct even when endDateISO is in the past.
    const buildTrackerQuery = () => {
        let q = supabase.from(cfg.trackerTable).select(
            `${cfg.idField}, created_at, is_order_received_status, if_no_reason_status, if_no_reason_remark, quotation_number, quotation_value_without_tax, quotation_value_with_tax, quotation_upload`
        );
        if (startDateISO) q = q.gte("created_at", startDateISO);
        return q;
    };
    const { data: trackerRows, error: trackerErr } = await fetchAllRows(buildTrackerQuery);
    if (trackerErr) throw trackerErr;

    const trackerByRecordId = new Map();
    (trackerRows || []).forEach((t) => {
        const recId = t[cfg.idField];
        if (!recId) return;
        if (!trackerByRecordId.has(recId)) trackerByRecordId.set(recId, []);
        trackerByRecordId.get(recId).push(t);
    });

    const mergedByRecordId = new Map();
    trackerByRecordId.forEach((rows, recId) => {
        const sorted = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        mergedByRecordId.set(recId, mergeRowsChronologically(sorted));
    });

    let result = (baseRecords || []).map((rec) => {
        const merged = mergedByRecordId.get(rec.id) || {};
        return {
            id: rec.id,
            source,
            scName: rec[cfg.scField] || null,
            companyName: rec.company_name || "",
            number: rec[cfg.numberField] || "",
            createdAt: rec.created_at,
            orderReceivedStatus: merged.is_order_received_status || null,
            quotationNumber: merged.quotation_number || null,
            quotationValueWithoutTax: merged.quotation_value_without_tax ?? null,
            quotationValueWithTax: merged.quotation_value_with_tax ?? null,
            quotationUpload: merged.quotation_upload || null,
            lostReason: [merged.if_no_reason_status, merged.if_no_reason_remark].filter(Boolean).join(" -- ") || null,
        };
    });

    // Overlay the TRUE latest quotation from lto_make_quotations, same
    // approach as enquiry-tracker/queries.js's attachLatestQuotations -- a
    // quotation created/revised directly from the Quotation module never
    // reaches the tracker table on its own, so the tracker-derived fields
    // above can be stale/blank even though a real (possibly newer) quotation
    // exists. Matched by the record's own lead_no/enquiry_no against
    // lto_make_quotations.enquiry_reference_no.
    //
    // Fetched as the WHOLE table (paginated via fetchAllRows) rather than
    // `.in("enquiry_reference_no", refs)` scoped to just this batch's
    // numbers -- with thousands of enquiries in a single Lost Details fetch,
    // that `.in()` list built a GET URL long enough to be rejected outright
    // (414/CORS failure in the browser), silently breaking the whole
    // quotation overlay. lto_make_quotations is a few thousand rows, well
    // within what this app already pages through elsewhere (SC Pipeline
    // pages ~26k tracker rows the same way).
    const refs = new Set(result.map((r) => String(r.number || "").trim().toUpperCase()).filter(Boolean));
    if (refs.size > 0) {
        const { data: quotations, error: qErr } = await fetchAllRows(() =>
            supabase.from("lto_make_quotations").select("id, quotation_no, enquiry_reference_no, grand_total, pdf_url, created_at")
        );
        if (!qErr && quotations && quotations.length > 0) {
            const latestByRef = new Map();
            quotations.forEach((q) => {
                const ref = String(q.enquiry_reference_no || "").trim().toUpperCase();
                if (!ref || !refs.has(ref)) return;
                const existing = latestByRef.get(ref);
                if (!existing || new Date(q.created_at) > new Date(existing.created_at)) latestByRef.set(ref, q);
            });

            // lto_make_quotations has no "value without tax" column of its
            // own (grand_total is post-tax) -- summed from line items, same
            // as Report.jsx's Calling Data tab and attachLatestQuotations.
            // Same full-table-fetch reasoning as above applies here too.
            const latestIds = new Set(Array.from(latestByRef.values()).map((q) => q.id));
            const amountByQId = new Map();
            if (latestIds.size > 0) {
                const { data: items } = await fetchAllRows(() =>
                    supabase.from("lto_make_quotation_items").select("quotation_id, amount")
                );
                (items || []).forEach((it) => {
                    if (!latestIds.has(it.quotation_id)) return;
                    amountByQId.set(it.quotation_id, (amountByQId.get(it.quotation_id) || 0) + parseMoney(it.amount));
                });
            }

            result = result.map((row) => {
                const ref = String(row.number || "").trim().toUpperCase();
                const latest = latestByRef.get(ref);
                if (!latest) return row; // no quotation exists yet -- genuinely blank
                return {
                    ...row,
                    quotationNumber: latest.quotation_no,
                    quotationValueWithoutTax: amountByQId.get(latest.id) ?? row.quotationValueWithoutTax,
                    quotationValueWithTax: latest.grand_total ?? row.quotationValueWithTax,
                    quotationUpload: latest.pdf_url || row.quotationUpload,
                };
            });
        }
    }

    return result;
}

// "no" (Order Status stage: "was the order received?" -> No) -- case varies
// in the live data ("no" / "No"), hence the normalize. Deliberately excludes
// "hold" (customer_order_hold_reason_category -- a separate, still-open
// state, not a loss) and blank/null (never resolved either way yet).
export const isLostStatus = (orderReceivedStatus) => String(orderReceivedStatus || "").trim().toLowerCase() === "no";

export { parseMoney };
