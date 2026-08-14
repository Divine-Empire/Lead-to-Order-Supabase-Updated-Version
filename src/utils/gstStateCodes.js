// Standard Indian GST state/UT codes. There was no state-name -> state-code
// mapping anywhere in the codebase -- every place that captured a
// "state code" made the user type it in free-text (DirectEnquiryForm.jsx),
// while places that captured a full state name (Leads.jsx,
// orderConversionClientSync.js) never derived/stored a code at all. This is
// what lets a lto_client_master row end up with `state` set and
// `state_code` null (or vice versa), which is what leaves the Quotation
// revision loader's Consignee "State" field blank -- it reads straight from
// that row (see quotationDataLoader.js).

const GST_STATE_CODES = {
  "JAMMU AND KASHMIR": "01",
  "HIMACHAL PRADESH": "02",
  PUNJAB: "03",
  CHANDIGARH: "04",
  UTTARAKHAND: "05",
  UTTARANCHAL: "05",
  HARYANA: "06",
  DELHI: "07",
  "NCT OF DELHI": "07",
  "NEW DELHI": "07",
  RAJASTHAN: "08",
  "UTTAR PRADESH": "09",
  BIHAR: "10",
  SIKKIM: "11",
  "ARUNACHAL PRADESH": "12",
  NAGALAND: "13",
  MANIPUR: "14",
  MIZORAM: "15",
  TRIPURA: "16",
  MEGHALAYA: "17",
  ASSAM: "18",
  "WEST BENGAL": "19",
  JHARKHAND: "20",
  ODISHA: "21",
  ORISSA: "21",
  CHHATTISGARH: "22",
  CHATTISGARH: "22",
  "MADHYA PRADESH": "23",
  GUJARAT: "24",
  "DAMAN AND DIU": "25",
  "DADRA AND NAGAR HAVELI": "26",
  "DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "26",
  MAHARASHTRA: "27",
  "ANDHRA PRADESH (OLD)": "28",
  KARNATAKA: "29",
  GOA: "30",
  LAKSHADWEEP: "31",
  KERALA: "32",
  "TAMIL NADU": "33",
  PUDUCHERRY: "34",
  PONDICHERRY: "34",
  "ANDAMAN AND NICOBAR ISLANDS": "35",
  TELANGANA: "36",
  "ANDHRA PRADESH": "37",
  "ANDHRA PRADESH (NEW)": "37",
  LADAKH: "38",
  "OTHER TERRITORY": "97",
  "CENTRE JURISDICTION": "99",
};

const normalize = (name) => (name || "").trim().toUpperCase().replace(/\s+/g, " ");

/**
 * @param {string} stateName - e.g. "Chhattisgarh", "andhra pradesh (new)"
 * @returns {string|null} 2-digit GST state code, or null if unrecognized.
 */
export const getStateCodeFromName = (stateName) => {
  const key = normalize(stateName);
  if (!key) return null;
  return GST_STATE_CODES[key] || null;
};
