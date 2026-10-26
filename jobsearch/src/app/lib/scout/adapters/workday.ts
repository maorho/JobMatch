import { Adapter, NormalizedPosting, adapterResult, fetchJson, htmlToText } from "../types";

/**
 * Generic Workday adapter (many large companies run on *.myworkdayjobs.com).
 *   identifier          = host, e.g. "nvidia.wd5.myworkdayjobs.com"
 *   secondaryIdentifier = "<tenant>/<site>", e.g. "nvidia/NVIDIAExternalCareerSite"
 * Searches for Israel, keeps Israel-located postings, and fetches each one's
 * detail for the description. Only a failed FIRST search page throws; a later
 * failure, the search cap or the detail cap return the postings marked
 * incomplete (see AdapterResult). Workday is never reconciled anyway (not in
 * COMPLETE_FEED_ATS) — the flag is for the source log.
 */
const LIMIT = 20;
const MAX_RESULTS = 400;
const MAX_DETAIL = 80;
/** Stop starting detail calls past this, inside the 90s per-source deadline. */
const DETAIL_BUDGET_MS = 60_000;

export const workday: Adapter = async (identifier, secondaryIdentifier) => {
  const host = identifier;
  const [tenant, site] = String(secondaryIdentifier || "").split("/");
  if (!host || !tenant || !site) {
    throw new Error("workday needs host + '<tenant>/<site>'");
  }
  const base = `https://${host}/wday/cxs/${tenant}/${site}`;
  const startedAt = Date.now();

  // 1) Page the search for Israel and keep Israel-located postings.
  const candidates: any[] = [];
  let total = 0;
  let offset = 0;
  let incomplete: string | null = null;
  for (; offset < MAX_RESULTS; offset += LIMIT) {
    let data: any;
    try {
      const res = await fetchJson(`${base}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ searchText: "Israel", limit: LIMIT, offset, appliedFacets: {} }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Workday ${host}: HTTP ${res.status} at offset ${offset}`);
      data = res.data;
    } catch (e) {
      if (offset === 0) throw e;
      incomplete = `search page at offset ${offset} failed: ${(e as Error).message}`;
      break;
    }
    const posts: any[] = data?.jobPostings ?? [];
    total = Number(data?.total) || 0;
    if (posts.length === 0) break;
    for (const p of posts) {
      if (
        /\/Israel[-/]/i.test(p.externalPath || "") ||
        /israel/i.test(p.locationsText || "")
      ) {
        candidates.push(p);
      }
    }
    if (posts.length < LIMIT || offset + LIMIT >= total) break;
  }
  if (!incomplete && offset >= MAX_RESULTS && total > MAX_RESULTS) {
    incomplete = `${total} search results exceed the ${MAX_RESULTS} cap`;
  }
  if (!incomplete && candidates.length > MAX_DETAIL) {
    incomplete = `${candidates.length} Israel postings, details fetched for the first ${MAX_DETAIL}`;
  }

  // 2) Fetch detail (description + precise location) for each, capped.
  const out: NormalizedPosting[] = [];
  for (const p of candidates.slice(0, MAX_DETAIL)) {
    if (Date.now() - startedAt > DETAIL_BUDGET_MS) {
      incomplete = incomplete || `details ran out of time after ${out.length} postings`;
      break;
    }
    try {
      const r = await fetchJson(`${base}${p.externalPath}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      });
      if (!r.ok) continue;
      const info = r.data?.jobPostingInfo ?? {};
      const loc = info.location || p.locationsText || "";
      const city =
        loc
          .split(",")
          .map((s: string) => s.trim())
          .filter((s: string) => s && !/israel/i.test(s))
          .pop() || "";
      const jr = String(p.externalPath || "").match(/_([A-Za-z]*\d+)$/);
      out.push({
        sourceJobId: jr ? jr[1] : String(info.id || p.externalPath),
        title: info.title || p.title || "",
        company: "",
        city,
        country: "Israel",
        description: htmlToText(info.jobDescription || ""),
        applyUrl: info.externalUrl || `https://${host}/${site}${p.externalPath}`,
      });
    } catch {
      // skip this posting
    }
  }
  return adapterResult(out, incomplete && `Workday ${host}: ${incomplete}`);
};
