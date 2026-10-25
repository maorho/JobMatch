import { Adapter, NormalizedPosting, adapterResult, fetchJson } from "../types";

/**
 * Amazon jobs (amazon.jobs public search JSON), filtered to Israel.
 * `identifier` is unused (single source). Covers Amazon + AWS Israel roles.
 * Paginating adapter (see AdapterResult): only a failed FIRST page throws; a
 * later failure, the cap, or a list short of the reported `hits` returns the
 * postings marked incomplete, so they ingest but nothing is soft-closed.
 */
const LIMIT = 100;
const MAX_RESULTS = 1000;

export const amazon: Adapter = async () => {
  const out: NormalizedPosting[] = [];
  const seen = new Set<string>();
  let total: number | null = null; // null = Amazon did not say
  let incomplete: string | null = null;
  let offset = 0;
  for (; offset < MAX_RESULTS; offset += LIMIT) {
    const url = `https://www.amazon.jobs/en/search.json?normalized_country_code%5B%5D=ISR&result_limit=${LIMIT}&offset=${offset}&sort=recent`;
    let data: any;
    try {
      const r = await fetchJson(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
      if (!r.ok) throw new Error(`Amazon jobs: HTTP ${r.status} at offset ${offset}`);
      data = r.data;
    } catch (e) {
      if (offset === 0) throw e;
      incomplete = `page at offset ${offset} failed: ${(e as Error).message}`;
      break;
    }
    const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
    if (typeof data?.hits === "number" && Number.isFinite(data.hits)) total = data.hits;
    if (jobs.length === 0) break;

    for (const j of jobs) {
      const idm = String(j.job_path || "").match(/jobs\/(\d+)/);
      const id = idm ? idm[1] : String(j.id_icims || j.job_path || j.title);
      // sort=recent shifts postings between pages while we read: never count one twice.
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        sourceJobId: id,
        title: j.title ?? "",
        company: "Amazon",
        city: j.city ?? "",
        country: "Israel",
        description: j.description_short || j.description || "",
        applyUrl: j.job_path ? `https://www.amazon.jobs${j.job_path}` : "",
      });
    }
    if (jobs.length < LIMIT || (total !== null && out.length >= total)) break;
  }
  if (!incomplete && offset >= MAX_RESULTS) {
    // Stopped by the cap with a full last page: more may exist even when `hits` is missing.
    if (total === null || out.length < total) incomplete = `stopped at the ${MAX_RESULTS}-posting cap (${total ?? "unknown"} reported)`;
  }
  if (!incomplete && total !== null && out.length < total) incomplete = `got ${out.length} of ${total} reported postings`;
  return adapterResult(out, incomplete && `Amazon jobs: ${incomplete}`);
};
