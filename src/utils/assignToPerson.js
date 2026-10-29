// "Enquiry Assign to Person" is multi-select: lto_enquiries /
// lto_call_tracker_for_leads.enquiry_assign_to_person is a text[] (see
// Database/27_enquiry_assign_to_person_array.sql). These helpers also accept
// the older single text value, so a row is read the same way either side of
// that migration.

// -> clean array of unique, trimmed, non-blank names ([] when none)
export const toPersonList = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(value.map((x) => String(x ?? "").trim()).filter(Boolean))];
  }
  if (value === null || value === undefined) return [];
  const s = String(value).trim();
  return s ? [s] : [];
};

// -> "A, B" for display / CSV / sheet-style text ("" when none)
export const formatPersons = (value) => toPersonList(value).join(", ");

// -> what to write to the text[] column: the array, or null when empty
export const toDbPersons = (value) => {
  const list = toPersonList(value);
  return list.length ? list : null;
};

// Same set of people (order does not matter)?
export const samePersons = (a, b) => {
  const x = [...toPersonList(a)].sort();
  const y = [...toPersonList(b)].sort();
  return x.length === y.length && x.every((p, i) => p === y[i]);
};
