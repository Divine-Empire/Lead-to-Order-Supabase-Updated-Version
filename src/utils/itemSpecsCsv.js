// Items Master > Template / Import: one row per item with its Basic, Lite Plus
// and Ultra Tough details, as a CSV laid out like the old item_master sheet.
//
//   row 1 (banner):  .  .  .  .  BASIC ...  LITE PLUS SERIES ...  ULTRA TOUGH SERIES ...
//   row 2 (header):  S.NO | Item Code | Product Name | Unit |
//                    Technical Spec | Rate | Reseller Rate                    (Basic)
//                    Technical Spec | Rate | Remarks | Video                  (Lite Plus)
//                    Technical Spec | Rate | Remarks | Video                  (Ultra Tough)
//
// The Photos column is not part of the file: images are managed on the item's
// own page and an import never touches them. Items are matched by Item Code
// (Product Name breaks ties). Importing updates lto_items (Product Name when
// matched by code, Unit) and upserts one lto_item_specs row per (item, series);
// only values that differ from what is stored are written.
//
// Older files without the Unit / Basic columns (Lite + Ultra only) still import.
import supabase from "./supabase";
import { fetchAllRows } from "./fetchAllRows";
import { fetchItemCatalog, SPEC_TYPES, ITEM_UNITS, isHttpUrl } from "./itemCatalog";

const SERIES = [
  { key: "basic", label: "Basic", type: SPEC_TYPES.basic, banner: "BASIC", fields: ["Technical Spec", "Rate", "Reseller Rate"] },
  { key: "lite", label: "Lite Plus", type: SPEC_TYPES.lite, banner: "LITE PLUS SERIES - Max 10% Discount", fields: ["Technical Spec", "Rate", "Remarks", "Video"] },
  { key: "ultra", label: "Ultra Tough", type: SPEC_TYPES.ultra, banner: "ULTRA TOUGH SERIES", fields: ["Technical Spec", "Rate", "Remarks", "Video"] },
];

// ---- CSV text <-> rows (RFC 4180: quotes, commas and line breaks in cells) ----

const escapeCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // drop a BOM
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// ---- Export ----------------------------------------------------------------

const HEADER = ["S.NO", "Item Code", "Product Name", "Unit", ...SERIES.flatMap((s) => s.fields)];

const specCells = (s, r) =>
  s.key === "basic"
    ? [r?.technical_specs ?? "", r?.rate ?? "", r?.reseller_rate ?? ""]
    : [r?.technical_specs ?? "", r?.rate ?? "", r?.remarks ?? "", r?.video ?? ""];

// Builds the whole file, pre-filled with what's currently stored, so the same
// file works for first-time entry and for editing existing values.
export async function buildTemplateCsv() {
  const [{ data: items, error: itemsErr }, { data: specs, error: specsErr }] = await Promise.all([
    fetchAllRows(() => supabase.from("lto_items").select("uuid, item_name, item_code, unit").order("item_name", { ascending: true })),
    fetchAllRows(() =>
      supabase
        .from("lto_item_specs")
        .select("item_uuid, type, rate, reseller_rate, technical_specs, remarks, video")
        .in("type", SERIES.map((s) => s.type))
        .order("uuid")
    ),
  ]);
  if (itemsErr || specsErr) throw itemsErr || specsErr;

  const byItem = new Map();
  (specs || []).forEach((s) => {
    if (!byItem.has(s.item_uuid)) byItem.set(s.item_uuid, {});
    byItem.get(s.item_uuid)[s.type] = s;
  });

  const banner = ["", "", "", "", ...SERIES.flatMap((s) => [s.banner, ...Array(s.fields.length - 1).fill("")])];
  const lines = [banner, HEADER].map((r) => r.map(escapeCell).join(","));
  (items || []).forEach((it, i) => {
    const have = byItem.get(it.uuid) || {};
    const cells = [i + 1, it.item_code || "", it.item_name || "", it.unit || ""];
    SERIES.forEach((s) => cells.push(...specCells(s, have[s.type])));
    lines.push(cells.map(escapeCell).join(","));
  });
  return { csv: lines.join("\r\n"), count: (items || []).length };
}

export function downloadCsvText(filename, csv) {
  const blob = new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8;" }); // BOM so Excel reads UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Import ----------------------------------------------------------------

const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// Finds the header row and the column of every field. Works with or without
// the banner row above it, and with the old two-series layout.
function locateColumns(rows) {
  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === "item code"));
  if (headerIdx < 0) throw new Error('This file has no "Item Code" column. Please use the Template file.');
  const header = rows[headerIdx].map(norm);
  const codeCol = header.indexOf("item code");
  const nameCol = header.indexOf("product name");
  const unitCol = header.indexOf("unit");

  const specStarts = header.map((h, i) => (h === "technical spec" ? i : -1)).filter((i) => i >= 0);
  if (specStarts.length < 2) throw new Error('Expected a "Technical Spec" column for each series. Please use the Template file.');
  // 3 blocks = Basic, Lite, Ultra; 2 blocks = the older Lite, Ultra file.
  const series = specStarts.length >= 3 ? SERIES : SERIES.slice(1);

  const blocks = series.map((s, n) => {
    const from = specStarts[n];
    const to = specStarts[n + 1] ?? header.length;
    const find = (label) => {
      for (let i = from; i < to; i++) if (header[i] === label) return i;
      return -1;
    };
    return { ...s, spec: from, rate: find("rate"), reseller: find("reseller rate"), remarks: find("remarks"), video: find("video") };
  });
  blocks.forEach((b) => {
    if (b.rate < 0) throw new Error(`The ${b.label} block has no "Rate" column.`);
  });
  return { headerIdx, codeCol, nameCol, unitCol, blocks };
}

const toRate = (v) => {
  const s = String(v ?? "").replace(/[₹,\s]/g, "");
  if (!s) return { value: null };
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? { value: n } : { error: `"${String(v).trim()}" is not a valid number` };
};

const same = (a, b) => (a ?? null) === (b ?? null);
const sameNum = (a, b) => (a === null || a === undefined ? null : Number(a)) === (b === null || b === undefined ? null : Number(b));

// Parses the file and matches every row to an item. Nothing is written.
// Returns { entries, itemUpdates, errors, skipped, unchanged, rowCount }:
//   entries      spec rows to upsert { item_uuid, itemName, itemCode, type, seriesKey,
//                rate, reseller_rate, technical_specs, remarks, video, isNew }
//   itemUpdates  lto_items changes { uuid, item_name, unit, oldName, oldUnit, renamed, unitChanged }
export async function analyzeImport(text) {
  const rows = parseCsv(text);
  const { headerIdx, codeCol, nameCol, unitCol, blocks } = locateColumns(rows);
  const catalog = await fetchItemCatalog({ force: true });

  const byCode = new Map();
  const byName = new Map();
  catalog.forEach((it) => {
    if (it.code) {
      const k = norm(it.code);
      byCode.set(k, [...(byCode.get(k) || []), it]);
    }
    byName.set(norm(it.name), it);
  });

  const errors = [];
  let skipped = 0;
  let rowCount = 0;
  const entries = [];
  const itemChanges = new Map(); // uuid -> pending lto_items change
  const claimedNames = new Map(); // norm(new name) -> uuid, to catch two renames to one name
  const seenItems = new Set();

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => !String(c ?? "").trim())) continue;
    const line = r + 1;
    const code = String(row[codeCol] ?? "").trim();
    const name = nameCol >= 0 ? String(row[nameCol] ?? "").trim() : "";
    if (!code && !name) { errors.push({ line, message: "No Item Code or Product Name" }); continue; }
    rowCount++;

    let item = null;
    let matchedByCode = false;
    if (code) {
      const candidates = byCode.get(norm(code)) || [];
      if (candidates.length === 1) { item = candidates[0]; matchedByCode = true; }
      else if (candidates.length > 1) {
        item = candidates.find((c) => norm(c.name) === norm(name)) || null;
        if (!item) { errors.push({ line, message: `Item Code ${code} belongs to ${candidates.length} items; the Product Name doesn't pick one` }); continue; }
      }
    }
    if (!item && name) item = byName.get(norm(name)) || null;
    if (!item) { errors.push({ line, message: `No item found for ${code ? `code ${code}` : `"${name}"`}` }); continue; }
    if (seenItems.has(item.uuid)) { errors.push({ line, message: `${item.name} appears more than once in the file` }); continue; }

    // Item-level fields (Product Name only when the row was matched by its code).
    const change = { uuid: item.uuid, item_name: item.name, unit: item.unit || null, oldName: item.name, oldUnit: item.unit || "", renamed: false, unitChanged: false };
    if (matchedByCode && name && name !== item.name) {
      const taken = byName.get(norm(name));
      if (taken && taken.uuid !== item.uuid) { errors.push({ line, message: `Cannot rename ${item.name} to "${name}": another item already has that name` }); continue; }
      const claimedBy = claimedNames.get(norm(name));
      if (claimedBy && claimedBy !== item.uuid) { errors.push({ line, message: `Two rows rename items to "${name}"` }); continue; }
      change.item_name = name;
      change.renamed = true;
    }
    if (unitCol >= 0) {
      const raw = String(row[unitCol] ?? "").trim();
      const unit = ITEM_UNITS.find((u) => u.toLowerCase() === raw.toLowerCase()) || raw;
      const next = unit || null;
      if ((next || "") !== (item.unit || "")) { change.unit = next; change.unitChanged = true; }
    }

    const found = [];
    let rowBad = false;
    blocks.forEach((b) => {
      if (rowBad) return;
      const cell = (i) => (i >= 0 ? String(row[i] ?? "").trim() : "");
      const rate = toRate(row[b.rate]);
      if (rate.error) { errors.push({ line, message: `${item.name} (${b.label} Rate): ${rate.error}` }); rowBad = true; return; }
      const e = {
        item_uuid: item.uuid, itemName: item.name, itemCode: item.code, type: b.type, seriesKey: b.key,
        rate: rate.value, technical_specs: cell(b.spec) || null,
      };
      if (b.key === "basic") {
        const resell = b.reseller >= 0 ? toRate(row[b.reseller]) : { value: null };
        if (resell.error) { errors.push({ line, message: `${item.name} (Reseller Rate): ${resell.error}` }); rowBad = true; return; }
        e.reseller_rate = resell.value;
        e.remarks = null;
        e.video = null;
        e.blank = rate.value === null && resell.value === null && !e.technical_specs;
      } else {
        const video = cell(b.video);
        if (video && !isHttpUrl(video)) { errors.push({ line, message: `${item.name} (${b.label}): Video must be a link starting with http(s)://` }); rowBad = true; return; }
        e.reseller_rate = null;
        e.remarks = cell(b.remarks) || null;
        e.video = video || null;
        e.blank = rate.value === null && !e.technical_specs && !e.remarks && !e.video;
      }
      found.push(e);
    });
    if (rowBad) continue;
    seenItems.add(item.uuid);
    if (change.renamed) claimedNames.set(norm(change.item_name), item.uuid);
    if (change.renamed || change.unitChanged) itemChanges.set(item.uuid, change);
    entries.push(...found);
  }

  // Compare with what is stored: a series left blank for an item with no row
  // yet is skipped, identical values are skipped, anything else is written
  // (for an item that already has a row, blank cells clear it).
  const existing = await fetchExistingSpecs([...new Set(entries.map((e) => e.item_uuid))]);
  const toWrite = [];
  let unchanged = 0;
  entries.forEach((e) => {
    const have = existing.get(`${e.item_uuid}:${e.type}`);
    if (!have) {
      if (e.blank) { skipped++; return; }
      toWrite.push({ ...e, isNew: true });
      return;
    }
    const identical =
      sameNum(have.rate, e.rate) &&
      same(have.technical_specs || null, e.technical_specs) &&
      (e.seriesKey === "basic"
        ? sameNum(have.reseller_rate, e.reseller_rate)
        : same(have.remarks || null, e.remarks) && same(have.video || null, e.video));
    if (identical) { unchanged++; return; }
    toWrite.push({ ...e, isNew: false });
  });
  return { entries: toWrite, itemUpdates: [...itemChanges.values()], errors, skipped, unchanged, rowCount };
}

async function fetchExistingSpecs(uuids) {
  const map = new Map();
  for (let i = 0; i < uuids.length; i += 150) {
    const { data, error } = await supabase
      .from("lto_item_specs")
      .select("item_uuid, type, rate, reseller_rate, technical_specs, remarks, video")
      .in("item_uuid", uuids.slice(i, i + 150))
      .in("type", SERIES.map((s) => s.type));
    if (error) throw error;
    (data || []).forEach((r) => map.set(`${r.item_uuid}:${r.type}`, r));
  }
  return map;
}

// Writes the analysed changes (images are not in any payload, so existing
// images stay). onProgress(done, total) is called after every request.
export async function applyImport({ entries, itemUpdates = [] }, updatedBy, onProgress) {
  const now = new Date().toISOString();
  const total = entries.length + itemUpdates.length;
  let done = 0;
  const step = 500;

  for (let i = 0; i < itemUpdates.length; i += step) {
    const chunk = itemUpdates.slice(i, i + step).map((c) => ({
      uuid: c.uuid, item_name: c.item_name, unit: c.unit, updated_at: now, updated_by: updatedBy || null,
    }));
    const { error } = await supabase.from("lto_items").upsert(chunk, { onConflict: "uuid" });
    if (error) throw error;
    done += chunk.length;
    onProgress?.(done, total);
  }

  // Basic rows also carry reseller_rate; keep each request's columns uniform
  // so a series never overwrites a column it doesn't own.
  const toPayload = (e) => {
    const base = {
      item_uuid: e.item_uuid, type: e.type, rate: e.rate, technical_specs: e.technical_specs,
      updated_at: now, updated_by: updatedBy || null,
    };
    return e.seriesKey === "basic" ? { ...base, reseller_rate: e.reseller_rate } : { ...base, remarks: e.remarks, video: e.video };
  };
  for (const key of ["basic", "series"]) {
    const group = entries.filter((e) => (key === "basic" ? e.seriesKey === "basic" : e.seriesKey !== "basic")).map(toPayload);
    for (let i = 0; i < group.length; i += step) {
      const chunk = group.slice(i, i + step);
      const { error } = await supabase.from("lto_item_specs").upsert(chunk, { onConflict: "item_uuid,type" });
      if (error) throw error;
      done += chunk.length;
      onProgress?.(done, total);
    }
  }
}
