import {
  ListAdapter,
  NormalizedPosting,
  fetchJson,
  htmlToText,
  parseLocation,
} from "../types";

/**
 * Recruitee public offers API.
 * GET https://{company}.recruitee.com/api/offers/
 */
export const recruitee: ListAdapter = async (identifier) => {
  const url = `https://${encodeURIComponent(identifier)}.recruitee.com/api/offers/`;
  const { ok, status, data } = await fetchJson(url, { cache: "no-store" });
  if (!ok) throw new Error(`Recruitee ${identifier}: HTTP ${status}`);
  const offers: any[] = Array.isArray(data?.offers) ? data.offers : [];

  return offers.map((o): NormalizedPosting => {
    const locStr = o.location || [o.city, o.country].filter(Boolean).join(", ");
    const { city, country } = parseLocation(locStr);
    const remote = /remote/i.test(`${locStr} ${o.remote ? "remote" : ""}`);
    return {
      sourceJobId: String(o.id),
      title: o.title ?? "",
      company: identifier,
      city: o.city || city || (remote ? "Remote" : ""),
      country: o.country || country || (remote ? "Remote" : "Unknown"),
      description: htmlToText(o.description || ""),
      applyUrl: o.careers_apply_url || o.careers_url || "",
      postedAt: o.published_at ? new Date(o.published_at) : undefined,
    };
  });
};
