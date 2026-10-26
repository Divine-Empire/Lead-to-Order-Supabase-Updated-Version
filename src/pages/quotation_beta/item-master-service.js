// Item master for the beta quotation: read from the 'item_master' Google Sheet
// through the deployed Apps Script (see apps-script.gs). Read-only -- nothing
// is ever written back to the sheet.
//
// Sheet layout (row 2 = column headers, row 1 = series banner). Several header
// names repeat for the two series, so columns are read BY POSITION:
//   A S.No | B Product | C Qty | D GST %
//   E Spec | F Rate | G Amount | H Remarks | I Photos | J Video      (Lite Plus)
//   K Spec | L Rate | M Amount(%) | N Remarks | O Photos | P Video   (Ultra Tough)
// Photos / Video hold a link (anything that is not an http(s) link is ignored).
// Amount columns are not used: amounts are always recomputed from qty x rate.
import { useEffect, useState } from "react";

export const ITEM_MASTER_URL =
  "https://script.google.com/macros/s/AKfycbxx4WPkJ7nndE0m8IT7e0TG6OQXV-JrmBQH4QoPT3HFpDg9DXDfDHMnaF3e29BoYc0c/exec";
const SHEET_NAME = "item_master";
const HEADER_ROW = 2; // apps script can't auto-detect this header (no known keyword)
const CACHE_KEY = "quotationBetaItemMaster:v2";
const CACHE_TTL_MS = 30 * 60 * 1000;

const COL = {
  name: 1, gst: 3,
  liteSpec: 4, liteRate: 5, liteRemarks: 7, liteImage: 8, liteVideo: 9,
  ultraSpec: 10, ultraRate: 11, ultraRemarks: 13, ultraImage: 14, ultraVideo: 15,
};

// "2,27,72,750.00" / 7150 / "₹ 500" -> number; "#DIV/0!", "" or text -> null
const toNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[₹,\s]/g, "");
  if (!s || s.startsWith("#")) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Photos / Video cells: only a real http(s) link counts (the sheet also has "✔" marks there).
const toUrl = (v) => {
  const s = String(v ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
};

const toText = (v) => {
  const s = String(v ?? "").trim();
  return s.startsWith("#") ? "" : s; // sheet error values (#REF!, #DIV/0!) are not content
};

// Item names can hold line breaks / wrapping quotes in the sheet.
const cleanName = (v) => v.replace(/\s*\n\s*/g, " ").replace(/^"+|"+$/g, "").trim();

// 0.18 (percent-formatted cell), 18 or "18%" -> 18
const toGst = (v) => {
  const raw = typeof v === "string" ? v.replace("%", "") : v;
  const n = toNumber(raw);
  if (n === null) return 18;
  return n > 0 && n <= 1 ? Math.round(n * 10000) / 100 : n;
};

export const parseItemMaster = (json) => {
  const rows = json?.data;
  if (!json?.success || !Array.isArray(rows) || rows.length < 2) return [];
  return rows
    .slice(1)
    .map((r) => ({
      name: cleanName(toText(r[COL.name])),
      gst: toGst(r[COL.gst]),
      lite: {
        spec: toText(r[COL.liteSpec]), rate: toNumber(r[COL.liteRate]) || 0, remarks: toText(r[COL.liteRemarks]),
        image: toUrl(r[COL.liteImage]), video: toUrl(r[COL.liteVideo]),
      },
      ultra: {
        spec: toText(r[COL.ultraSpec]), rate: toNumber(r[COL.ultraRate]) || 0, remarks: toText(r[COL.ultraRemarks]),
        image: toUrl(r[COL.ultraImage]), video: toUrl(r[COL.ultraVideo]),
      },
    }))
    .filter((it) => it.name);
};

let inflight = null;

export const fetchItemMaster = async ({ force = false } = {}) => {
  if (!force) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.at < CACHE_TTL_MS && Array.isArray(cached.items)) return cached.items;
    } catch { /* storage unavailable or corrupt: fetch fresh */ }
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const url = `${ITEM_MASTER_URL}?sheet=${encodeURIComponent(SHEET_NAME)}&headerRow=${HEADER_ROW}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Item sheet request failed (${res.status})`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Item sheet returned an error");
    const items = parseItemMaster(json);
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items })); } catch { /* ignore */ }
    return items;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
};

// { items, loading, error, reload }
export function useItemMaster() {
  const [state, setState] = useState({ items: [], loading: true, error: null });

  const load = (force = false) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchItemMaster({ force })
      .then((items) => setState({ items, loading: false, error: null }))
      .catch((err) => setState({ items: [], loading: false, error: err?.message || "Could not load the item sheet" }));
  };

  useEffect(() => {
    let cancelled = false;
    fetchItemMaster()
      .then((items) => { if (!cancelled) setState({ items, loading: false, error: null }); })
      .catch((err) => { if (!cancelled) setState({ items: [], loading: false, error: err?.message || "Could not load the item sheet" }); });
    return () => { cancelled = true; };
  }, []);

  return { ...state, reload: () => load(true) };
}
