import { useState, useCallback } from "react";

// Module-scope (not component-scope) storage for Enquiry Tracker's filters
// (Calling Days, Value, Current Stage, Item, Quotation Copy). Same idea as
// call-tracker/dateFilterPersistence.js: a plain useState resets every time
// EnquiryTracker unmounts -- which React Router does whenever the user
// opens another page (e.g. an enquiry/quotation form) and comes back -- so
// the applied filters were silently lost after an operation. The module
// stays loaded for the life of the SPA session, so the selection survives
// that, while a real browser reload still resets it.
const store = {
  callingDays: [],
  value: "",
  stage: [],
  item: [],
  copy: "",
};

// Same as useState(initial), but the value is kept in `store[key]` so it
// is the starting value the next time the page mounts.
export function usePersistedFilter(key) {
  const [value, setValueState] = useState(() => store[key]);
  const setValue = useCallback(
    (next) => {
      const resolved = typeof next === "function" ? next(store[key]) : next;
      store[key] = resolved;
      setValueState(resolved);
    },
    [key]
  );
  return [value, setValue];
}
