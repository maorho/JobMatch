import { Adapter, NormalizedPosting } from "../types";

/**
 * Amazon jobs (amazon.jobs public search JSON), filtered to Israel.
 * `identifier` is unused (single source). Covers Amazon + AWS Israel roles.
 */
export const amazon: Adapter = async () => {
  const out: NormalizedPosting[] = [];
  const LIMIT = 100;
  for (let offset = 0; offset < 500; offset += LIMIT) {
    const url = `https://www.amazon.jobs/en/search.json?normalized_country_code%5B%5D=ISR&result_limit=${LIMIT}&offset=${offset}&sort=recent`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) break;
    const data = await res.json();
    const jobs: any[] = data?.jobs ?? [];
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
    if (jobs.length < LIMIT) break;
  }
  return out;
};
