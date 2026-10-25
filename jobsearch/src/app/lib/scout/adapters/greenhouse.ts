import {
  ListAdapter,
  NormalizedPosting,
  fetchJson,
  htmlToText,
  parseLocation,
} from "../types";

/**
 * Greenhouse job board API (public, no key).
 * Docs: https://developers.greenhouse.io/job-board.html
 * GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 */
export const greenhouse: ListAdapter = async (identifier) => {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    identifier
  )}/jobs?content=true`;

  const { ok, status, data } = await fetchJson(url, { cache: "no-store" });
  if (!ok) {
    throw new Error(`Greenhouse ${identifier}: HTTP ${status}`);
  }
  const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];

  return jobs.map((j): NormalizedPosting => {
    const { city, country } = parseLocation(j?.location?.name ?? "");
    const posted = j?.first_published || j?.updated_at;
    return {
      sourceJobId: String(j.id),
      title: j.title ?? "",
      company: j.company_name ?? identifier,
      city,
      country,
      description: htmlToText(j.content ?? ""),
      applyUrl: j.absolute_url ?? "",
      postedAt: posted ? new Date(posted) : undefined,
    };
  });
};
