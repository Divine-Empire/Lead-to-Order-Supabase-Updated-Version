"use client";

import { DownloadIcon, SaveIcon, ShareIcon } from "../../components/Icons";
import QuotationHeader from "./quotation-header";
import QuotationForm from "./quotation-form";
import QuotationPreview from "./quotation-preview";
import supabase from "../../utils/supabase";

// export const getNextQuotationNumber = async (companyPrefix = "NBD") => {
//   try {
//     // Get the latest quotation number with the given prefix
//     const { data, error } = await supabase
//       .from('Make_Quotation')
//       .select('Quotation_No')
//       .ilike('Quotation_No', `${companyPrefix}-%`)
//       .order('Timestamp', { ascending: false })
//       .limit(1)

//     if (error) {
//       console.error('Error fetching quotation numbers:', error)
//       return `${companyPrefix}-001`
//     }

//     if (!data || data.length === 0) {
//       return `${companyPrefix}-001`
//     }

//     const lastQuotationNo = data[0].Quotation_No
//     const parts = lastQuotationNo.split('-')

//     if (parts.length >= 2) {
//       const lastNumber = parseInt(parts[parts.length - 1]) || 0
//       const newNumber = (lastNumber + 1).toString().padStart(3, '0')
//       return `${companyPrefix}-${newNumber}`
//     }

//     return `${companyPrefix}-001`
//   } catch (error) {
//     console.error("Error getting next quotation number:", error)
//     return `${companyPrefix}-001`
//   }
// }

export const getCurrentFinancialYear = () => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // January is 0

  let financialYearStart, financialYearEnd;

  if (currentMonth >= 4) {
    // April to March - current year to next year
    financialYearStart = currentYear;
    financialYearEnd = currentYear + 1;
  } else {
    // January to March - previous year to current year
    financialYearStart = currentYear - 1;
    financialYearEnd = currentYear;
  }

  // Return last two digits of years
  return {
    start: financialYearStart.toString().slice(-2),
    end: financialYearEnd.toString().slice(-2),
  };
};

// Update the getNextQuotationNumber function
export const getNextQuotationNumber = async (prefix = "NBD") => {
  try {
    const financialYear = getCurrentFinancialYear();
    const yearPrefix = `${prefix}-${financialYear.start}-${financialYear.end}`;

    // Fetch ALL quotations matching the prefix and current year -- an
    // unbounded select() gets silently capped at 1000 rows by PostgREST, so
    // once a prefix/year combination passes 1000 quotations (CRR-26-27 hit
    // 1995), the un-paginated version of this query only ever saw a subset
    // and computed a stale max, handing back a quotation_no that already
    // existed (e.g. returning "CRR-26-27-1760" as "next" when the true max
    // was already 1765) -- every save then failed on the unique constraint
    // and the handful of +1 retries in Quotation.jsx couldn't close a gap
    // that size. Paging through all matches keeps this correct regardless
    // of how many quotations a given prefix/year accumulates.
    let data = [];
    let from = 0;
    const step = 1000;
    let fetchMore = true;

    while (fetchMore) {
      const { data: page, error } = await supabase
        .from("lto_make_quotations")
        .select("quotation_no")
        .like("quotation_no", `${yearPrefix}-%`)
        .range(from, from + step - 1);

      if (error) {
        console.error("Error fetching latest quotations:", error);
        return `${yearPrefix}-001`; // Start from 001
      }

      if (page && page.length > 0) {
        data = data.concat(page);
        from += step;
        if (page.length < step) fetchMore = false;
      } else {
        fetchMore = false;
      }
    }

    let maxNumber = 0; // Default to 0 if no records found

    if (data && data.length > 0) {

      data.forEach((item) => {
        const quotationNo = item.quotation_no || item.Quotation_No;
        if (!quotationNo) return;
        const parts = quotationNo.split("-");

        // The serial number should be the 4th part (index 3)
        // Format: NBD-25-26-001 -> ["NBD", "25", "26", "001"]
        // Format: NBD-25-26-001-01 (Revision) -> ["NBD", "25", "26", "001", "01"]
        if (parts.length >= 4) {
          const serialPart = parts[3];
          const serialNumber = parseInt(serialPart, 10);
          if (!isNaN(serialNumber) && serialNumber > maxNumber) {
            maxNumber = serialNumber;
          }
        }
      });
    }

    const nextNumber = (maxNumber + 1).toString().padStart(3, "0");
    const result = `${yearPrefix}-${nextNumber}`;
    return result;

  } catch (error) {
    console.error("Error generating quotation number:", error);
    const financialYear = getCurrentFinancialYear();
    return `${prefix}-${financialYear.start}-${financialYear.end}-001`;
  }
};

// The only prefix codes a quotation number is allowed to be built from.
// Anything else (a stray value like "Lead", a free-typed note, etc.) must
// never reach getNextQuotationNumber() as-is -- see isValidSalesTypePrefix.
export const VALID_SALES_TYPE_PREFIXES = ["CRR", "NBD", "NBD_CRR"];

export const isValidSalesTypePrefix = (value) =>
  VALID_SALES_TYPE_PREFIXES.includes((value || "").trim().toUpperCase());

// Function to get company prefix, sourced from lto_client_master --
// client_master is the record that actually gets kept current (e.g. the
// NBD -> NBD_CRR upgrade on order conversion, see
// syncClientOnOrderConversion in orderConversionClientSync.js), whereas a
// lead/enquiry's own sales_type is frozen at whatever it was when that
// lead/enquiry was created.
//
// Returns null (NOT a default) when client_master has no matching row, or
// its sales_type is blank/invalid -- callers decide the next fallback step
// (e.g. the lead/enquiry's own sales_type) themselves; baking "NBD" in here
// would make that next step unreachable.
export const getCompanyPrefix = async (companyName) => {
  const trimmedName = (companyName || "").trim();
  if (!trimmedName) return null;

  try {
    const { data, error } = await supabase
      .from("lto_client_master")
      .select("sales_type")
      .ilike("company_name", trimmedName)
      .limit(1)
      .maybeSingle();

    if (!error && data && isValidSalesTypePrefix(data.sales_type)) {
      return data.sales_type.trim().toUpperCase();
    }

    return null;
  } catch (error) {
    console.error("Error getting company prefix:", error);
    return null;
  }
};


