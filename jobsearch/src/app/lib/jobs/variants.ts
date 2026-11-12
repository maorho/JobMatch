import { titleKey } from "./enrich";

/**
 * The same role listed once per location ("AI Operations Lead" in 21
 * countries, "Verification Engineer" in Yokneam and Tel Aviv) is one job to
 * the person reading the feed. Lists show it once — the first row in the
 * list's own order is the representative — and carry the other locations
 * as `variants`, so the card can offer a location picker and the job page
 * can link to its siblings. Grouping key: company + the posting's titleKey
 * (lib/jobs/enrich.ts; the scout stores it on every posting).
 */
export type Variant = { _id: string; city?: string; country?: string; remote?: boolean };

export type Groupable = { _id: unknown; company?: string; titleKey?: string; job?: string; city?: string; country?: string; remote?: boolean };

export const groupKeyOf = (r: Groupable): string => `${(r.company || "").trim().toLowerCase()}|${r.titleKey || titleKey(r.job || "") || String(r._id)}`;

export const variantOf = (r: Groupable): Variant => ({ _id: String(r._id), ...(r.city ? { city: r.city } : {}), ...(r.country ? { country: r.country } : {}), ...(r.remote ? { remote: true } : {}) });

/**
 * Collapse rows that share a group key, keeping the list's order. A row that
 * stands alone comes back untouched; a representative of several carries
 * `variants` (itself first).
 */
export function groupVariants<T extends Groupable>(rows: T[]): (T & { variants?: Variant[] })[] {
  const byKey = new Map<string, T & { variants?: Variant[] }>();
  const out: (T & { variants?: Variant[] })[] = [];
  for (const r of rows) {
    const key = groupKeyOf(r);
    const head = byKey.get(key);
    if (!head) {
      const rep = { ...r };
      byKey.set(key, rep);
      out.push(rep);
      continue;
    }
    if (!head.variants) head.variants = [variantOf(head)];
    head.variants.push(variantOf(r));
  }
  return out;
}

/** How the card names one location. */
export function variantLabel(v: Variant): string {
  const place = [v.city, v.country].filter((x) => x && x !== "Unknown").join(", ");
  return place ? `${place}${v.remote && v.city ? " · Remote" : ""}` : v.remote ? "Remote" : "";
}
