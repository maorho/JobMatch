import {
  ListAdapter,
  NormalizedPosting,
  fetchJson,
  htmlToText,
  parseLocation,
} from "../types";

/**
 * SerpApi Google Jobs — aggregates listings from Indeed, LinkedIn, and other
 * boards behind one clean API. Requires SERPAPI_KEY.
 *   identifier          = the search query (e.g. "software engineer")
 *   secondaryIdentifier = optional location (e.g. "Israel")
 * Docs: https://serpapi.com/google-jobs-api
 */
export const serpapi: ListAdapter = async (identifier, secondaryIdentifier) => {
  const key = process.env.SERPAPI_KEY;
  if (!key) {
    throw new Error("SERPAPI_KEY is not configured");
  }

  const params = new URLSearchParams({
    engine: "google_jobs",
    q: identifier,
    api_key: key,
    hl: "en",
  });
  if (secondaryIdentifier) params.set("location", secondaryIdentifier);

  const { ok, status, data } = await fetchJson(`https://serpapi.com/search.json?${params.toString()}`, {
    cache: "no-store",
  });
  if (!ok) {
    throw new Error(`SerpApi: HTTP ${status}`);
  }
  const results: any[] = Array.isArray(data?.jobs_results)
    ? data.jobs_results
    : [];

  return results.map((j): NormalizedPosting => {
    const { city, country } = parseLocation(j?.location ?? "");
    const applyUrl =
      j?.apply_options?.[0]?.link ||
      j?.related_links?.[0]?.link ||
      j?.share_link ||
      "";
    return {
      sourceJobId: String(j.job_id ?? applyUrl ?? j.title),
      title: j.title ?? "",
      company: j.company_name ?? "",
      city,
      country,
      description: htmlToText(j.description ?? ""),
      applyUrl,
      seniority: [],
    };
  });
};
