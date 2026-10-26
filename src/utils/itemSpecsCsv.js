// Items Master > Template / Import: Lite Plus and Ultra Tough details as a CSV
// laid out like the old item_master Google Sheet.
//
//   row 1 (banner):  .  .  .  LITE PLUS SERIES ...  ULTRA TOUGH SERIES ...
//   row 2 (header):  S.NO | Item Code | Product Name |
//                    Technical Spec | Rate | Remarks | Video   (Lite Plus)
//                    Technical Spec | Rate | Remarks | Video   (Ultra Tough)
//
// The Photos column is not part of the file: images are managed on the item's
// own page and an import never touches them. Items are matched by Item Code
// (Product Name breaks ties); importing upserts one lto_item_specs row per
// (item, series).
import supabase from "./supabase";
import { fetchAllRows } from "./fetchAllRows";
import { fetchItemCatalog, SPEC_TYPES, isHttpUrl } from "./itemCatalog";

const SERIES_FIELDS = ["Technical Spec", "Rate", "Remarks", "Video"];
const SERIES = [
  { key: "lite", type: SPEC_TYPES.lite, banner: "LITE PLUS SERIES - Max 10% Discount" },
  { key: "ultra", type: SPEC_TYPES.ultra, banner: "ULTRA TOUGH SERIES" },
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

const HEADER = ["S.NO", "Item Code", "Product Name", ...SERIES.flatMap(() => SERIES_FIELDS)];

// Builds the whole file, pre-filled with what's currently stored, so the same
// file works for first-time entry and for editing existing values.
export async function buildTemplateCsv() {
  const [{ data: items, error: itemsErr }, { data: specs, error: specsErr }] = await Promise.all([
    fetchAllRows(() => supabase.from("lto_items").select("uuid, item_name, item_code").order("item_name", { ascending: true })),
    fetchAllRows(() =>
      supabase.from("lto_item_specs").select("item_uuid, type, rate, technical_specs, remarks, video").in("type", SERIES.map((s) => s.type)).order("uuid")
    ),
  ]);
  if (itemsErr || specsErr) throw itemsErr || specsErr;

  const byItem = new Map();
  (specs || []).forEach((s) => {
    if (!byItem.has(s.item_uuid)) byItem.set(s.item_uuid, {});
    byItem.get(s.item_uuid)[s.type] = s;
  });

  const banner = ["", "", "", ...SERIES.flatMap((s) => [s.banner, "", "", ""])];
  const lines = [banner, HEADER].map((r) => r.map(escapeCell).join(","));
  (items || []).forEach((it, i) => {
    const have = byItem.get(it.uuid) || {};
    const cells = [i + 1, it.item_code || "", it.item_name || ""];
    SERIES.forEach((s) => {
      const r = have[s.type];
      cells.push(r?.technical_specs ?? "", r?.rate ?? "", r?.remarks ?? "", r?.video ?? "");
    });
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
// the banner row above it.
function locateColumns(rows) {
  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === "item code"));
  if (headerIdx < 0) throw new Error('This file has no "Item Code" column. Please use the Template file.');
  const header = rows[headerIdx].map(norm);
  const codeCol = header.indexOf("item code");
  const nameCol = header.indexOf("product name");

  const specStarts = header.map((h, i) => (h === "technical spec" ? i : -1)).filter((i) => i >= 0);
  if (specStarts.length < 2) throw new Error("Expected Lite Plus and Ultra Tough columns (two \"Technical Spec\" columns).");

  const blocks = SERIES.map((s, n) => {
    const from = specStarts[n];
    const to = specStarts[n + 1] ?? header.length;
    const find = (label) => {
      for (let i = from; i < to; i++) if (header[i] === label) return i;
      return -1;
    };
    return { ...s, spec: from, rate: find("rate"), remarks: find("remarks"), video: find("video") };
  });
  blocks.forEach((b) => {
    if (b.rate < 0) throw new Error(`The ${b.key === "lite" ? "Lite Plus" : "Ultra Tough"} block has no "Rate" column.`);
  });
  return { headerIdx, codeCol, nameCol, blocks };
}

const toRate = (v) => {
  const s = String(v ?? "").replace(/[₹,\s]/g, "");
  if (!s) return { value: null };
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? { value: n } : { error: `Rate "${String(v).trim()}" is not a valid number` };
};

// Parses the file and matches every row to an item. Nothing is written.
// Returns { entries, errors, skipped, rowCount } where entries are the
// spec rows to upsert: { item_uuid, itemName, itemCode, type, rate,
// technical_specs, remarks, video, isNew }.
export async function analyzeImport(text) {
  const rows = parseCsv(text);
  const { headerIdx, codeCol, nameCol, blocks } = locateColumns(rows);
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

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => !String(c ?? "").trim())) continue;
    const line = r + 1;
    const code = String(row[codeCol] ?? "").trim();
    const name = nameCol >= 0 ? String(row[nameCol] ?? "").trim() : "";
    if (!code && !name) { errors.push({ line, message: "No Item Code or Product Name" }); continue; }
    rowCount++;

    let item = null;
    if (code) {
      const candidates = byCode.get(norm(code)) || [];
      if (candidates.length === 1) item = candidates[0];
      else if (candidates.length > 1) {
        item = candidates.find((c) => norm(c.name) === norm(name)) || null;
        if (!item) { errors.push({ line, message: `Item Code ${code} belongs to ${candidates.length} items; the Product Name doesn't pick one` }); continue; }
      }
    }
    if (!item && name) item = byName.get(norm(name)) || null;
    if (!item) { errors.push({ line, message: `No item found for ${code ? `code ${code}` : `"${name}"`}` }); continue; }

    const found = [];
    let rowBad = false;
    blocks.forEach((b) => {
      const cell = (i) => (i >= 0 ? String(row[i] ?? "").trim() : "");
      const spec = cell(b.spec);
      const remarks = cell(b.remarks);
      const video = cell(b.video);
      const rate = toRate(row[b.rate]);
      if (rate.error) { errors.push({ line, message: `${item.name}: ${rate.error}` }); rowBad = true; return; }
      if (video && !isHttpUrl(video)) { errors.push({ line, message: `${item.name}: Video must be a link starting with http(s)://` }); rowBad = true; return; }
      found.push({
        item_uuid: item.uuid, itemName: item.name, itemCode: item.code, type: b.type,
        rate: rate.value, technical_specs: spec || null, remarks: remarks || null, video: video || null,
        blank: rate.value === null && !spec && !remarks && !video,
      });
    });
    if (rowBad) continue;
    entries.push(...found);
  }

  // A series left completely blank for an item that has no row yet is skipped
  // (nothing to create); for an item that has one, blank cells clear it.
  const existing = await fetchExistingKeys([...new Set(entries.map((e) => e.item_uuid))]);
  const toWrite = [];
  entries.forEach((e) => {
    const has = existing.has(`${e.item_uuid}:${e.type}`);
    if (e.blank && !has) { skipped++; return; }
    toWrite.push({ ...e, isNew: !has });
  });
  return { entries: toWrite, errors, skipped, rowCount };
}

async function fetchExistingKeys(uuids) {
  const keys = new Set();
  for (let i = 0; i < uuids.length; i += 150) {
    const { data, error } = await supabase
      .from("lto_item_specs")
      .select("item_uuid, type")
      .in("item_uuid", uuids.slice(i, i + 150))
      .in("type", SERIES.map((s) => s.type));
    if (error) throw error;
    (data || []).forEach((r) => keys.add(`${r.item_uuid}:${r.type}`));
  }
  return keys;
}

// Upserts the analysed entries (images are not in the payload, so existing
// images stay). onProgress(done, total) is called after every request.
export async function applyImport(entries, updatedBy, onProgress) {
  const now = new Date().toISOString();
  const payload = entries.map((e) => ({
    item_uuid: e.item_uuid,
    type: e.type,
    rate: e.rate,
    technical_specs: e.technical_specs,
    remarks: e.remarks,
    video: e.video,
    updated_at: now,
    updated_by: updatedBy || null,
  }));
  const step = 500;
  for (let i = 0; i < payload.length; i += step) {
    const { error } = await supabase
      .from("lto_item_specs")
      .upsert(payload.slice(i, i + step), { onConflict: "item_uuid,type" });
    if (error) throw error;
    onProgress?.(Math.min(i + step, payload.length), payload.length);
  }
}
