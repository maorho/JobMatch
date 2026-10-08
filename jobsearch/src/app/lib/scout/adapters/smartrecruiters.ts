import { Adapter, NormalizedPosting, htmlToText } from "../types";

/**
 * SmartRecruiters public postings API.
 * List:   https://api.smartrecruiters.com/v1/companies/{company}/postings
 * Detail: https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}
 */
export const smartrecruiters: Adapter = async (identifier) => {
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(
    identifier
  )}/postings`;

  const out: NormalizedPosting[] = [];
  const LIMIT = 100;
  for (let offset = 0; offset < 1000; offset += LIMIT) {
    const res = await fetch(`${base}?limit=${LIMIT}&offset=${offset}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`SmartRecruiters ${identifier}: HTTP ${res.status}`);
    const data = await res.json();
    const content: any[] = Array.isArray(data?.content) ? data.content : [];
    if (content.length === 0) break;

    for (const p of content) {
      const loc = p.location || {};
      const remote = loc.remote === true;
      // One detail fetch per posting for the description (best-effort).
      let description = "";
      try {
        const dr = await fetch(`${base}/${p.id}`, { cache: "no-store" });
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
    if (content.length < LIMIT) break;
  }
  return out;
};
