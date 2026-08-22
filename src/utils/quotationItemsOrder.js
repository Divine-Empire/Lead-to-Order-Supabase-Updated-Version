// Freight is a synthetic line item (isFreight: true / name === "Freight")
// that must always render LAST and grey-highlighted, everywhere a
// quotation's item list is shown or persisted -- the live editor
// (items-table.jsx) already enforces this by filtering Freight out and
// rendering it as its own dedicated last row, but every other consumer
// (preview, PDF, save, revision-load) was just trusting whatever order the
// array/DB happened to hand back, so Freight could drift into the middle
// the moment items were added after a revision reload or any other path
// that didn't go through items-table.jsx's own splice-before-Freight logic.
//
// Single source of truth for "is this row the Freight row" and "put
// Freight last" -- use this at every boundary (load, save, preview, PDF)
// instead of re-deriving the check ad hoc.
export const isFreightItem = (item) => !!(item && (item.isFreight || item.name === "Freight"));

export const putFreightLast = (items) => {
  const list = items || [];
  const freight = list.find(isFreightItem);
  const rest = list.filter((item) => !isFreightItem(item));
  return freight ? [...rest, freight] : rest;
};
