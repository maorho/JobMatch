import {
  Adapter,
  NormalizedPosting,
  fetchWithTimeout,
  htmlToText,
  parseLocation,
} from "../types";

/**
 * Lever postings API (public, no key).
 * GET https://api.lever.co/v0/postings/{handle}?mode=json
 */
export const lever: Adapter = async (identifier) => {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(
    identifier
  )}?mode=json`;

  const res = await fetchWithTimeout(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Lever ${identifier}: HTTP ${res.status}`);
  }
  const data = await res.json();
  const jobs: any[] = Array.isArray(data) ? data : [];

  return jobs.map((j): NormalizedPosting => {
    const { city, country } = parseLocation(j?.categories?.location ?? "");
    const description =
      (j?.descriptionPlain as string) || htmlToText(j?.description ?? "");
    return {
      sourceJobId: String(j.id),
      title: j.text ?? "",
      company: identifier,
      city,
      country,
      description,
      applyUrl: j.hostedUrl ?? j.applyUrl ?? "",
      postedAt: j.createdAt ? new Date(j.createdAt) : undefined,
      // Lever exposes employment type (categories.commitment), not seniority —
      // leave seniority empty rather than misclassify it.
      seniority: [],
    };
  });
};
