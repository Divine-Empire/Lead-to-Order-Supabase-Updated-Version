"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useCompressedImage, imageCandidates, isHttpUrl } from "./image-service";
import { PlusIcon, TrashIcon } from "../../components/Icons";
import {
  SERIES,
  getSeries,
  isFreightItem,
  isPackagingItem,
  isSimpleItem,
  computeSeriesSummary,
  summaryRows,
} from "./series-utils";

// Fixed widths (px) of the sticky left columns, so each one can offset the next.
const W_SNO = 48;
const W_CODE = 112;

const UNITS = ["Nos", "Kg", "Roll", "Rmt", "Ltr", "Bag", "Pair", "Set", "Mtr", "sqmtr", "Box", "Pc"];

// Band colours: Lite Plus uses the brand tint, Ultra Tough a light green.
const BAND = {
  lite: { head: "bg-brand-50 text-brand-800", cell: "bg-brand-50/50", ring: "focus:border-primary" },
  ultra: { head: "bg-[#DCFCE7] text-[#166534]", cell: "bg-[#F0FDF4]", ring: "focus:border-[#22C55E]" },
};

const money = (v) => Number(v || 0).toFixed(2);

// Shared totals recompute after removing an item (amounts / flat discounts are
// the values derived from the selected series -- see series-utils.js).
const recalcTotalsAfterRemoval = (items, isIGST) => {
  const subtotal = items.reduce((sum, current) => sum + Number(current.amount || 0), 0);
  const totalFlatDiscount = items.reduce((sum, current) => sum + Number(current.flatDiscount || 0), 0);

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  items.forEach((current) => {
    const amount = Number(current.amount || 0);
    let itemGST = Number(current.gst || 0);
    if (amount <= 0 || itemGST <= 0) return;
    if (String(current.gst).toUpperCase().includes("IGST")) itemGST = itemGST / 2;

    if (isIGST) {
      igstAmount += (amount * itemGST) / 100;
    } else {
      const contribution = (amount * (itemGST / 2)) / 100;
      cgstAmount += contribution;
      sgstAmount += contribution;
    }
  });

  const roundedSubtotal = Number(subtotal.toFixed(2));
  cgstAmount = Number(cgstAmount.toFixed(2));
  sgstAmount = Number(sgstAmount.toFixed(2));
  igstAmount = Number(igstAmount.toFixed(2));
  const total = Math.max(0, Number((roundedSubtotal + cgstAmount + sgstAmount + igstAmount).toFixed(2)));
  const pct = (part) => (roundedSubtotal > 0 ? Number(((part / roundedSubtotal) * 100).toFixed(2)) : 0);

  return {
    totalFlatDiscount,
    subtotal: roundedSubtotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    total,
    cgstRate: isIGST ? 0 : pct(cgstAmount),
    sgstRate: isIGST ? 0 : pct(sgstAmount),
    igstRate: isIGST ? pct(igstAmount) : 0,
  };
};

const parseNumber = (raw) => (raw === "" ? "" : Number.parseFloat(raw) || 0);

const blockArrowKeys = (e) => {
  if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
};

// Type-ahead picker over the item_master sheet. The list is positioned with
// `fixed` and mounted on document.body: the sticky table cells each create
// their own stacking context, so a list left inside its cell is painted
// BEHIND the sticky cells of the rows below it.
function SheetItemPicker({ item, sheetItems, disabled, onType, onPick }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);

  const matches = useMemo(() => {
    const tokens = (item.name || "").toLowerCase().split(/\s+/).filter(Boolean);
    const list = tokens.length
      ? sheetItems.filter((s) => {
          const hay = s.name.toLowerCase();
          return tokens.every((t) => hay.includes(t));
        })
      : sheetItems;
    return list.slice(0, 60);
  }, [item.name, sheetItems]);

  const pick = (sheetItem) => {
    setOpen(false);
    onPick(sheetItem);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={item.name}
        onChange={(e) => { onType(e.target.value); setOpen(true); }}
        onFocus={(e) => { setRect(e.currentTarget.getBoundingClientRect()); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && open && matches.length > 0) { e.preventDefault(); pick(matches[0]); }
        }}
        className="p-1 w-full rounded-md border border-gray-300 focus:border-primary focus:outline-none"
        placeholder="Search item from sheet"
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-label="Item name"
      />
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul
            role="listbox"
            className="fixed z-[100] max-h-72 w-[26rem] overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg"
            style={{
              left: Math.min(rect.left, window.innerWidth - 420),
              top: rect.bottom + 4 + 288 > window.innerHeight ? Math.max(8, rect.top - 292) : rect.bottom + 4,
            }}
          >
            {matches.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">No matching item in the sheet</li>
            )}
            {matches.map((s) => (
              <li key={s.name}>
                <button
                  type="button"
                  role="option"
                  onClick={() => pick(s)}
                  className="block w-full px-3 py-2 text-left hover:bg-primary/5 focus:bg-primary/5 focus:outline-none"
                >
                  <span className="block text-sm text-gray-900">{s.name}</span>
                  <span className="block text-xs text-gray-500">
                    Lite {s.lite.rate > 0 ? `₹${money(s.lite.rate)}` : "not offered"}
                    {" · "}
                    Ultra {s.ultra.rate > 0 ? `₹${money(s.ultra.rate)}` : "not offered"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>,
        document.body
      )}
    </div>
  );
}

const ItemsTable = ({
  quotationData,
  handleItemChange,
  handleSeriesChange,
  handleSeriesSelectAll,
  handleApplySheetItem,
  itemMaster = { items: [], loading: false, error: null, reload: () => {} },
  lookupCode = () => "",
  handleAddItem,
  specialDiscount,
  setSpecialDiscount,
  setQuotationData,
  handleSpecialDiscountChange,
  isLoading,
  hiddenColumns,
  setHiddenColumns,
}) => {
  const hide = (key) => Boolean(hiddenColumns?.[key]);
  const hideCode = hide("hideCode");
  const hideName = hide("hideProductName");
  const hideGST = hide("hideGST");
  const hideUnits = hide("hideUnits");
  const hideSpec = hide("hideDescription");
  const hideQty = hide("hideQty");
  const hideRate = hide("hideRate");
  const hideDisc = hide("hideDisc");
  const hideFlatDisc = hide("hideFlatDisc");
  const hideAmount = hide("hideAmount");
  const hideRemarks = hide("hideRemarks");
  const hideImage = hide("hideImage");
  const hideVideo = hide("hideVideo");

  const [showDropdown, setShowDropdown] = useState(false);

  const items = quotationData.items || [];
  const normalItems = items.filter((i) => !isSimpleItem(i));
  const packagingItem = items.find(isPackagingItem);
  const freightItem = items.find(isFreightItem);

  // Series columns actually shown (checkbox is always shown).
  const seriesCols = [
    !hideSpec && "spec",
    !hideRate && "rate",
    !hideDisc && "disc",
    !hideFlatDisc && "flat",
    !hideAmount && "amount",
    !hideRemarks && "remarks",
    !hideImage && "image",
    !hideVideo && "video",
  ].filter(Boolean);
  const bandSpan = seriesCols.length + 1;
  const leadingCols = 1 + (hideCode ? 0 : 1) + (hideName ? 0 : 1) + (hideGST ? 0 : 1) + (hideQty ? 0 : 1) + (hideUnits ? 0 : 1);
  const totalCols = leadingCols + bandSpan * 2 + 1;

  const fieldOptions = [
    { key: "hideCode", label: "Code" },
    { key: "hideProductName", label: "Item Name" },
    { key: "hideGST", label: "GST %" },
    { key: "hideQty", label: "Qty." },
    { key: "hideUnits", label: "Units" },
    { key: "hideDescription", label: "Technical Spec" },
    { key: "hideRate", label: "Rate" },
    { key: "hideDisc", label: "Disc %" },
    { key: "hideFlatDisc", label: "Flat Disc" },
    { key: "hideAmount", label: "Amount" },
    { key: "hideRemarks", label: "Remarks" },
    { key: "hideImage", label: "Image" },
    { key: "hideVideo", label: "Video" },
    { key: "hideSubtotal", label: "Subtotal" },
    { key: "hideTotalQty", label: "Total Qty" },
    { key: "hideTotalFlatDisc", label: "Total Flat Discount" },
    { key: "hideTaxableAmount", label: "Taxable Amount" },
    { key: "hideIGST", label: "IGST" },
    { key: "hideCGST", label: "CGST" },
    { key: "hideSGST", label: "SGST" },
    { key: "hideSpecialDiscount", label: "Special Discount" },
    { key: "hideTotalDiscount", label: "Total Discount" },
    { key: "hideGrandTotal", label: "Grand Total" },
  ];

  const taxableAmount = Math.max(0, quotationData.subtotal || 0);
  // Comparison footer: totals as if EVERY item were taken in each series.
  const summaryOptions = { isIGST: Boolean(quotationData.isIGST), specialDiscount };
  const rowsBySeries = Object.fromEntries(
    SERIES.map(({ key }) => [key, summaryRows(computeSeriesSummary(items, key, summaryOptions), summaryOptions.isIGST, hiddenColumns || {})])
  );
  const footerIds = ["subtotal", "flat", "igst", "cgst", "sgst", "special", "grand"].filter((id) =>
    SERIES.some(({ key }) => rowsBySeries[key].some((r) => r.id === id))
  );

  // % discount in rupees, over what the customer selected.
  const percentDiscountTotal = items.reduce((sum, item) => {
    if (isSimpleItem(item)) {
      return sum + Number(item.qty || 0) * Number(item.rate || 0) * (Number(item.discount || 0) / 100);
    }
    return (
      sum +
      SERIES.reduce((acc, { key }) => {
        const s = getSeries(item, key);
        return s.selected ? acc + Number(s.qty || 0) * Number(s.rate || 0) * (Number(s.discount || 0) / 100) : acc;
      }, 0)
    );
  }, 0);

  const allSelected = (key) => normalItems.length > 0 && normalItems.every((i) => getSeries(i, key).selected);

  const removeItem = (id) => {
    setQuotationData((prev) => {
      const newItems = prev.items.filter((i) => i.id !== id);
      if (newItems.length === 0) return prev;
      return { ...prev, items: newItems, ...recalcTotalsAfterRemoval(newItems, prev.isIGST) };
    });
  };

  const spinnerCSS = `
    .no-spinner::-webkit-outer-spin-button,
    .no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .no-spinner { -moz-appearance: textfield; }
  `;

  const numberInput = (props) => (
    <input
      type="number"
      onWheel={(e) => e.target.blur()}
      onKeyDown={blockArrowKeys}
      min="0"
      disabled={isLoading}
      {...props}
      className={`p-1 rounded-md border no-spinner focus:outline-none ${props.className || ""}`}
    />
  );

  // Cells of one series for a normal item.
  const renderSeriesCells = (item, index, { key }) => {
    const s = getSeries(item, key);
    const band = BAND[key];
    const set = (field, value) => handleSeriesChange(item.id, key, field, value);
    const maxDisc = SERIES.find((x) => x.key === key).maxDiscount;
    const overCap = maxDisc !== null && Number(s.discount) > maxDisc;
    const cell = `px-2 py-2 align-top ${s.selected ? band.cell : ""}`;
    const border = (idx) => (idx === 0 ? "border-l border-gray-200" : "");
    const cells = [];

    seriesCols.forEach((col, idx) => {
      if (col === "spec") {
        cells.push(
          <td key={`${key}-spec`} className={`${cell} ${border(idx)}`}>
            <textarea
              value={s.spec}
              onChange={(e) => set("spec", e.target.value)}
              rows={2}
              className={`p-1 w-44 resize-y rounded-md border border-gray-300 text-sm ${band.ring} focus:outline-none`}
              placeholder="Technical spec"
              aria-label={`${SERIES.find((x) => x.key === key).title} technical spec, item ${index + 1}`}
              disabled={isLoading}
            />
          </td>
        );
      } else if (col === "rate") {
        cells.push(
          <td key={`${key}-rate`} className={`${cell} ${border(idx)}`}>
            {numberInput({
              value: s.rate || "",
              onChange: (e) => set("rate", parseNumber(e.target.value)),
              step: "0.01",
              placeholder: "0.00",
              className: `w-24 border-gray-300 ${band.ring}`,
              "aria-label": `${key} rate, item ${index + 1}`,
            })}
          </td>
        );
      } else if (col === "disc") {
        cells.push(
          <td key={`${key}-disc`} className={`${cell} ${border(idx)}`}>
            {numberInput({
              value: s.discount || "",
              onChange: (e) => set("discount", parseNumber(e.target.value)),
              step: "0.01",
              max: "100",
              title: overCap ? `Lite Plus allows a maximum of ${maxDisc}% discount` : undefined,
              className: `w-20 ${overCap ? "border-[#F59E0B] bg-[#FFFBEB]" : "border-gray-300"} ${band.ring}`,
              "aria-label": `${key} discount percent, item ${index + 1}`,
            })}
            {overCap && <span className="block text-[11px] text-[#B45309]">Max {maxDisc}%</span>}
          </td>
        );
      } else if (col === "flat") {
        cells.push(
          <td key={`${key}-flat`} className={`${cell} ${border(idx)}`}>
            {numberInput({
              value: s.flatDiscount || "",
              onChange: (e) => set("flatDiscount", parseNumber(e.target.value)),
              step: "0.01",
              className: `w-20 border-gray-300 ${band.ring}`,
              "aria-label": `${key} flat discount, item ${index + 1}`,
            })}
          </td>
        );
      } else if (col === "amount") {
        cells.push(
          <td key={`${key}-amount`} className={`${cell} ${border(idx)}`}>
            <input
              type="text"
              value={s.amount ? money(s.amount) : ""}
              className="p-1 w-24 bg-gray-50 rounded-md border border-gray-300"
              readOnly
              aria-label={`${key} amount, item ${index + 1}`}
            />
          </td>
        );
      } else if (col === "remarks") {
        cells.push(
          <td key={`${key}-remarks`} className={`${cell} ${border(idx)}`}>
            <textarea
              value={s.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              rows={2}
              className={`p-1 w-40 resize-y rounded-md border border-gray-300 text-sm ${band.ring} focus:outline-none`}
              placeholder="Remarks"
              aria-label={`${key} remarks, item ${index + 1}`}
              disabled={isLoading}
            />
          </td>
        );
      } else if (col === "image") {
        cells.push(
          <td key={`${key}-image`} className={`${cell} ${border(idx)}`}>
            <ImageCell link={s.image} onChange={(v) => set("image", v)} disabled={isLoading} label={`${key} image link, item ${index + 1}`} />
          </td>
        );
      } else if (col === "video") {
        cells.push(
          <td key={`${key}-video`} className={`${cell} ${border(idx)}`}>
            <div className="flex w-40 flex-col gap-1">
              <input
                type="url"
                value={s.video}
                onChange={(e) => set("video", e.target.value.trim())}
                className={`p-1 rounded-md border border-gray-300 text-sm ${band.ring} focus:outline-none`}
                placeholder="Video link"
                aria-label={`${key} video link, item ${index + 1}`}
                disabled={isLoading}
              />
              {isHttpUrl(s.video) && (
                <a href={s.video} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">
                  Open video
                </a>
              )}
            </div>
          </td>
        );
      }
    });

    cells.push(
      <td key={`${key}-pick`} className={`${cell} text-center ${seriesCols.length === 0 ? "border-l border-gray-200" : ""}`}>
        <input
          type="checkbox"
          checked={s.selected}
          onChange={(e) => set("selected", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
          aria-label={`Customer chose ${SERIES.find((x) => x.key === key).title}, item ${index + 1}`}
          disabled={isLoading}
        />
      </td>
    );
    return cells;
  };

  // Sticky left columns (S No., Code, Item Name).
  const stickyLeft = { sno: 0, code: W_SNO, name: W_SNO + (hideCode ? 0 : W_CODE) };

  const renderLeadingCells = (item, label, { simple = false } = {}) => {
    const bg = simple ? "bg-gray-300" : "bg-white";
    return (
      <>
        <td className={`px-2 py-2 sticky z-10 ${bg} align-top`} style={{ left: stickyLeft.sno, minWidth: W_SNO }}>{label}</td>
        {!hideCode && (
          <td className={`px-2 py-2 sticky z-10 ${bg} align-top`} style={{ left: stickyLeft.code, minWidth: W_CODE, maxWidth: W_CODE }}>
            <input
              type="text"
              value={item.code || ""}
              onChange={(e) => handleItemChange(item.id, "code", e.target.value)}
              className={`p-1 w-24 rounded-md border ${simple ? "border-gray-500 bg-gray-400 text-gray-800 cursor-not-allowed" : "border-gray-300 focus:border-primary focus:outline-none"}`}
              disabled={simple || isLoading}
              autoComplete="off"
              aria-label="Item code"
            />
          </td>
        )}
        {!hideName && (
          <td
            className={`px-2 py-2 sticky z-10 ${bg} align-top shadow-[2px_0_0_0_rgb(229,231,235)]`}
            style={{ left: stickyLeft.name, minWidth: 240, maxWidth: 240 }}
          >
            {simple ? (
              <input
                type="text"
                value={item.name}
                className="p-1 w-full rounded-md border border-gray-500 bg-gray-400 text-gray-900 cursor-not-allowed"
                disabled
                aria-label="Item name"
              />
            ) : (
              <SheetItemPicker
                item={item}
                sheetItems={itemMaster.items}
                disabled={isLoading}
                onType={(value) => handleItemChange(item.id, "name", value)}
                onPick={(sheetItem) => handleApplySheetItem(item.id, sheetItem, { code: lookupCode(sheetItem.name) })}
              />
            )}
          </td>
        )}
        {!hideGST && (
          <td className={`px-2 py-2 ${bg} align-top`}>
            <select
              value={String(item.gst)}
              onChange={(e) => handleItemChange(item.id, "gst", e.target.value)}
              className="p-1 w-20 rounded-md border border-gray-300 bg-white text-gray-700"
              disabled={isLoading}
              aria-label="GST percent"
            >
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="18">18%</option>
              {!["0", "5", "18"].includes(String(item.gst)) && <option value={String(item.gst)}>{String(item.gst)}%</option>}
            </select>
          </td>
        )}
        {!hideQty && (
          <td className={`px-2 py-2 ${bg} align-top`}>
            {numberInput({
              value: item.qty === "" ? "" : item.qty || "",
              onChange: (e) => handleItemChange(item.id, "qty", parseNumber(e.target.value)),
              className: `w-16 ${simple ? "border-gray-500 bg-white" : "border-gray-300 focus:border-primary"}`,
              "aria-label": `${item.name || "Item"} qty`,
            })}
          </td>
        )}
        {!hideUnits && (
          <td className={`px-2 py-2 ${bg} align-top`}>
            <select
              value={item.units}
              onChange={(e) => handleItemChange(item.id, "units", e.target.value)}
              className="p-1 w-20 rounded-md border border-gray-300 bg-white text-gray-700"
              disabled={isLoading}
              aria-label="Units"
            >
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </td>
        )}
      </>
    );
  };

  // Packaging & Forwarding / Freight: one charge for the whole quotation, so
  // its qty/rate/discount inputs sit under the first band and the second band
  // just says so.
  const renderSimpleRow = (item, label) => {
    const set = (field, value) => handleItemChange(item.id, field, value);
    const simpleCell = "px-2 py-2 align-top bg-gray-300";
    const cells = [];
    seriesCols.forEach((col, idx) => {
      const border = idx === 0 ? "border-l border-gray-400" : "";
      if (col === "spec") {
        cells.push(
          <td key="spec" className={`${simpleCell} ${border}`}>
            <textarea
              value={item.description || ""}
              onChange={(e) => set("description", e.target.value)}
              rows={1}
              className="p-1 w-44 resize-none rounded-md border border-gray-300 bg-white text-sm text-gray-700"
              placeholder="Description"
              aria-label={`${item.name} description`}
              disabled={isLoading}
            />
          </td>
        );
      } else if (col === "rate") {
        cells.push(<td key="rate" className={`${simpleCell} ${border}`}>{numberInput({ value: item.rate || "", onChange: (e) => set("rate", parseNumber(e.target.value) || 0), step: "0.01", placeholder: "0.00", className: "w-24 border-gray-500 bg-white", "aria-label": `${item.name} rate` })}</td>);
      } else if (col === "disc") {
        cells.push(<td key="disc" className={`${simpleCell} ${border}`}>{numberInput({ value: item.discount || "", onChange: (e) => set("discount", parseNumber(e.target.value) || 0), step: "0.01", max: "100", className: "w-20 border-gray-500 bg-white", "aria-label": `${item.name} discount percent` })}</td>);
      } else if (col === "flat") {
        cells.push(<td key="flat" className={`${simpleCell} ${border}`}>{numberInput({ value: item.flatDiscount || "", onChange: (e) => set("flatDiscount", parseNumber(e.target.value) || 0), step: "0.01", className: "w-20 border-gray-500 bg-white", "aria-label": `${item.name} flat discount` })}</td>);
      } else if (col === "amount") {
        cells.push(<td key="amount" className={`${simpleCell} ${border}`}><input type="text" value={item.amount ? money(item.amount) : ""} className="p-1 w-24 rounded-md border border-gray-500 bg-gray-400" readOnly aria-label={`${item.name} amount`} /></td>);
      } else {
        cells.push(<td key={col} className={`${simpleCell} ${border}`} />); // remarks / image / video: not applicable
      }
    });
    return (
      <tr key={item.id} className="bg-gray-300 text-gray-900">
        {renderLeadingCells(item, label, { simple: true })}
        {cells}
        <td className={`${simpleCell} text-center ${seriesCols.length === 0 ? "border-l border-gray-400" : ""}`}><span className="text-gray-600">—</span></td>
        <td colSpan={bandSpan} className={`${simpleCell} border-l border-gray-400 text-sm italic text-gray-700`}>
          Charged once, on the whole quotation
        </td>
        <td className={simpleCell}>
          <button
            className="p-1 text-destructive rounded-md hover:text-destructive"
            onClick={() => removeItem(item.id)}
            disabled={isLoading}
            aria-label={`Remove ${item.name}`}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </td>
      </tr>
    );
  };

  const summaryRow = (label, value, { bold = false, children } = {}) => (
    <div className={`flex justify-between gap-6 py-1.5 ${bold ? "font-bold border-t pt-2" : ""}`}>
      <span className={bold ? "" : "font-medium text-gray-700"}>{label}</span>
      {children || <span className="tabular-nums">{value}</span>}
    </div>
  );

  return (
    <div className="p-4 bg-white rounded-lg border shadow-sm">
      <style>{spinnerCSS}</style>
      <div className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div>
            <h3 className="text-lg font-medium">Items</h3>
            <p className="text-xs text-gray-500" role="status">
              {itemMaster.loading && "Loading items from the sheet..."}
              {!itemMaster.loading && !itemMaster.error && `${itemMaster.items.length} items loaded from the sheet`}
              {itemMaster.error && (
                <span className="text-destructive">
                  Couldn't load the item sheet: {itemMaster.error}{" "}
                  <button type="button" className="underline" onClick={itemMaster.reload}>Retry</button>
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <button
                className="px-3 py-1 text-sm text-gray-700 rounded-md border border-gray-300 hover:bg-gray-50 flex items-center gap-1"
                onClick={() => setShowDropdown(!showDropdown)}
                aria-haspopup="true"
                aria-expanded={showDropdown}
              >
                Hide/Show Fields
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-56 bg-white rounded-md border border-gray-300 shadow-lg max-h-96 overflow-y-auto">
                    <div className="p-2">
                      {fieldOptions.map((field) => (
                        <label key={field.key} className="flex items-center px-2 py-2 hover:bg-gray-50 cursor-pointer rounded">
                          <input
                            type="checkbox"
                            checked={!hiddenColumns?.[field.key]}
                            onChange={() => setHiddenColumns((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                            className="mr-3 w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
                          />
                          <span className="text-sm text-gray-700">{field.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              className="px-3 py-1 text-sm text-gray-700 rounded-md border border-gray-300 hover:bg-gray-50"
              onClick={handleAddItem}
              disabled={isLoading}
            >
              <PlusIcon className="inline mr-1 w-4 h-4" /> Add Item
            </button>
          </div>
        </div>

        <div className="overflow-x-auto relative rounded-md border border-gray-200" tabIndex={0} role="region" aria-label="Quotation items, scrollable">
          {isLoading && (
            <div className="flex absolute inset-0 z-30 justify-center items-center bg-white bg-opacity-70">
              <div className="w-12 h-12 rounded-full border-t-2 border-b-2 border-primary animate-spin"></div>
            </div>
          )}
          <table className="min-w-full text-sm">
            <thead>
              {/* Series banner */}
              <tr>
                <th colSpan={leadingCols} className="bg-gray-50 px-2 py-2" />
                {SERIES.map((series) => (
                  <th key={series.key} colSpan={bandSpan} className={`px-3 py-2 text-center border-l border-gray-200 ${BAND[series.key].head}`}>
                    <div className="text-sm font-semibold tracking-wide">{series.title}</div>
                    <div className="text-xs font-normal">
                      {[series.note, series.warranty].filter(Boolean).join(" · ")}
                    </div>
                    <label className="mt-1 inline-flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allSelected(series.key)}
                        onChange={(e) => handleSeriesSelectAll(series.key, e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
                        disabled={isLoading || normalItems.length === 0}
                      />
                      Customer chose this series for all items
                    </label>
                  </th>
                ))}
                <th className="bg-gray-50 px-2 py-2" />
              </tr>
              <tr className="bg-gray-50 text-xs font-medium text-left text-gray-500 uppercase">
                <th className="px-2 py-2 sticky z-10 bg-gray-50" style={{ left: stickyLeft.sno, minWidth: W_SNO }}>S No.</th>
                {!hideCode && <th className="px-2 py-2 sticky z-10 bg-gray-50" style={{ left: stickyLeft.code, minWidth: W_CODE }}>Code</th>}
                {!hideName && <th className="px-2 py-2 sticky z-10 bg-gray-50 shadow-[2px_0_0_0_rgb(229,231,235)]" style={{ left: stickyLeft.name, minWidth: 240 }}>Item Name</th>}
                {!hideGST && <th className="px-2 py-2">GST %</th>}
                {!hideQty && <th className="px-2 py-2">Qty</th>}
                {!hideUnits && <th className="px-2 py-2">Units</th>}
                {SERIES.map(({ key }) => (
                  <HeaderSet key={key} seriesKey={key} cols={seriesCols} />
                ))}
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {itemMaster.loading === false && normalItems.length === 0 && (
                <tr><td colSpan={totalCols} className="px-4 py-6 text-center text-gray-500">No items yet. Choose Add Item.</td></tr>
              )}
              {normalItems.map((item, index) => (
                <ItemRows
                  key={item.id}
                  item={item}
                  index={index}
                  renderLeadingCells={renderLeadingCells}
                  renderSeriesCells={renderSeriesCells}
                  onRemove={() => removeItem(item.id)}
                  canRemove={normalItems.length > 1 && !isLoading}
                  isLoading={isLoading}
                />
              ))}
              {packagingItem && renderSimpleRow(packagingItem, normalItems.length + 1)}
              {freightItem && renderSimpleRow(freightItem, normalItems.length + (packagingItem ? 2 : 1))}
            </tbody>
            <tfoot className="border-t-2 border-gray-300">
              {footerIds.map((id, rowIdx) => (
                <tr key={id} className={id === "grand" ? "bg-gray-50 font-semibold" : ""}>
                  {rowIdx === 0 && (
                    <td colSpan={leadingCols} rowSpan={footerIds.length} className="px-3 py-2 align-top text-xs text-gray-500">
                      Comparison of ALL items in each series (chosen or not): amount, tax and grand total.
                    </td>
                  )}
                  {SERIES.map(({ key }) => {
                    const row = rowsBySeries[key].find((r) => r.id === id);
                    const labelRow = SERIES.map(({ key: k }) => rowsBySeries[k].find((r) => r.id === id)).find(Boolean);
                    const value = row ? row.value : 0;
                    const text = `${value < 0 ? "-" : ""}₹${money(Math.abs(value))}`;
                    const tint = `border-l border-gray-200 ${key === "lite" ? "bg-brand-50/60" : "bg-[#F0FDF4]"}`;
                    const k = seriesCols.length;
                    // The value sits under Amount (or the last shown column).
                    const valueIdx = seriesCols.includes("amount") ? seriesCols.indexOf("amount") : k - 1;
                    if (valueIdx < 1) {
                      return (
                        <td key={key} colSpan={k + 1} className={`px-2 py-1.5 text-right text-xs ${tint}`}>
                          {labelRow.label}: <span className="tabular-nums">{text}</span>
                        </td>
                      );
                    }
                    return (
                      <FooterBand key={key} labelSpan={valueIdx} trailSpan={k - 1 - valueIdx + 1} label={labelRow.label} text={text} tint={tint} />
                    );
                  })}
                  <td />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full max-w-md rounded-md border border-gray-200 px-4 py-2 text-sm">
            <p className="pb-1 text-xs text-gray-500">Totals of the series the customer chose</p>
            <div className="border-t pt-1">
              {!hide("hideSubtotal") && summaryRow("Subtotal (chosen series)", `₹${money(quotationData.subtotal)}`)}
              {!hide("hideTotalQty") && summaryRow("Total Qty", items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0))}
              {!hideFlatDiscTotal(hiddenColumns) && summaryRow("Total Flat Discount", `₹${money(quotationData.totalFlatDiscount)}`)}
              {!hide("hideTaxableAmount") && summaryRow("Taxable Amount", `₹${money(taxableAmount)}`)}

              {!hide("hideIGST") && quotationData.isIGST && (
                <>
                  {Object.entries(quotationData.igstBreakdown || {}).map(([rate, value]) => (
                    <div key={`igst-${rate}`}>{summaryRow(`IGST (${Number(rate)}%)`, `₹${money(value)}`)}</div>
                  ))}
                  {summaryRow("IGST Total", `₹${money(quotationData.igstAmount)}`)}
                </>
              )}
              {!hide("hideCGST") && !quotationData.isIGST && (
                <>
                  {Object.entries(quotationData.cgstBreakdown || {}).map(([rate, value]) => (
                    <div key={`cgst-${rate}`}>{summaryRow(`CGST (${Number(rate)}%)`, `₹${money(value)}`)}</div>
                  ))}
                  {summaryRow("CGST Total", `₹${money(quotationData.cgstAmount)}`)}
                </>
              )}
              {!hide("hideSGST") && !quotationData.isIGST && (
                <>
                  {Object.entries(quotationData.sgstBreakdown || {}).map(([rate, value]) => (
                    <div key={`sgst-${rate}`}>{summaryRow(`SGST (${Number(rate)}%)`, `₹${money(value)}`)}</div>
                  ))}
                  {summaryRow("SGST Total", `₹${money(quotationData.sgstAmount)}`)}
                </>
              )}

              {!hide("hideSpecialDiscount") &&
                summaryRow("Special Discount", null, {
                  children: (
                    <input
                      type="number"
                      value={specialDiscount || ""}
                      onChange={(e) => {
                        setSpecialDiscount(e.target.value);
                        handleSpecialDiscountChange(e.target.value);
                      }}
                      className="p-1 w-28 rounded-md border border-gray-300 no-spinner text-right"
                      onWheel={(e) => e.target.blur()}
                      onKeyDown={blockArrowKeys}
                      step="0.01"
                      min="0"
                      disabled={isLoading}
                      aria-label="Special discount"
                    />
                  ),
                })}
              {!hide("hideTotalDiscount") &&
                summaryRow(
                  "Total Discount",
                  `₹${money(percentDiscountTotal + Number(quotationData.totalFlatDiscount || 0) + (Number(specialDiscount) || 0))}`
                )}
              {!hide("hideGrandTotal") &&
                summaryRow(
                  "Grand Total",
                  `₹${money(
                    Math.max(
                      0,
                      Number(quotationData.subtotal || 0) +
                        Number(quotationData.cgstAmount || 0) +
                        Number(quotationData.sgstAmount || 0) +
                        Number(quotationData.igstAmount || 0) -
                        (Number(specialDiscount) || 0)
                    )
                  )}`,
                  { bold: true }
                )}
            </div>
            {normalItems.length > 0 && normalItems.every((i) => !SERIES.some(({ key }) => getSeries(i, key).selected)) && (
              <p className="mt-2 text-xs text-[#B45309]">
                No series is chosen yet. Tick the series the customer picked for each item to include it in the total.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const hideFlatDiscTotal = (hiddenColumns) => Boolean(hiddenColumns?.hideTotalFlatDisc);

// One series' label + value cells of a comparison footer row (value sits under
// the band's last column, the Chosen column stays empty).
function FooterBand({ labelSpan, trailSpan, label, text, tint }) {
  const flat = tint.replace("border-l border-gray-200 ", "");
  return (
    <>
      <td colSpan={labelSpan} className={`px-2 py-1.5 text-right text-xs text-gray-600 ${tint}`}>{label}</td>
      <td className={`px-2 py-1.5 text-xs tabular-nums ${flat}`}>{text}</td>
      <td colSpan={trailSpan} className={flat} />
    </>
  );
}

// Photo cell: compressed thumbnail (click = original link in a new tab) plus
// the editable link. If the browser can't read the image (CORS), the plain
// image is shown instead of the compressed one.
function ImageCell({ link, onChange, disabled, label }) {
  const { status, image } = useCompressedImage(link);
  const hasLink = isHttpUrl(link);
  return (
    <div className="flex w-36 flex-col gap-1">
      {hasLink && (
        <a href={link} target="_blank" rel="noopener noreferrer" title="Open image in a new tab" className="block h-16 w-16 overflow-hidden rounded-md border border-gray-300 bg-white">
          {status === "ready" && <img src={image.dataUrl} alt="Item" className="h-full w-full object-contain" />}
          {status === "loading" && <span className="block h-full w-full animate-pulse bg-gray-200" aria-label="Loading image" />}
      {status === "failed" && <FallbackImage link={link} />}
        </a>
      )}
      <input
        type="url"
        value={link}
        onChange={(e) => onChange(e.target.value.trim())}
        className="p-1 rounded-md border border-gray-300 text-sm focus:border-primary focus:outline-none"
        placeholder="Image link"
        aria-label={label}
        disabled={disabled}
      />
    </div>
  );
}

// Column headers of one series band.
function HeaderSet({ seriesKey, cols }) {
  const labels = { spec: "Technical Spec", rate: "Rate", disc: "Disc %", flat: "Flat Disc", amount: "Amount", remarks: "Remarks", image: "Image", video: "Video" };
  return (
    <>
      {cols.map((col, idx) => (
        <th key={`${seriesKey}-${col}`} className={`px-2 py-2 ${idx === 0 ? "border-l border-gray-200" : ""} ${BAND[seriesKey].head}`}>
          {labels[col]}
        </th>
      ))}
      <th className={`px-2 py-2 text-center ${cols.length === 0 ? "border-l border-gray-200" : ""} ${BAND[seriesKey].head}`}>Chosen</th>
    </>
  );
}

// One item row. (Remarks come from the sheet and are printed in the preview /
// PDF under the technical spec; they are not edited here.)
function ItemRows({ item, index, renderLeadingCells, renderSeriesCells, onRemove, canRemove }) {
  return (
    <tr>
      {renderLeadingCells(item, index + 1)}
      {renderSeriesCells(item, index, SERIES[0])}
      {renderSeriesCells(item, index, SERIES[1])}
      <td className="px-2 py-2 align-top whitespace-nowrap">
        <button
          className="p-1 text-destructive rounded-md hover:text-destructive disabled:opacity-40"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Remove item ${index + 1}`}
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

export default ItemsTable;

// Used when the browser can't read the image to shrink it (CORS): show the
// original image as-is; if even that can't load, a plain "View image" label.
function FallbackImage({ link }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className="flex h-full w-full items-center justify-center p-1 text-center text-[11px] font-medium text-[#2274B8]">View image</span>;
  return <img src={imageCandidates(link)[0]} alt="Item" loading="lazy" className="h-full w-full object-contain" onError={() => setBroken(true)} />;
}
