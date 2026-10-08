import {
  Adapter,
  NormalizedPosting,
  htmlToText,
  parseLocation,
} from "../types";

/**
 * Recruitee public offers API.
 * GET https://{company}.recruitee.com/api/offers/
 */
export const recruitee: Adapter = async (identifier) => {
  const url = `https://${encodeURIComponent(identifier)}.recruitee.com/api/offers/`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Recruitee ${identifier}: HTTP ${res.status}`);
  const data = await res.json();
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
