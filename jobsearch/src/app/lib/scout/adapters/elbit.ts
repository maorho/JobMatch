import { ListAdapter, NormalizedPosting, fetchJson, htmlToText } from "../types";

/**
 * Elbit Systems careers (elbitsystemscareer.com, verified 2026-11-04).
 * The site is a JS app whose whole board sits in one public JSON file,
 * `/cron/jobs.json` (~540 postings): jobId, jobTitle, description /
 * requirements / skills (HTML, entity-escaped), area (North / Center /
 * Sharon / Shfela / South / Jerusalem Area / Haifa), locationAddress (Hebrew
 * region when present), openDate, employerName (the division, Hebrew).
 *   identifier = site origin, e.g. "https://elbitsystemscareer.com"
 * Everything is in Israel; the job page is /job?id={jobId}.
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Elbit's English area names → the Hebrew region words the location rules know. */
const AREA_HE: Record<string, string> = {
  north: "צפון",
  center: "מרכז",
  sharon: "השרון",
  shfela: "שפלה",
  south: "דרום",
  "jerusalem area": "ירושלים",
  haifa: "חיפה",
};

const unescapeHtml = (s: unknown) =>
  String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

export const elbit: ListAdapter = async (identifier) => {
  const origin = (identifier || "https://elbitsystemscareer.com").replace(/\/+$/, "");
  const { ok, status, data } = await fetchJson(`${origin}/cron/jobs.json?t=${Date.now()}`, { headers: { "User-Agent": UA, Accept: "application/json", Referer: `${origin}/` }, cache: "no-store" });
  if (!ok) throw new Error(`Elbit ${origin}: HTTP ${status}`);
  const rows: any[] = Array.isArray(data) ? data : [];
  const out: NormalizedPosting[] = [];
  for (const j of rows) {
    if (!j?.jobId || (j.status !== undefined && Number(j.status) !== 1)) continue;
    const parts = [j.description, j.requirements ? `<p><b>Requirements</b></p>${j.requirements}` : "", j.skills ? `<p><b>Skills</b></p>${j.skills}` : ""].filter(Boolean).map(unescapeHtml);
    const description = htmlToText(parts.join("\n"));
    const area = String(j.area || "").trim();
    const city = String(j.locationAddress || "").trim() || AREA_HE[area.toLowerCase()] || area;
    out.push({
      sourceJobId: String(j.jobId),
      title: String(j.jobTitle || "").trim(),
      company: "",
      city,
      country: "Israel",
      description: j.employerName ? `${description}\n\nDivision: ${j.employerName}` : description,
      applyUrl: `${origin}/job?id=${j.jobId}`,
      postedAt: j.openDate ? new Date(j.openDate) : undefined,
    });
  }
  return out;
};
