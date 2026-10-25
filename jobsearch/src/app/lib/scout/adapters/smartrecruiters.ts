import { Adapter, NormalizedPosting, adapterResult, fetchJson, htmlToText } from "../types";
import { isIsraelOrRemote } from "../locationFilter";

/**
 * SmartRecruiters public postings API.
 * List:   https://api.smartrecruiters.com/v1/companies/{company}/postings
 * Detail: https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}
 * Paginating adapter (see AdapterResult): only a failed first page throws.
 *
 * Big boards list thousands of postings worldwide, and one detail call per
 * posting blew the per-source deadline every run. So: list everything (cheap,
 * 100 per page — the full list keeps reconciliation honest), then fetch the
 * description only for Israel/remote postings (the same predicate runScout
 * filters with), capped and time-boxed; the rest keep listing-level data.
 */
const LIMIT = 100;
const MAX_RESULTS = 2000;
const MAX_DETAIL = 80;
/** Stop starting detail calls past this, well inside the 90s per-source deadline. */
const DETAIL_BUDGET_MS = 45_000;

export const smartrecruiters: Adapter = async (identifier) => {
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(
    identifier
  )}/postings`;
  const startedAt = Date.now();

  const out: NormalizedPosting[] = [];
  const relevantIdx: number[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  let incomplete: string | null = null;
  let offset = 0;
  for (; offset < MAX_RESULTS; offset += LIMIT) {
    let data: any;
    try {
      const r = await fetchJson(`${base}?limit=${LIMIT}&offset=${offset}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`SmartRecruiters ${identifier}: HTTP ${r.status} at offset ${offset}`);
      data = r.data;
    } catch (e) {
      if (offset === 0) throw e;
      incomplete = `page at offset ${offset} failed: ${(e as Error).message}`;
      break;
    }
    const content: any[] = Array.isArray(data?.content) ? data.content : [];
    if (typeof data?.totalFound === "number") total = data.totalFound;
    if (content.length === 0) break;

    for (const p of content) {
      const id = String(p.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const loc = p.location || {};
      const remote = loc.remote === true;
      const posting: NormalizedPosting = {
        sourceJobId: id,
        title: p.name ?? "",
        company: identifier,
        city: loc.city || (remote ? "Remote" : ""),
        country: loc.country || (remote ? "Remote" : "Unknown"),
        description: "",
        applyUrl: `https://jobs.smartrecruiters.com/${identifier}/${p.id}`,
        postedAt: p.releasedDate ? new Date(p.releasedDate) : undefined,
      };
      if (isIsraelOrRemote({ ...posting, remote })) relevantIdx.push(out.length);
      out.push(posting);
    }
    if (content.length < LIMIT || (total !== null && out.length >= total)) break;
  }
  if (!incomplete && offset >= MAX_RESULTS && (total === null || out.length < total)) {
    incomplete = `stopped at the ${MAX_RESULTS}-posting cap (${total ?? "unknown"} reported)`;
  }
  if (!incomplete && total !== null && out.length < total) incomplete = `got ${out.length} of ${total} reported postings`;

  // Descriptions for the postings we will actually keep (best-effort).
  for (const i of relevantIdx.slice(0, MAX_DETAIL)) {
    if (Date.now() - startedAt > DETAIL_BUDGET_MS) break;
    const p = out[i];
    try {
      const d = await fetchJson(`${base}/${encodeURIComponent(p.sourceJobId)}`, { cache: "no-store" }, 10_000);
      if (!d.ok) continue;
      const sections = d.data?.jobAd?.sections || {};
      p.description = htmlToText(
        [sections?.jobDescription?.text, sections?.qualifications?.text].filter(Boolean).join("\n")
      );
    } catch {
      // keep going without a description
    }
  }
  return adapterResult(out, incomplete && `SmartRecruiters ${identifier}: ${incomplete}`);
};
