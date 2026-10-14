import { Adapter, NormalizedPosting, fetchWithTimeout, htmlToText } from "../types";

/**
 * SmartRecruiters public postings API.
 * List:   https://api.smartrecruiters.com/v1/companies/{company}/postings
 * Detail: https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}
 * Complete-feed adapter: any failed page, or a board bigger than the cap, throws.
 */
const LIMIT = 100;
const MAX_RESULTS = 1000;

export const smartrecruiters: Adapter = async (identifier) => {
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(
    identifier
  )}/postings`;

  const out: NormalizedPosting[] = [];
  let total = Infinity;
  for (let offset = 0; offset < MAX_RESULTS; offset += LIMIT) {
    const res = await fetchWithTimeout(`${base}?limit=${LIMIT}&offset=${offset}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`SmartRecruiters ${identifier}: HTTP ${res.status} at offset ${offset}`);
    const data = await res.json();
    const content: any[] = Array.isArray(data?.content) ? data.content : [];
    if (typeof data?.totalFound === "number") total = data.totalFound;
    if (content.length === 0) break;

    for (const p of content) {
      const loc = p.location || {};
      const remote = loc.remote === true;
      // One detail fetch per posting for the description (best-effort).
      let description = "";
      try {
        const dr = await fetchWithTimeout(`${base}/${p.id}`, { cache: "no-store" });
        if (dr.ok) {
          const detail = await dr.json();
          const sections = detail?.jobAd?.sections || {};
          description = htmlToText(
            [
              sections?.jobDescription?.text,
              sections?.qualifications?.text,
            ]
              .filter(Boolean)
              .join("\n")
          );
        }
      } catch {
        // keep going without a description
      }

      out.push({
        sourceJobId: String(p.id),
        title: p.name ?? "",
        company: identifier,
        city: loc.city || (remote ? "Remote" : ""),
        country: loc.country || (remote ? "Remote" : "Unknown"),
        description,
        applyUrl: `https://jobs.smartrecruiters.com/${identifier}/${p.id}`,
        postedAt: p.releasedDate ? new Date(p.releasedDate) : undefined,
      });
    }
    if (content.length < LIMIT || out.length >= total) break;
  }
  if (out.length < total && out.length >= MAX_RESULTS) {
    throw new Error(`SmartRecruiters ${identifier}: ${total} postings exceed the ${MAX_RESULTS} cap — list would be partial`);
  }
  return out;
};
