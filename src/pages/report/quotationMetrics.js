import supabase from "../../utils/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { parseMoney } from "./lostDetailsData";

// Quotation helpers shared by the Calling Data and FOS Report tabs, so both
// compute quotation counts/values and converted-order values identically.

// Root number of a quotation: strips a trailing "-NN" revision suffix
// (CRR-26-27-2549-01 -> CRR-26-27-2549).
export const getRootQuotationNo = (quotationNo) => {
    const parts = String(quotationNo || "").trim().split("-");
    return parts.length === 5 && /^\d{1,2}$/.test(parts[4]) ? parts.slice(0, 4).join("-") : String(quotationNo || "").trim();
};

// The revision suffix as a number (0 for the root itself).
export const getQuotationRevision = (quotationNo) => {
    const parts = String(quotationNo || "").trim().split("-");
    return parts.length === 5 && /^\d{1,2}$/.test(parts[4]) ? parseInt(parts[4], 10) : 0;
};

// Enquiry-tracker rows -> one row per (record, quotation family), keeping the
// highest revision of each family (root + its revisions count once).
export const latestQuotationPerFamily = (rows, idCol) => {
    const families = new Map();
    (rows || []).forEach(r => {
        const quotationNo = String(r.quotation_number || "").trim();
        if (!r[idCol] || !quotationNo) return;
        const key = `${r[idCol]}|${getRootQuotationNo(quotationNo).toUpperCase()}`;
        const current = families.get(key);
        if (!current || getQuotationRevision(quotationNo) > getQuotationRevision(current.quotation_number)) {
            families.set(key, { ...r, quotation_number: quotationNo });
        }
    });
    return [...families.values()];
};

// Converted Order Value lookup: the order row's own value is usually empty,
// so the value comes from the tracker row(s) carrying the SAME
// quotation_number the order was placed on (i.e. the exact revision that was
// ordered), whatever their date or stage -- the make-quotation row is
// preferred, but some quotations have no make-quotation row at all (only a
// later-stage row). If no tracker row has a value, fall back to the
// quotation's item amounts (lto_make_quotation_items), the same figure.
// Returns Map<quotation_number, value>.
export const fetchOrderQuotationValues = async (table, orderRows) => {
    const quotationNos = [...new Set((orderRows || [])
        .map(r => String(r.quotation_number || "").trim()).filter(Boolean))];
    const valueByQuotationNo = new Map();
    for (let i = 0; i < quotationNos.length; i += 100) {
        const noChunk = quotationNos.slice(i, i + 100);
        const { data } = await fetchAllRows(() =>
            supabase.from(table)
                .select("quotation_number, quotation_value_without_tax, current_stage")
                .in("quotation_number", noChunk)
        );
        const rows = [...(data || [])].sort((a, b) =>
            (b.current_stage === "make-quotation") - (a.current_stage === "make-quotation"));
        rows.forEach(r => {
            const no = String(r.quotation_number || "").trim();
            const value = parseMoney(r.quotation_value_without_tax);
            if (no && value > 0 && !valueByQuotationNo.has(no)) valueByQuotationNo.set(no, value);
        });
    }

    const missingNos = quotationNos.filter(no => !valueByQuotationNo.has(no));
    for (let i = 0; i < missingNos.length; i += 100) {
        const noChunk = missingNos.slice(i, i + 100);
        const { data: quotations } = await fetchAllRows(() =>
            supabase.from("lto_make_quotations").select("id, quotation_no").in("quotation_no", noChunk)
        );
        const noById = new Map((quotations || []).map(q => [q.id, String(q.quotation_no).trim()]));
        if (noById.size === 0) continue;
        const { data: items } = await fetchAllRows(() =>
            supabase.from("lto_make_quotation_items").select("quotation_id, amount").in("quotation_id", [...noById.keys()])
        );
        (items || []).forEach(it => {
            const no = noById.get(it.quotation_id);
            if (no) valueByQuotationNo.set(no, (valueByQuotationNo.get(no) || 0) + parseMoney(it.amount));
        });
    }
    return valueByQuotationNo;
};
