// Shared model + maths for the two-series (Lite Plus / Ultra Tough) quotation.
//
// A normal item has ONE common `qty` and a `series: { lite, ultra }` pair; each
// series block holds its own spec / rate / discounts / amount / remarks plus a
// `selected` flag. The customer takes either Lite Plus OR Ultra Tough for an
// item (never both), so only one series per item can be selected.
//
// The flat fields the rest of the app reads (`amount`, `flatDiscount`) are
// DERIVED from the selected series, so subtotal / tax / grand total keep
// working unchanged. Freight and Packaging & Forwarding stay "simple" items
// (no series): they use the flat qty / rate / discount / amount fields.

export const SERIES = [
  { key: "lite", title: "LITE PLUS SERIES", note: "Max 10% Discount", warranty: "6 months warranty", maxDiscount: 10 },
  { key: "ultra", title: "ULTRA TOUGH SERIES", note: "", warranty: "1 Year warranty", maxDiscount: null },
];

export const emptySeries = () => ({
  spec: "",
  remarks: "",
  image: "", // image link (item master)
  video: "", // video link (item master)
  rate: 0,
  discount: 0,
  flatDiscount: 0,
  amount: 0,
  selected: false,
});

const num = (v) => Number(v) || 0;

// qty is the item's common quantity.
export const calcSeriesAmount = (qty, s) => {
  const base = num(qty) * num(s.rate);
  const afterPercent = base * (1 - num(s.discount) / 100);
  return Math.max(0, afterPercent - num(s.flatDiscount));
};

export const isFreightItem = (item) => Boolean(item?.isFreight) || item?.name === "Freight";
export const isPackagingItem = (item) =>
  (item?.name || "").trim().toUpperCase() === "PACKAGING AND FORWARDING";
export const isSimpleItem = (item) => isFreightItem(item) || isPackagingItem(item);

// Series block of an item. Items without `series` (e.g. a revision loaded from
// the database, which only has flat fields) are shown as a selected Lite row.
export const getSeries = (item, key) => {
  if (item?.series?.[key]) {
    const block = { ...emptySeries(), ...item.series[key] };
    block.amount = calcSeriesAmount(item.qty, block);
    return block;
  }
  const savedKey = item?.seriesType === "ut_series" ? "ultra" : "lite";
  if (key === savedKey && item && !isSimpleItem(item) && num(item.rate) > 0) {
    return {
      ...emptySeries(),
      spec: item.description || "",
      remarks: item.remarks || "",
      rate: item.rate,
      discount: item.discount,
      flatDiscount: item.flatDiscount,
      amount: item.amount,
      selected: true,
    };
  }
  return emptySeries();
};

// Writes the derived flat fields from the selected series (simple items are
// returned untouched).
export const withDerived = (item) => {
  if (isSimpleItem(item)) return item;
  const lite = getSeries(item, "lite");
  const ultra = getSeries(item, "ultra");
  const chosen = [lite, ultra].find((s) => s.selected);
  return {
    ...item,
    series: { lite, ultra },
    amount: chosen ? num(chosen.amount) : 0,
    flatDiscount: chosen ? num(chosen.flatDiscount) : 0,
  };
};

export const updateSeriesField = (item, key, field, value) => {
  const other = key === "lite" ? "ultra" : "lite";
  const next = { ...getSeries(item, key), [field]: value };
  let otherBlock = getSeries(item, other);
  if (field === "selected" && value) otherBlock = { ...otherBlock, selected: false }; // either one, never both
  if (["rate", "discount", "flatDiscount"].includes(field)) next.amount = calcSeriesAmount(item.qty, next);
  return withDerived({ ...item, series: { [key]: next, [other]: otherBlock } });
};

// Common qty changed: both series amounts follow it.
export const updateItemQty = (item, qty) => withDerived({ ...item, qty });

// Fill a row from an item master item ({ name, code, unit, lite, ultra } --
// see utils/itemCatalog.js). Both series are pre-filled with the item's spec /
// rate / remarks / image / video; a series with no rate is "not offered".
// GST stays whatever the user picked on the row. Nothing is selected by default.
export const applySheetItemToRow = (row, sheetItem, { code, qty } = {}) => {
  const nextQty = qty ?? (num(row.qty) > 0 ? row.qty : 1);
  const build = (s) => {
    const block = {
      ...emptySeries(),
      spec: s.spec || "",
      remarks: s.remarks || "",
      image: s.image || "",
      video: s.video || "",
      rate: num(s.rate),
    };
    block.amount = calcSeriesAmount(nextQty, block);
    return block;
  };
  return withDerived({
    ...row,
    name: sheetItem.name,
    code: code ?? sheetItem.code ?? row.code ?? "",
    gst: row.gst ?? 18,
    units: sheetItem.unit || row.units || "Nos",
    qty: nextQty,
    series: { lite: build(sheetItem.lite), ultra: build(sheetItem.ultra) },
  });
};

// Case-insensitive lookup of an item by name.
export const findSheetItem = (sheetItems, name) => {
  const key = (name || "").toLowerCase().trim();
  if (!key) return null;
  return (sheetItems || []).find((it) => it.name.toLowerCase().trim() === key) || null;
};

export const newSeriesItem = (id) => ({
  id,
  code: "",
  name: "",
  description: "",
  gst: 18,
  units: "Nos",
  qty: 1,
  rate: 0,
  discount: 0,
  flatDiscount: 0,
  amount: 0,
  series: { lite: emptySeries(), ultra: emptySeries() },
});

// Carry the user's discount / flat discount / selection from an existing row
// onto a freshly built one (same item re-filled), recomputing the amounts.
export const mergeSeriesSettings = (row, existing) => {
  if (!existing?.series || isSimpleItem(row)) return row;
  const merged = {};
  SERIES.forEach(({ key }) => {
    const prev = existing.series[key] || {};
    const block = { ...getSeries(row, key) };
    block.discount = num(prev.discount);
    block.flatDiscount = num(prev.flatDiscount);
    block.selected = Boolean(prev.selected);
    block.amount = calcSeriesAmount(row.qty, block);
    merged[key] = block;
  });
  if (merged.lite.selected && merged.ultra.selected) merged.ultra.selected = false;
  return withDerived({ ...row, series: merged });
};

// A row for an item name coming from a lead / enquiry: matched against the
// item master (both series pre-filled, common qty = enquiry qty); an item
// that isn't in the item master becomes a manual row.
export const buildRowFromName = ({ id, name, qty, code, sheetItems }) => {
  const base = { ...newSeriesItem(id), name, code: code || "", qty: qty || 1 };
  const sheetItem = findSheetItem(sheetItems, name);
  if (sheetItem) return applySheetItemToRow(base, sheetItem, { code, qty: qty || 1 });
  return withDerived(base);
};

// ---- Per-series comparison summary (ALL items, selected or not) -----------
// Amount / tax / grand total as if the customer took this series for every
// item. Freight and Packaging apply in both. Amounts already have each item's
// % and flat discount taken off, so the flat discount is shown for
// information and is NOT deducted a second time.
export const computeSeriesSummary = (items, key, { isIGST = false, specialDiscount = 0 } = {}) => {
  let subtotal = 0;
  let flat = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  (items || []).forEach((item) => {
    const simple = isSimpleItem(item);
    const amount = simple ? num(item.amount) : num(getSeries(item, key).amount);
    subtotal += amount;
    flat += simple ? num(item.flatDiscount) : num(getSeries(item, key).flatDiscount);
    const rate = num(item.gst);
    if (amount <= 0 || rate <= 0) return;
    if (isIGST) igst += (amount * rate) / 100;
    else {
      cgst += (amount * (rate / 2)) / 100;
      sgst += (amount * (rate / 2)) / 100;
    }
  });
  const round = (v) => Math.round(v * 100) / 100;
  subtotal = round(subtotal);
  cgst = round(cgst);
  sgst = round(sgst);
  igst = round(igst);
  const special = num(specialDiscount);
  const taxTotal = round(cgst + sgst + igst);
  return {
    subtotal,
    flat: round(flat),
    cgst,
    sgst,
    igst,
    taxTotal,
    special,
    grand: Math.max(0, round(subtotal + taxTotal - special)),
  };
};

// Footer rows (label + value for one series' summary), honouring the
// Hide/Show toggles. Used by the form table, the preview and the PDF.
export const summaryRows = (summary, isIGST, hidden = {}) => {
  const rows = [];
  if (!hidden.hideSubtotal) rows.push({ id: "subtotal", label: "Amount Total", value: summary.subtotal });
  if (!hidden.hideTotalFlatDisc && summary.flat > 0) {
    rows.push({ id: "flat", label: "Flat Discount (already deducted)", value: summary.flat });
  }
  if (isIGST) {
    if (!hidden.hideIGST) rows.push({ id: "igst", label: "IGST", value: summary.igst });
  } else {
    if (!hidden.hideCGST) rows.push({ id: "cgst", label: "CGST", value: summary.cgst });
    if (!hidden.hideSGST) rows.push({ id: "sgst", label: "SGST", value: summary.sgst });
  }
  if (!hidden.hideSpecialDiscount && summary.special > 0) {
    rows.push({ id: "special", label: "Special Discount", value: -summary.special });
  }
  if (!hidden.hideGrandTotal) rows.push({ id: "grand", label: "Grand Total", value: summary.grand, bold: true });
  return rows;
};
