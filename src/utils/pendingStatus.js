import supabase from "./supabase";

const CHUNK_SIZE = 500;

// Rows that actually carry a completed order status are a small slice of the
// full tracker history (most rows are in-progress stage logs). Fetching just
// those, in chunks of 500, is far cheaper than scanning every history row to
// answer "has this enquiry/lead ever been closed?".
export async function fetchClosedIdSet(table, idColumn) {
  const closed = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(`${idColumn}, is_order_received_status`)
      .not("is_order_received_status", "is", null)
      .neq("is_order_received_status", "")
      .range(from, from + CHUNK_SIZE - 1);
    if (error) {
      console.error(`Error fetching closed ids from ${table}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    data.forEach((row) => {
      if (row[idColumn]) closed.add(row[idColumn]);
    });
    if (data.length < CHUNK_SIZE) break;
    from += CHUNK_SIZE;
  }
  return closed;
}

// Counts candidate rows (planned_at not null) that are NOT in closedIds,
// paginating in chunks of 500 instead of a single unpaginated fetch (which
// PostgREST silently caps at 1000). dedupeById collapses multiple rows per
// id (e.g. several call logs against the same lead) down to one.
export async function countOpenRows(table, idColumn, closedIds, dedupeById = false) {
  let from = 0;
  let count = 0;
  const seen = dedupeById ? new Set() : null;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(idColumn)
      .not("planned_at", "is", null)
      .range(from, from + CHUNK_SIZE - 1);
    if (error) {
      console.error(`Error counting open rows in ${table}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const id = row[idColumn];
      if (!id || closedIds.has(id)) continue;
      if (dedupeById) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      count++;
    }
    if (data.length < CHUNK_SIZE) break;
    from += CHUNK_SIZE;
  }
  return count;
}
