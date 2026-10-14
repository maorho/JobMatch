import { Adapter, NormalizedPosting, fetchWithTimeout } from "../types";

/**
 * Amazon jobs (amazon.jobs public search JSON), filtered to Israel.
 * `identifier` is unused (single source). Covers Amazon + AWS Israel roles.
 * Complete-feed adapter: a failed page or a board bigger than the cap throws
 * (see the Adapter contract) so a partial list never drives reconciliation.
 */
const LIMIT = 100;
const MAX_RESULTS = 500;

export const amazon: Adapter = async () => {
  const out: NormalizedPosting[] = [];
  let total = Infinity;
  for (let offset = 0; offset < MAX_RESULTS; offset += LIMIT) {
    const url = `https://www.amazon.jobs/en/search.json?normalized_country_code%5B%5D=ISR&result_limit=${LIMIT}&offset=${offset}&sort=recent`;
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Amazon jobs: HTTP ${res.status} at offset ${offset}`);
    const data = await res.json();
    const jobs: any[] = data?.jobs ?? [];
    if (typeof data?.hits === "number") total = data.hits;
    if (jobs.length === 0) break;

    for (const j of jobs) {
      const idm = String(j.job_path || "").match(/jobs\/(\d+)/);
      out.push({
        sourceJobId: idm ? idm[1] : String(j.id_icims || j.job_path || j.title),
        title: j.title ?? "",
        company: "Amazon",
        city: j.city ?? "",
        country: "Israel",
        description: j.description_short || j.description || "",
        applyUrl: j.job_path ? `https://www.amazon.jobs${j.job_path}` : "",
      });
    }
    if (jobs.length < LIMIT || out.length >= total) break;
  }
  if (out.length < total && out.length >= MAX_RESULTS) {
    throw new Error(`Amazon jobs: ${total} postings exceed the ${MAX_RESULTS} cap — list would be partial`);
  }
  return out;
};
