// A handful of simultaneous connections to the same host has shown
// occasional transient connect timeouts in practice -- retrying the single
// affected page (not the whole fetch) makes that a non-issue rather than
// failing the entire report load over one flaky connection.
async function fetchPageWithRetry(buildQuery, start, end, attempts = 3) {
    let lastResult = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        lastResult = await buildQuery().range(start, end);
        if (!lastResult.error) return lastResult;
        if (attempt < attempts) await new Promise(r => setTimeout(r, 400 * attempt));
    }
    return lastResult;
}

// Applies any already-built filters to every chunk of a paginated fetch,
// bypassing PostgREST's silent 1000-row cap on unbounded selects. Pages are
// fetched in parallel batches rather than one at a time -- with ~1-1.5s of
// latency per request, sequentially paging through tens of thousands of rows
// would take tens of seconds end to end. Firing BATCH_SIZE requests per round
// cuts that to roughly (page count / BATCH_SIZE) round trips instead of
// (page count).
export async function fetchAllRows(buildQuery) {
    const step = 1000;
    const BATCH_SIZE = 8;
    let allRows = [];
    let from = 0;
    let done = false;
    let lastError = null;

    while (!done) {
        const batch = Array.from({ length: BATCH_SIZE }, (_, i) => {
            const start = from + i * step;
            return fetchPageWithRetry(buildQuery, start, start + step - 1);
        });
        const results = await Promise.all(batch);

        for (const { data, error } of results) {
            if (error) {
                lastError = error;
                done = true;
                break;
            }
            if (data && data.length > 0) {
                allRows = allRows.concat(data);
                if (data.length < step) done = true; // reached the end mid-batch
            } else {
                done = true; // empty page -- definitely past the end
            }
        }
        from += BATCH_SIZE * step;
    }
    return { data: allRows, error: lastError };
}
