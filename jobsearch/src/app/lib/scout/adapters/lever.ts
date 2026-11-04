import {
  ListAdapter,
  NormalizedPosting,
  fetchJson,
  htmlToText,
  parseLocation,
} from "../types";

/**
 * Lever postings API (public, no key).
 * GET https://api.lever.co/v0/postings/{handle}?mode=json
 * EU-hosted accounts (jobs.eu.lever.co, e.g. Mobileye) live on api.eu.lever.co:
 * identifier "eu:{handle}".
 */
export const lever: ListAdapter = async (identifier) => {
  const eu = identifier.startsWith("eu:");
  const handle = eu ? identifier.slice(3) : identifier;
  const url = `https://api.${eu ? "eu." : ""}lever.co/v0/postings/${encodeURIComponent(handle)}?mode=json`;

  const { ok, status, data } = await fetchJson(url, { cache: "no-store" });
  if (!ok) {
    throw new Error(`Lever ${identifier}: HTTP ${status}`);
  }
  const jobs: any[] = Array.isArray(data) ? data : [];

  return jobs.map((j): NormalizedPosting => {
    const { city, country } = parseLocation(j?.categories?.location ?? "");
    const description =
      (j?.descriptionPlain as string) || htmlToText(j?.description ?? "");
    return {
      sourceJobId: String(j.id),
      title: j.text ?? "",
      company: handle,
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
