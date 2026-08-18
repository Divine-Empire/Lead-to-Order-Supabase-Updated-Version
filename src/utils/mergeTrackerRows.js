// lto_enquiry_tracker / lto_enquiry_tracker_for_leads (and their lead-side
// call-tracker equivalent) are all append-only: every stage submission
// (Make Quotation, Quotation Validation, Order Expected, Order Status, ...)
// inserts a brand-new row rather than updating one in place, and each stage
// form only ever sets the handful of columns it actually collects -- e.g.
// the Order Expected stage only writes next_call_date/next_call_time, so a
// later row has null quotation_number/quotation_value_without_tax/etc. even
// though an earlier row already set them.
//
// Reading the single newest row therefore loses whatever the newest row
// didn't itself touch. Merging every row chronologically -- later non-empty
// value wins per field, earlier values carry forward untouched otherwise --
// gives the correct "current state" of the record: fields every stage sets
// (current_stage, enquiry_status, ...) end up as the true latest value,
// while stage-specific fields persist until a later row actually overwrites
// them.
//
// `rows` must already be sorted oldest-first (ascending created_at) --
// this function does not sort.
export function mergeRowsChronologically(rows) {
  return rows.reduce((merged, current) => {
    Object.keys(current).forEach((key) => {
      const value = current[key];
      if (value !== null && value !== undefined && value !== "") {
        merged[key] = value;
      }
    });
    return merged;
  }, {});
}
