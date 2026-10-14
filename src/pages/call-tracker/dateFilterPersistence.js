// Module-scope (not component-scope) storage for Call Tracker's "All
// Dates"/Today/Overdue/Upcoming checkbox filter. A plain useState resets to
// [] every time CallTracker unmounts -- which React Router does on every
// navigation away from the page -- so picking "Upcoming", browsing to
// another page, and coming back silently lost the selection. Living here
// instead survives that (the module stays loaded for the life of the SPA
// session) while still resetting on an actual browser reload, since the
// module gets re-evaluated from scratch then.
let persistedDateFilter = [];

export function getPersistedDateFilter() {
  return persistedDateFilter;
}

export function setPersistedDateFilter(value) {
  persistedDateFilter = Array.isArray(value) ? value : [];
}
