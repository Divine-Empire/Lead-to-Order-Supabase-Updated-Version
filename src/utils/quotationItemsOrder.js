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

// "PACKAGING AND FORWARDING" has no persisted flag column of its own (unlike
// Freight's is_freight on lto_make_quotation_items) -- name is the only
// reliable way to identify it, both live and after loading a saved/revised
// quotation.
export const isPackagingItem = (item) =>
  !!(item && (item.name || "").trim().toUpperCase() === "PACKAGING AND FORWARDING");

export const putFreightLast = (items) => {
  const list = items || [];
  const freight = list.find(isFreightItem);
  const rest = list.filter((item) => !isFreightItem(item));
  return freight ? [...rest, freight] : rest;
};

// Pins Packaging & Forwarding (if present) then Freight (if present) as the
// last one/two rows, in that exact order -- everything else keeps its
// existing relative order untouched. This is the shared "final order"
// every save/load boundary must agree on: lto_make_quotation_items has no
// ordering guarantee of its own (see item_order below), so both the save
// path (Quotation.jsx, assigning item_order from this order) and the load
// path (quotationDataLoader.js, as a defensive re-pin after sorting by
// item_order) run every item list through this exact function.
export const putPackagingAndFreightLast = (items) => {
  const list = items || [];
  const packaging = list.find(isPackagingItem);
  const freight = list.find(isFreightItem);
  const rest = list.filter((item) => !isPackagingItem(item) && !isFreightItem(item));
  const tail = [packaging, freight].filter(Boolean);
  return [...rest, ...tail];
};
