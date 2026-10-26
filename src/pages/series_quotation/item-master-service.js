// Item master for Series Quotation, read from Supabase:
//   lto_items       -> the searchable list (uuid, name, code, unit)
//   lto_item_specs  -> Lite / Ultra details, fetched only for the items
//                      actually put on the quotation (see utils/itemCatalog.js)
import { useEffect, useState } from "react";
import { fetchItemCatalog, findCatalogItem, loadFullItems } from "../../utils/itemCatalog";

// { items, loading, error, reload } -- items: [{ uuid, name, code, unit }]
export function useItemMaster() {
  const [state, setState] = useState({ items: [], loading: true, error: null });

  const load = (force = false) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchItemCatalog({ force })
      .then((items) => setState({ items, loading: false, error: null }))
      .catch((err) => setState({ items: [], loading: false, error: err?.message || "Could not load items" }));
  };

  useEffect(() => {
    let cancelled = false;
    fetchItemCatalog()
      .then((items) => { if (!cancelled) setState({ items, loading: false, error: null }); })
      .catch((err) => { if (!cancelled) setState({ items: [], loading: false, error: err?.message || "Could not load items" }); });
    return () => { cancelled = true; };
  }, []);

  return { ...state, reload: () => load(true) };
}

// Full items (with Lite / Ultra details) for a list of item names -- one
// specs request for all of them. Names not in the item master are skipped.
export async function loadItemsByName(catalog, names) {
  const entries = [];
  const seen = new Set();
  (names || []).forEach((name) => {
    const entry = findCatalogItem(catalog, name);
    if (entry && !seen.has(entry.uuid)) {
      seen.add(entry.uuid);
      entries.push(entry);
    }
  });
  return loadFullItems(entries);
}

export const loadFullItem = async (entry) => (await loadFullItems([entry]))[0] || null;
