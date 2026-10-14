import { Adapter, NormalizedPosting, htmlToText } from "../types";

/**
 * Workable public widget API (no key).
 *   identifier = the account subdomain ("tomax" for tomax.workable.com / apply.workable.com/tomax)
 * List:   GET https://apply.workable.com/api/v1/widget/accounts/{slug}            → { name, jobs: [...] }
 * Detail: GET https://apply.workable.com/api/v1/widget/accounts/{slug}/jobs/{shortcode} → { description, requirements, benefits, ... }
 * The list carries title, city/country and dates; descriptions come from the
 * detail call (bounded, sequential, polite).
 */
const BASE = "https://apply.workable.com/api/v1/widget/accounts";
const MAX_DETAIL = 80;
const HEADERS = { "User-Agent": "Mozilla/5.0 JobMatchScout", Accept: "application/json" };

export const workable: Adapter = async (identifier) => {
  const slug = encodeURIComponent(identifier);
  const res = await fetch(`${BASE}/${slug}`, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Workable ${identifier}: HTTP ${res.status}`);
  const data = await res.json();
  const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
  const company = data?.name || identifier;

  const out: NormalizedPosting[] = jobs.map((j) => ({
    sourceJobId: String(j.shortcode || j.code || j.url),
    title: j.title ?? "",
    company,
    city: j.city || j.locations?.[0]?.city || "",
    country: j.country || j.locations?.[0]?.country || "Unknown",
    description: "",
    applyUrl: j.application_url || j.url || j.shortlink || "",
    postedAt: j.published_on ? new Date(j.published_on) : j.created_at ? new Date(j.created_at) : undefined,
    seniority: j.experience ? [String(j.experience)] : [],
  }));

  for (const p of out.slice(0, MAX_DETAIL)) {
    try {
      const d = await fetch(`${BASE}/${slug}/jobs/${encodeURIComponent(p.sourceJobId)}`, { headers: HEADERS, cache: "no-store" });
      if (!d.ok) continue;
      const job = await d.json();
      p.description = [job.description, job.requirements ? `<h3>Requirements</h3>${job.requirements}` : "", job.benefits ? `<h3>Benefits</h3>${job.benefits}` : ""].filter(Boolean).map((h) => htmlToText(String(h))).join("\n\n");
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      /* keep the listing-level data */
    }
  }
  return out;
};
