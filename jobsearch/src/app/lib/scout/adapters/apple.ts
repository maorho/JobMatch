import { Adapter, NormalizedPosting, adapterResult, fetchText } from "../types";

/**
 * Apple Jobs (verified 2026-10-07).
 * The search page is server-rendered (HTTP 200 from datacenter IPs) and embeds
 * its results as `window.__staticRouterHydrationData = JSON.parse("...")`.
 * Results live at `loaderData.search.searchResults` (20 per page) with
 * `totalRecords`; pages advance with `page=N`.
 *
 *   identifier          = Apple location code, e.g. "israel-ISR"
 *   secondaryIdentifier = optional extra query string, e.g. "team=SFTWR"
 */
const LOCALE = "en-il";
const BASE = `https://jobs.apple.com/${LOCALE}/search`;
const PAGE_SIZE = 20;
const MAX_PAGES = 20;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type SearchPage = { results: any[]; total: number };

function extract(html: string): SearchPage {
  // The payload is a JS string literal: unescape it once, then parse the JSON.
  const m = html.match(
    /__staticRouterHydrationData\s*=\s*JSON\.parse\("((?:[^"\\]|\\.)*)"\)/
  );
  if (!m) return { results: [], total: 0 };
  try {
    const data = JSON.parse(JSON.parse(`"${m[1]}"`));
    const search = data?.loaderData?.search ?? {};
    return {
      results: Array.isArray(search.searchResults) ? search.searchResults : [],
      total: Number(search.totalRecords) || 0,
    };
  } catch {
    return { results: [], total: 0 };
  }
}

/** Apple's `locations` is an array of objects; pull a readable city name. */
function cityOf(locations: unknown): string {
  if (!Array.isArray(locations) || locations.length === 0) return "";
  const l = locations[0];
  if (typeof l === "string") return l.split(",")[0].trim();
  if (l && typeof l === "object") {
    const o = l as Record<string, unknown>;
    const name = (o.name ?? o.city ?? o.displayName ?? "") as string;
    return String(name).split(",")[0].trim();
  }
  return "";
}

/** "israel-ISR" -> "Israel" (country from the location code). */
function countryOf(identifier: string): string {
  const base = identifier.split("-")[0] || "";
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Unknown";
}

export const apple: Adapter = async (identifier, secondaryIdentifier) => {
  const location = identifier || "israel-ISR";
  const country = countryOf(location);
  const extra = secondaryIdentifier
    ? `&${secondaryIdentifier.replace(/^[?&]/, "")}`
    : "";
  const out: NormalizedPosting[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  let incomplete: string | null = null;

  let page = 1;
  for (; page <= MAX_PAGES && (total === null || out.length < total); page++) {
    const url = `${BASE}?location=${encodeURIComponent(location)}&page=${page}${extra}`;
    let body: string;
    try {
      const r = await fetchText(url, { headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store" });
      if (!r.ok) throw new Error(`Apple jobs: HTTP ${r.status} on page ${page}`);
      body = r.text;
    } catch (e) {
      // Nothing usable without the first page; a later failure just makes the list partial.
      if (page === 1) throw e;
      incomplete = `page ${page} failed: ${(e as Error).message}`;
      break;
    }
    const { results, total: t } = extract(body);
    if (t) total = t;
    if (results.length === 0) break;

    for (const r of results) {
      const id = String(r.id ?? r.positionId ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const positionId = String(r.positionId ?? id);
      const slug = r.transformedPostingTitle ? `/${r.transformedPostingTitle}` : "";
      const remote = r.homeOffice === true;
      // A country-level posting lists the country itself as its "city".
      const rawCity = cityOf(r.locations);
      const city = rawCity.toLowerCase() === country.toLowerCase() ? "" : rawCity;
      out.push({
        sourceJobId: id,
        title: String(r.postingTitle ?? ""),
        company: "Apple",
        city: city || (remote ? "Remote" : ""),
        country,
        description: String(r.jobSummary ?? ""),
        applyUrl: `https://jobs.apple.com/${LOCALE}/details/${positionId}${slug}`,
        postedAt: r.postDateInGMT
          ? new Date(r.postDateInGMT)
          : r.postingDate
          ? new Date(r.postingDate)
          : undefined,
        seniority: [],
      });
    }

    if (results.length < PAGE_SIZE) break;
    await new Promise((r) => setTimeout(r, 300)); // be polite
  }
  // Apple repeats a posting across pages now and then (we dedupe by id), so a
  // couple short of totalRecords is still the whole board.
  if (!incomplete && total !== null && out.length < total - dedupeTolerance(total)) {
    incomplete = page > MAX_PAGES ? `stopped at the ${MAX_PAGES}-page cap with ${out.length} of ${total}` : `got ${out.length} of ${total} reported postings`;
  }
  return adapterResult(out, incomplete && `Apple jobs: ${incomplete}`);
};

/** How many postings short of the reported total still counts as complete (dedupe slack). */
export const dedupeTolerance = (total: number) => Math.max(2, Math.ceil(total * 0.02));
