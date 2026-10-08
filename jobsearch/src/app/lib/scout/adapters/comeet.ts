import { Adapter, NormalizedPosting, htmlToText } from "../types";

/**
 * Comeet careers API (the dominant Israeli ATS).
 * GET https://www.comeet.co/careers-api/2.0/company/{uid}/positions?token={token}&details=true
 *   identifier          = company uid (e.g. "06.004")
 *   secondaryIdentifier = public token (from the company's career-page embed)
 */
export const comeet: Adapter = async (identifier, secondaryIdentifier) => {
  if (!secondaryIdentifier) {
    throw new Error("Comeet needs a token (secondaryIdentifier)");
  }
  const url = `https://www.comeet.co/careers-api/2.0/company/${encodeURIComponent(
    identifier
  )}/positions?token=${encodeURIComponent(secondaryIdentifier)}&details=true`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Comeet ${identifier}: HTTP ${res.status}`);
  const data = await res.json();
  const positions: any[] = Array.isArray(data) ? data : data?.positions ?? [];

  return positions.map((p): NormalizedPosting => {
    const loc = p.location || {};
    const remote =
      loc.is_remote === true || /remote/i.test(p.workplace_type || "");
    // Comeet splits the posting into named sections (Description,
    // Requirements, …); keep the names as headings so the text stays
    // structured instead of two blobs run together.
    const detailText = Array.isArray(p.details)
      ? p.details
          .map((d: any) => {
            const body = htmlToText(d?.value ?? "");
            if (!body) return "";
            const name = typeof d?.name === "string" ? d.name.trim() : "";
            return name ? `${name}\n${body}` : body;
          })
          .filter(Boolean)
          .join("\n\n")
      : htmlToText(p.details || "");
    return {
      sourceJobId: String(p.uid ?? ""),
      title: p.name ?? "",
      company: p.company_name || identifier,
      city: loc.city || (remote ? "Remote" : ""),
      country: loc.country || (remote ? "Remote" : "Unknown"), // e.g. "IL"
      description: detailText,
      applyUrl:
        p.url_comeet_hosted_page ||
        p.url_active_page ||
        p.position_url ||
        "",
      postedAt: p.time_updated ? new Date(p.time_updated) : undefined,
      seniority: p.experience_level ? [p.experience_level] : [],
    };
  });
};
