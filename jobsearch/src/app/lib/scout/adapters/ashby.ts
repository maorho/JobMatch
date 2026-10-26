import {
  ListAdapter,
  NormalizedPosting,
  fetchJson,
  htmlToText,
  parseLocation,
} from "../types";

/**
 * Ashby job board API (public, no key).
 * GET https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true
 */
export const ashby: ListAdapter = async (identifier) => {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
    identifier
  )}?includeCompensation=true`;

  const { ok, status, data } = await fetchJson(url, { cache: "no-store" });
  if (!ok) throw new Error(`Ashby ${identifier}: HTTP ${status}`);
  const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];

  return jobs.map((j): NormalizedPosting => {
    const remote =
      j.isRemote === true || String(j.workplaceType).toLowerCase() === "remote";
    const loc = j.location || "";
    const { city, country } = parseLocation(loc);
    return {
      sourceJobId: String(j.id),
      title: j.title ?? "",
      company: identifier,
      // Surface remote in the city text so the location filter catches it.
      city: remote && !/remote/i.test(loc) ? `${loc} (Remote)`.trim() : city,
      country: country || (remote ? "Remote" : "Unknown"),
      description: j.descriptionPlain || htmlToText(j.descriptionHtml || ""),
      applyUrl: j.applyUrl || j.jobUrl || "",
      postedAt: j.publishedAt ? new Date(j.publishedAt) : undefined,
    };
  });
};
