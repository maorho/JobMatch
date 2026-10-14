import * as cheerio from "cheerio";
import { Adapter, NormalizedPosting, fetchWithTimeout, htmlToText, parseLocation } from "../types";

/**
 * Generic server-rendered HTML job board (staffing agencies, government and
 * other custom career sites that run no standard ATS).
 *
 *   identifier          = one or more listing-page URLs, comma-separated
 *   secondaryIdentifier = JSON selector config:
 *     {
 *       "item":     "article.job-card",        // repeated job container (required)
 *       "title":    "h3 a",                    // title within item (default: first <a>)
 *       "link":     "h3 a",                    // href within item (default: first <a>)
 *       "location": ".job-location",           // optional, within item
 *       "desc":     ".job-summary",            // optional, within item
 *       "detail": {                            // optional: fetch each job page
 *         "desc":     ".job-description",
 *         "location": ".job-location"
 *       },
 *       "company":  "Nisha",                   // optional default company label
 *       "country":  "Israel",                  // default country when none parsed
 *       "maxDetail": 60,                       // cap detail fetches per run
 *       "jsonHtmlKey": "data"                  // optional: listing URL returns JSON and
 *                                              // the HTML lives under this dotted key
 *                                              // (WordPress admin-ajax style)
 *     }
 *
 * Dedup key is the job URL (stable per posting on these sites). Only the
 * fields the site exposes are filled; location defaults to the configured
 * country so Israel-only boards pass the ingestion location filter.
 */
type DetailCfg = { desc?: string; location?: string };
type Cfg = {
  item: string;
  title?: string;
  link?: string;
  location?: string;
  desc?: string;
  detail?: DetailCfg;
  company?: string;
  country?: string;
  maxDetail?: number;
  jsonHtmlKey?: string;
};

/**
 * Pull the HTML out of a JSON envelope by dotted key ("data" / "data.html").
 * If the key lands on an object or array instead of a string, use the first
 * string inside it that contains markup — so a config of "data" still works
 * when the site nests the fragment one level deeper.
 */
function unwrapJsonHtml(body: string, key: string): string {
  const firstMarkup = (node: unknown, depth = 0): string => {
    if (depth > 3 || node == null) return "";
    if (typeof node === "string") return /<[a-z][\s\S]*>/i.test(node) ? node : "";
    if (typeof node !== "object") return "";
    for (const v of Object.values(node as Record<string, unknown>)) {
      const found = firstMarkup(v, depth + 1);
      if (found) return found;
    }
    return "";
  };
  try {
    let node: unknown = JSON.parse(body);
    for (const part of key.split(".")) {
      if (!node || typeof node !== "object") return "";
      node = (node as Record<string, unknown>)[part];
    }
    return firstMarkup(node);
  } catch {
    return "";
  }
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, Accept: "text/html", "Accept-Language": "he,en;q=0.8" };

async function getHtml(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, { headers: HEADERS, cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`HTML board ${url}: HTTP ${res.status}`);
  return res.text();
}

const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();

export const html: Adapter = async (identifier, secondaryIdentifier) => {
  if (!secondaryIdentifier) throw new Error("html adapter needs a JSON selector config");
  let cfg: Cfg;
  try {
    cfg = JSON.parse(secondaryIdentifier);
  } catch {
    throw new Error("html adapter: secondaryIdentifier is not valid JSON");
  }
  if (!cfg.item) throw new Error("html adapter: config.item selector is required");

  const urls = identifier.split(",").map((u) => u.trim()).filter(Boolean);
  const country = cfg.country || "Israel";
  const maxDetail = cfg.maxDetail ?? 60;
  const out: NormalizedPosting[] = [];
  const seen = new Set<string>();

  for (const listUrl of urls) {
    const body = await getHtml(listUrl);
    // Some boards (WordPress admin-ajax) hand back JSON that wraps the HTML.
    const markup = cfg.jsonHtmlKey ? unwrapJsonHtml(body, cfg.jsonHtmlKey) : body;
    if (!markup) throw new Error(`HTML board ${listUrl}: no HTML under "${cfg.jsonHtmlKey}"`);
    const $ = cheerio.load(markup);
    const base = new URL(listUrl);

    $(cfg.item).each((_, el) => {
      const item = $(el);
      const linkEl = cfg.link ? item.find(cfg.link).first() : item.find("a[href]").first();
      const titleEl = cfg.title ? item.find(cfg.title).first() : linkEl;
      const href = linkEl.attr("href") || "";
      const title = clean(titleEl.text());
      if (!href || !title) return;

      let url: string;
      try {
        url = new URL(href, base).toString();
      } catch {
        return;
      }
      if (seen.has(url)) return;
      seen.add(url);

      const locText = cfg.location ? clean(item.find(cfg.location).first().text()) : "";
      const loc = locText ? parseLocation(locText) : { city: "", country: "Unknown" };
      const desc = cfg.desc ? htmlToText(item.find(cfg.desc).first().html() || "") : "";

      out.push({
        sourceJobId: url,
        title,
        company: cfg.company || base.hostname.replace(/^www\./, ""),
        city: loc.city,
        // Country-less boards are national; default so the Israel filter keeps them.
        country: loc.country === "Unknown" ? country : loc.country,
        description: desc,
        applyUrl: url,
        seniority: [],
      });
    });
  }

  // Optional enrichment from each job's own page (bounded, sequential, polite).
  if (cfg.detail && out.length) {
    const targets = out.slice(0, maxDetail);
    for (const p of targets) {
      try {
        const $d = cheerio.load(await getHtml(p.applyUrl));
        if (cfg.detail.desc) {
          const d = htmlToText($d(cfg.detail.desc).first().html() || "");
          if (d) p.description = d;
        }
        if (cfg.detail.location && !p.city) {
          const l = parseLocation(clean($d(cfg.detail.location).first().text()));
          if (l.city) p.city = l.city;
          if (l.country !== "Unknown") p.country = l.country;
        }
        await new Promise((r) => setTimeout(r, 250));
      } catch {
        /* keep the listing-level data */
      }
    }
  }

  return out;
};
