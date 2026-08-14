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

// Reverse map (code -> canonical display name) for backfilling rows that
// have a state_code but no state name.
const CODE_TO_STATE_NAME = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  10: "Bihar",
  11: "Sikkim",
  12: "Arunachal Pradesh",
  13: "Nagaland",
  14: "Manipur",
  15: "Mizoram",
  16: "Tripura",
  17: "Meghalaya",
  18: "Assam",
  19: "West Bengal",
  20: "Jharkhand",
  21: "Odisha",
  22: "Chhattisgarh",
  23: "Madhya Pradesh",
  24: "Gujarat",
  25: "Daman and Diu",
  26: "Dadra and Nagar Haveli",
  27: "Maharashtra",
  28: "Andhra Pradesh (Old)",
  29: "Karnataka",
  30: "Goa",
  31: "Lakshadweep",
  32: "Kerala",
  33: "Tamil Nadu",
  34: "Puducherry",
  35: "Andaman and Nicobar Islands",
  36: "Telangana",
  37: "Andhra Pradesh (New)",
  38: "Ladakh",
  97: "Other Territory",
  99: "Centre Jurisdiction",
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

/**
 * @param {string} stateCode - e.g. "22", "5"
 * @returns {string|null} canonical state name, or null if unrecognized.
 */
export const getStateNameFromCode = (stateCode) => {
  const code = (stateCode || "").trim().padStart(2, "0");
  if (!code) return null;
  return CODE_TO_STATE_NAME[code] || null;
};
