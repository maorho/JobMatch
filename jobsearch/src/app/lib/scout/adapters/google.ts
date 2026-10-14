import { Adapter, NormalizedPosting, fetchWithTimeout, htmlToText } from "../types";

/**
 * Google Careers (verified 2026-10-07).
 * There is no public JSON API, but the results page is plain server-rendered
 * HTML (reachable from datacenter IPs — HTTP 200) that embeds the job data in
 * an `AF_initDataCallback({key:'ds:1', data:[...]})` blob, 20 jobs per page.
 *
 *   identifier          = location query, e.g. "Israel"
 *   secondaryIdentifier = optional extra query string, e.g. "q=software"
 *
 * Each job row (found by walking the blob) looks like:
 *   [0] id            [1] title           [2] sign-in apply link
 *   [3][1] responsibilities HTML   [4][1] minimum qualifications HTML
 *   [7] company       [9] locations: [display, [address], city, _, district, countryCode][]
 *   [10][1] about HTML            [12..14] [unixSeconds, nanos] timestamps
 *   [19][1] preferred qualifications HTML
 */
const BASE = "https://www.google.com/about/careers/applications/jobs/results/";
const PAGE_SIZE = 20;
const MAX_PAGES = 15; // 300 jobs — far above any single location's volume
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type Row = any[];

/** Pull the ds:1 data array out of the page and collect job-shaped rows. */
function extractRows(html: string): Row[] {
  const m = html.match(
    /AF_initDataCallback\(\{key:\s*'ds:1'[\s\S]*?data:(\[[\s\S]*?)\s*,\s*sideChannel/
  );
  if (!m) return [];
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const rows: Row[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || !Array.isArray(node)) return;
    // A job row: numeric-string id followed by a title string.
    if (
      node.length > 9 &&
      typeof node[0] === "string" &&
      /^\d{12,}$/.test(node[0]) &&
      typeof node[1] === "string"
    ) {
      rows.push(node);
      return;
    }
    for (const child of node) walk(child, depth + 1);
  };
  walk(data, 0);
  return rows;
}

const html = (v: unknown): string =>
  Array.isArray(v) && typeof v[1] === "string" ? v[1] : "";

function toDate(ts: unknown): Date | undefined {
  if (Array.isArray(ts) && typeof ts[0] === "number" && ts[0] > 1e9) {
    return new Date(ts[0] * 1000);
  }
  return undefined;
}

export const google: Adapter = async (identifier, secondaryIdentifier) => {
  const location = identifier || "Israel";
  const extra = secondaryIdentifier ? `&${secondaryIdentifier.replace(/^[?&]/, "")}` : "";
  const out: NormalizedPosting[] = [];
  const seen = new Set<string>();

  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const url = `${BASE}?location=${encodeURIComponent(location)}&page=${page}${extra}`;
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });
    // Complete-feed contract: a failed page (first or later) means a partial list → throw.
    if (!res.ok) throw new Error(`Google careers: HTTP ${res.status} on page ${page}`);
    const rows = extractRows(await res.text());
    if (rows.length === 0) break;

    for (const r of rows) {
      const id = String(r[0]);
      if (seen.has(id)) continue;
      seen.add(id);

      // Prefer the Israeli office when a posting lists several locations.
      const locs: any[] = Array.isArray(r[9]) ? r[9] : [];
      const loc =
        locs.find((l) => Array.isArray(l) && l[5] === "IL") || locs[0] || [];
      const display: string = typeof loc[0] === "string" ? loc[0] : "";
      const city: string =
        (typeof loc[2] === "string" && loc[2]) || display.split(",")[0] || "";
      const country: string =
        (typeof loc[5] === "string" && loc[5]) ||
        display.split(",").pop()?.trim() ||
        "Unknown";

      const description = [
        htmlToText(html(r[10])),
        htmlToText(html(r[3])) && `Responsibilities:\n${htmlToText(html(r[3]))}`,
        htmlToText(html(r[4])) && `Minimum qualifications:\n${htmlToText(html(r[4]))}`,
        htmlToText(html(r[19])) && `Preferred qualifications:\n${htmlToText(html(r[19]))}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      out.push({
        sourceJobId: id,
        title: String(r[1] ?? ""),
        company: typeof r[7] === "string" && r[7] ? r[7] : "Google",
        city,
        country,
        description,
        // Public job page (the embedded link is a sign-in redirect).
        applyUrl: `${BASE}${id}`,
        postedAt: toDate(r[14]) || toDate(r[13]) || toDate(r[12]),
        seniority: [],
      });
    }

    if (rows.length < PAGE_SIZE) break;
    await new Promise((r) => setTimeout(r, 300)); // be polite
  }
  // Google reports no total: a full last page at the cap means there is more.
  if (page > MAX_PAGES) {
    throw new Error(`Google careers: more than ${MAX_PAGES} pages for "${location}" — list would be partial`);
  }

  return out;
};
