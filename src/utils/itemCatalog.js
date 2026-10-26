// Item master data access, shared by Master > Items, the item detail page
// and Series Quotation.
//
//   lto_items       -- uuid, item_name, item_code, unit, updated_at, updated_by
//   lto_item_specs  -- one row per (item_uuid, type); see Database/17_item_specs.sql
//
// Writes go through two RPCs so each user action is a single round trip:
//   lto_add_item            (Add Item modal; rejects a duplicate item code)
//   lto_save_item_details   (detail page Save; item + all spec rows at once)
import supabase from "./supabase";
import { fetchAllRows } from "./fetchAllRows";
import { compressImageFile } from "./imageCompression";

export const SPEC_TYPES = {
  basic: "basic",
  lite: "lite_series",
  ultra: "ut_series",
};

export const ITEM_UNITS = ["Nos", "Kg", "Roll", "Rmt", "Ltr", "Bag", "Pair", "Set", "Mtr", "sqmtr", "Box", "Pc"];

export const ITEM_MEDIA_BUCKET = "lto-items-master";
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const isHttpUrl = (v) => /^https?:\/\/\S+$/i.test(String(v || "").trim());

// Turns an RPC error into a message for the user.
export const itemErrorMessage = (err) => {
  const msg = err?.message || String(err || "");
  const dup = msg.match(/DUPLICATE_CODE:(.*)$/);
  if (dup) return `This item code is already used by "${dup[1].trim()}".`;
  if (msg.includes("ITEM_NOT_FOUND")) return "This item no longer exists. Please refresh.";
  if (err?.code === "23505" && msg.includes("item_name")) return "An item with this name already exists.";
  return msg;
};

export async function addItem({ name, code, unit, updatedBy }) {
  const { data, error } = await supabase.rpc("lto_add_item", {
    p_item_name: name,
    p_item_code: code,
    p_unit: unit,
    p_updated_by: updatedBy || null,
  });
  if (error) throw error;
  return data; // new item uuid
}

// Item + all its spec rows in one request. Returns { item, specs: { basic, lite_series, ut_series } }.
export async function fetchItemWithSpecs(uuid) {
  const { data, error } = await supabase
    .from("lto_items")
    .select("uuid, item_name, item_code, unit, updated_at, updated_by, lto_item_specs(*)")
    .eq("uuid", uuid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const specs = {};
  (data.lto_item_specs || []).forEach((s) => { specs[s.type] = s; });
  const { lto_item_specs: _ignored, ...item } = data;
  return { item, specs };
}

export async function saveItemDetails({ uuid, name, code, unit, specs, updatedBy }) {
  const { error } = await supabase.rpc("lto_save_item_details", {
    p_item_uuid: uuid,
    p_item_name: name,
    p_item_code: code,
    p_unit: unit,
    p_specs: specs,
    p_updated_by: updatedBy || null,
  });
  if (error) throw error;
}

// ---- Images ----------------------------------------------------------------

export const validateImageFile = (file) => {
  if (!file) return "No file selected.";
  if (!IMAGE_TYPES.includes(file.type)) return "Only JPG, PNG or WebP images are allowed.";
  if (file.size > IMAGE_MAX_BYTES) return "Image must be 5 MB or smaller.";
  return null;
};

// Compresses, then uploads under items/<uuid>/<type>-<timestamp>.jpg and
// returns the public URL. A new name per upload means a replaced image is
// never served stale from the CDN cache.
export async function uploadItemImage(itemUuid, type, file) {
  const compressed = await compressImageFile(file, { maxDimension: 1600, quality: 0.8 });
  const ext = compressed.type === "image/png" ? "png" : compressed.type === "image/webp" ? "webp" : "jpg";
  const path = `items/${itemUuid}/${type}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(ITEM_MEDIA_BUCKET)
    .upload(path, compressed, { contentType: compressed.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from(ITEM_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Removes images that belong to our bucket (ignores external links).
export async function removeItemImages(urls) {
  const marker = `/storage/v1/object/public/${ITEM_MEDIA_BUCKET}/`;
  const paths = (urls || [])
    .filter((u) => u && u.includes(marker))
    .map((u) => decodeURIComponent(u.split(marker)[1].split("?")[0]));
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(ITEM_MEDIA_BUCKET).remove(paths);
  if (error) console.error("Could not remove old item images:", error);
}

// ---- Series Quotation catalog ---------------------------------------------

const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache = null; // { at, items }
let catalogInflight = null;
const seriesCache = new Map(); // item uuid -> { lite, ultra }

// Light list for the item search: [{ uuid, name, code, unit }].
export async function fetchItemCatalog({ force = false } = {}) {
  if (!force && catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.items;
  if (catalogInflight) return catalogInflight;
  catalogInflight = (async () => {
    const { data, error } = await fetchAllRows(() =>
      supabase.from("lto_items").select("uuid, item_name, item_code, unit").order("item_name", { ascending: true })
    );
    if (error) throw error;
    const items = (data || []).map((r) => ({
      uuid: r.uuid,
      name: (r.item_name || "").trim(),
      code: r.item_code || "",
      unit: r.unit || "",
    })).filter((r) => r.name);
    if (force) seriesCache.clear();
    catalogCache = { at: Date.now(), items };
    return items;
  })();
  try {
    return await catalogInflight;
  } finally {
    catalogInflight = null;
  }
}

const toSeriesBlock = (row) => ({
  spec: row?.technical_specs || "",
  rate: Number(row?.rate) || 0,
  remarks: row?.remarks || "",
  image: isHttpUrl(row?.img) ? row.img : "",
  video: isHttpUrl(row?.video) ? row.video : "",
});

// Lite / Ultra details for many items in as few requests as possible
// (cached per item). Returns Map(uuid -> { lite, ultra }).
export async function fetchSeriesSpecs(uuids) {
  const wanted = [...new Set((uuids || []).filter(Boolean))];
  const missing = wanted.filter((u) => !seriesCache.has(u));
  for (let i = 0; i < missing.length; i += 150) {
    const chunk = missing.slice(i, i + 150);
    const { data, error } = await supabase
      .from("lto_item_specs")
      .select("item_uuid, type, rate, technical_specs, remarks, img, video")
      .in("item_uuid", chunk)
      .in("type", [SPEC_TYPES.lite, SPEC_TYPES.ultra]);
    if (error) throw error;
    const byItem = new Map(chunk.map((u) => [u, {}]));
    (data || []).forEach((r) => { byItem.get(r.item_uuid)[r.type] = r; });
    byItem.forEach((rows, uuid) => {
      seriesCache.set(uuid, { lite: toSeriesBlock(rows[SPEC_TYPES.lite]), ultra: toSeriesBlock(rows[SPEC_TYPES.ultra]) });
    });
  }
  return new Map(wanted.map((u) => [u, seriesCache.get(u)]));
}

const normName = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

export const findCatalogItem = (catalog, name) => {
  const key = normName(name);
  if (!key) return null;
  return (catalog || []).find((it) => normName(it.name) === key) || null;
};

// Full items ({ uuid, name, code, unit, lite, ultra }) for the given catalog
// entries -- one specs request for all of them.
export async function loadFullItems(entries) {
  const list = (entries || []).filter(Boolean);
  if (list.length === 0) return [];
  const specs = await fetchSeriesSpecs(list.map((e) => e.uuid));
  return list.map((e) => ({ ...e, ...(specs.get(e.uuid) || { lite: toSeriesBlock(), ultra: toSeriesBlock() }) }));
}
