import { Adapter, NormalizedPosting, adapterResult, fetchJson, htmlToText } from "../types";

/**
 * Eightfold-hosted career sites (Microsoft's apply.careers.microsoft.com and
 * other large tenants). Public JSON, no key:
 *   identifier          = the careers host, e.g. "apply.careers.microsoft.com"
 *   secondaryIdentifier = the tenant domain the site is served for, e.g. "microsoft.com"
 * List:   GET https://{host}/api/pcsx/search?domain={domain}&location=Israel&start=N&num=10
 *         → { data: { count, positions: [...] } } — ten per page regardless of `num`
 * Detail: GET https://{host}/api/apply/v2/jobs/{id}?domain={domain} → { job_description (HTML), ... }
 * Filtered to Israel like the Amazon adapter: this catalog is the Israeli market.
 */
const PAGE = 10;
const MAX_POSITIONS = 500;
const MAX_DETAIL = 60;
const HEADERS = { "User-Agent": "Mozilla/5.0 JobMatchScout", Accept: "application/json" };
/** Eightfold rate-limits bursts (HTTP 429): pause between detail calls and back off before retrying. */
const DETAIL_DELAY_MS = 150;
const RETRY_DELAYS_MS = [3_000, 10_000];
/**
 * Time boxes inside the per-source deadline (runScout gives Eightfold 120s):
 * the list gets most of it, details only start while the adapter is young
 * enough, so list + details always return before the deadline cuts them off.
 */
const LIST_BUDGET_MS = 60_000;
const DETAIL_BUDGET_MS = 85_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** JSON GET that waits out a 429/503 burst limit (twice) before giving up. */
async function fetchPolite(url: string) {
  let res = await fetchJson(url, { headers: HEADERS, cache: "no-store" });
  for (const delay of RETRY_DELAYS_MS) {
    if (res.status !== 429 && res.status !== 503) break;
    await sleep(delay);
    res = await fetchJson(url, { headers: HEADERS, cache: "no-store" });
  }
  return res;
}

/** "Israel, Tel Aviv, Herzliya" → "Herzliya"; skips the "Multiple Locations" placeholder. */
export function eightfoldCity(locations: unknown): string {
  const list = Array.isArray(locations) ? locations.map(String) : typeof locations === "string" ? [locations] : [];
  for (const loc of list) {
    const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
    const city = parts[parts.length - 1];
    if (city && !/multiple locations/i.test(city)) return city;
  }
  return "";
}

export const eightfold: Adapter = async (identifier, secondaryIdentifier) => {
  const host = identifier.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const domain = secondaryIdentifier || host.replace(/^.*?\.(?=[^.]+\.[^.]+$)/, "");
  const base = `https://${host}`;
  const company = domain.replace(/\.[a-z]+$/i, "").replace(/^\w/, (c) => c.toUpperCase());

  const startedAt = Date.now();
  const out: NormalizedPosting[] = [];
  const seen = new Set<string>();
  let count: number | null = null; // null = not reported yet
  let incomplete: string | null = null;
  let start = 0;
  for (; start < Math.min(count ?? Infinity, MAX_POSITIONS); start += PAGE) {
    if (start > 0 && Date.now() - startedAt > LIST_BUDGET_MS) {
      incomplete = `list paging ran out of time at start=${start}`;
      break;
    }
    const url = `${base}/api/pcsx/search?domain=${encodeURIComponent(domain)}&query=&location=Israel&start=${start}&num=${PAGE}`;
    let data: any;
    try {
      const res = await fetchPolite(url);
      if (!res.ok) throw new Error(`Eightfold ${host}: HTTP ${res.status} at start=${start}`);
      data = res.data;
    } catch (e) {
      // Past the last page the site answers with HTML (not JSON): that is the end, not an error.
      if (count !== null && out.length >= count) break;
      if (start === 0) throw e;
      incomplete = `page at start=${start} failed (${out.length}/${count ?? "?"} postings): ${(e as Error).message}`;
      break;
    }
    const positions: any[] = Array.isArray(data?.data?.positions) ? data.data.positions : [];
    if (typeof data?.data?.count === "number") count = data.data.count;
    if (positions.length === 0) break;
    for (const p of positions) {
      const id = String(p.id ?? p.displayJobId ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        sourceJobId: id,
        title: p.name ?? "",
        company,
        city: eightfoldCity(p.locations),
        country: "Israel",
        description: "",
        applyUrl: p.positionUrl ? `${base}${p.positionUrl}` : `${base}/careers/job/${id}`,
        postedAt: p.postedTs ? new Date(Number(p.postedTs) * 1000) : p.creationTs ? new Date(Number(p.creationTs) * 1000) : undefined,
      });
    }
    if (positions.length < PAGE) break;
  }
  if (!incomplete && count !== null && out.length < count) {
    incomplete = start >= MAX_POSITIONS ? `stopped at the ${MAX_POSITIONS}-posting cap with ${out.length} of ${count}` : `got ${out.length} of ${count} reported postings`;
  }

  // Descriptions: capped and time-boxed, so a slow or rate-limiting tenant still returns in time.
  for (const p of out.slice(0, MAX_DETAIL)) {
    if (Date.now() - startedAt > DETAIL_BUDGET_MS) break;
    try {
      const d = await fetchPolite(`${base}/api/apply/v2/jobs/${encodeURIComponent(p.sourceJobId)}?domain=${encodeURIComponent(domain)}`);
      if (!d.ok) continue;
      const job = d.data;
      if (job?.job_description) p.description = htmlToText(String(job.job_description));
      await sleep(DETAIL_DELAY_MS);
    } catch {
      /* keep the listing-level data */
    }
  }
  return adapterResult(out, incomplete && `Eightfold ${host}: ${incomplete}`);
};
