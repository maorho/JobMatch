import { Adapter, NormalizedPosting, fetchWithTimeout, htmlToText } from "../types";

/**
 * Generic Workday adapter (many large companies run on *.myworkdayjobs.com).
 *   identifier          = host, e.g. "nvidia.wd5.myworkdayjobs.com"
 *   secondaryIdentifier = "<tenant>/<site>", e.g. "nvidia/NVIDIAExternalCareerSite"
 * Searches for Israel, keeps Israel-located postings, and fetches each one's
 * detail for the description. A failed search page, or more results than the
 * cap, throws (the list would be partial); the detail cap keeps the feed
 * "partial" by design, which is why runScout never reconciles against it.
 */
const LIMIT = 20;
const MAX_RESULTS = 400;

export const workday: Adapter = async (identifier, secondaryIdentifier) => {
  const host = identifier;
  const [tenant, site] = String(secondaryIdentifier || "").split("/");
  if (!host || !tenant || !site) {
    throw new Error("workday needs host + '<tenant>/<site>'");
  }
  const base = `https://${host}/wday/cxs/${tenant}/${site}`;

  // 1) Page the search for Israel and keep Israel-located postings.
  const candidates: any[] = [];
  let total = 0;
  let offset = 0;
  for (; offset < MAX_RESULTS; offset += LIMIT) {
    const res = await fetchWithTimeout(`${base}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({ searchText: "Israel", limit: LIMIT, offset, appliedFacets: {} }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Workday ${host}: HTTP ${res.status} at offset ${offset}`);
    const data = await res.json();
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
  if (offset >= MAX_RESULTS && total > MAX_RESULTS) {
    throw new Error(`Workday ${host}: ${total} search results exceed the ${MAX_RESULTS} cap — list would be partial`);
  }

  // 2) Fetch detail (description + precise location) for each, capped.
  const out: NormalizedPosting[] = [];
  for (const p of candidates.slice(0, 80)) {
    try {
      const r = await fetchWithTimeout(`${base}${p.externalPath}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      });
      if (!r.ok) continue;
      const info = (await r.json())?.jobPostingInfo ?? {};
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
  return out;
};
