import { ListAdapter, NormalizedPosting, fetchJson, htmlToText, parseLocation } from "../types";

/**
 * Generic JSON list adapter: for careers sites whose page is fed by one public
 * JSON endpoint (a headless CMS such as Payload, a static export, a WordPress
 * REST route). Field paths are dotted ("data.jobs"); text fields may be plain
 * strings, HTML, or arrays of objects (rich-text blocks), which are flattened.
 *   identifier          = the JSON URL
 *   secondaryIdentifier = JSON config:
 *     {
 *       "items":       "docs",                       // path to the array ("" = the root is the array)
 *       "id":          "id",                         // posting id field
 *       "title":       "title",
 *       "location":    "location",                   // optional; "City, Country" or city only
 *       "country":     "Israel",                     // default when the location has no country
 *       "description": ["summary","about","requirements"],   // fields joined in order
 *       "link":        "https://x.com/careers#{slug}",      // URL template over the item's fields
 *       "postedAt":    "createdAt",                  // optional
 *       "company":     "Moveo",                      // optional label
 *       "status":      { "field": "_status", "value": "published" }   // optional keep-filter
 *     }
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type Cfg = { items?: string; id?: string; title?: string; location?: string; country?: string; description?: string[] | string; link?: string; postedAt?: string; company?: string; status?: { field: string; value: unknown } };

const get = (o: any, path: string): any => (!path ? o : path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o));

/** Rich-text blocks → text: strings as-is (HTML allowed), arrays/objects by their string leaves. */
function textOf(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return htmlToText(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join("\n");
  if (typeof v === "object") {
    const skip = new Set(["id", "_id", "blockType", "blockName"]);
    return Object.entries(v)
      .filter(([k]) => !skip.has(k))
      .map(([k, x]) => {
        const t = textOf(x);
        return k === "lead" || k === "heading" || k === "title" ? (t ? `${t}:` : "") : t;
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

const fill = (template: string, item: any) => template.replace(/\{([\w.]+)\}/g, (_, k) => encodeURIComponent(String(get(item, k) ?? "")));

export const jsonlist: ListAdapter = async (identifier, secondaryIdentifier) => {
  let cfg: Cfg = {};
  try {
    cfg = secondaryIdentifier ? JSON.parse(secondaryIdentifier) : {};
  } catch {
    throw new Error("jsonlist adapter: secondaryIdentifier must be JSON config");
  }
  if (!cfg.link) throw new Error("jsonlist adapter: config.link (URL template) is required");
  const { ok, status, data } = await fetchJson(identifier, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!ok) throw new Error(`JSON board ${identifier}: HTTP ${status}`);
  const items = get(data, cfg.items || "");
  if (!Array.isArray(items)) throw new Error(`JSON board ${identifier}: no array at "${cfg.items || "(root)"}"`);
  const descFields = Array.isArray(cfg.description) ? cfg.description : cfg.description ? [cfg.description] : [];
  const out: NormalizedPosting[] = [];
  for (const it of items) {
    if (cfg.status && get(it, cfg.status.field) !== cfg.status.value) continue;
    const id = get(it, cfg.id || "id");
    const title = String(get(it, cfg.title || "title") ?? "").trim();
    if (id == null || !title) continue;
    const locText = cfg.location ? String(get(it, cfg.location) ?? "").trim() : "";
    const loc = locText ? parseLocation(locText) : { city: "", country: "Unknown" };
    const postedRaw = cfg.postedAt ? get(it, cfg.postedAt) : undefined;
    const postedAt = postedRaw ? new Date(postedRaw) : undefined;
    out.push({
      sourceJobId: String(id),
      title,
      company: cfg.company || "",
      city: loc.city,
      country: loc.country === "Unknown" ? cfg.country || "Israel" : loc.country,
      description: descFields.map((f) => textOf(get(it, f))).filter(Boolean).join("\n\n"),
      applyUrl: fill(cfg.link, it),
      ...(postedAt && !isNaN(postedAt.getTime()) ? { postedAt } : {}),
      seniority: [],
    });
  }
  return out;
};
