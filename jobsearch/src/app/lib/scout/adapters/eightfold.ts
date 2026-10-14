import { Adapter, NormalizedPosting, fetchWithTimeout, htmlToText } from "../types";

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
const MAX_DETAIL = 80;
const HEADERS = { "User-Agent": "Mozilla/5.0 JobMatchScout", Accept: "application/json" };
/** Eightfold rate-limits bursts (HTTP 429): pause between detail calls and back off before retrying. */
const DETAIL_DELAY_MS = 300;
const RETRY_DELAYS_MS = [3_000, 10_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPolite(url: string): Promise<Response> {
  let res = await fetchWithTimeout(url, { headers: HEADERS, cache: "no-store" });
  for (const delay of RETRY_DELAYS_MS) {
    if (res.status !== 429 && res.status !== 503) break;
    await sleep(delay);
    res = await fetchWithTimeout(url, { headers: HEADERS, cache: "no-store" });
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

  const out: NormalizedPosting[] = [];
  let count = Infinity;
  for (let start = 0; start < Math.min(count, MAX_POSITIONS); start += PAGE) {
    const url = `${base}/api/pcsx/search?domain=${encodeURIComponent(domain)}&query=&location=Israel&start=${start}&num=${PAGE}`;
    const res = await fetchPolite(url);
    // Complete-feed contract: a failed page beyond the first is a partial list → throw.
    if (!res.ok) throw new Error(`Eightfold ${host}: HTTP ${res.status} at start=${start}`);
    let data: any;
    try {
      data = await res.json();
    } catch {
      // Past the last page the site answers with HTML; before it, that is a broken page.
      if (out.length >= count) break;
      throw new Error(`Eightfold ${host}: non-JSON page at start=${start} (${out.length}/${count} postings)`);
    }
    const positions: any[] = Array.isArray(data?.data?.positions) ? data.data.positions : [];
    if (typeof data?.data?.count === "number") count = data.data.count;
    if (positions.length === 0) break;
    for (const p of positions) {
      const id = String(p.id ?? p.displayJobId ?? "");
      if (!id) continue;
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
  if (out.length < count && out.length >= MAX_POSITIONS) {
    throw new Error(`Eightfold ${host}: ${count} postings exceed the ${MAX_POSITIONS} cap — list would be partial`);
  }

  for (const p of out.slice(0, MAX_DETAIL)) {
    try {
      const d = await fetchPolite(`${base}/api/apply/v2/jobs/${encodeURIComponent(p.sourceJobId)}?domain=${encodeURIComponent(domain)}`);
      if (!d.ok) continue;
      const job = await d.json();
      if (job?.job_description) p.description = htmlToText(String(job.job_description));
      await sleep(DETAIL_DELAY_MS);
    } catch {
      /* keep the listing-level data */
    }
  }
  return out;
};
