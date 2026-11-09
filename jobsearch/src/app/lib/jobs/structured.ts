import { EXPERIENCE_BUCKETS } from "@/app/lib/jobs/enrich";
import { JUNIOR_RE, INTERN_RE } from "@/app/lib/jobTaxonomy";

/** `?exp=0-2,3-5` → the known bucket keys. */
export function parseExperienceBuckets(values: string[]): string[] {
  const known = new Set(EXPERIENCE_BUCKETS.map((b) => b.key));
  return Array.from(new Set(values.filter((v) => known.has(v))));
}

/**
 * Mongo filter for the experience buckets, on the required minimum
 * (`experienceMin`). The 0-2 bucket also admits postings without a stated
 * number whose title says junior/intern, so a filter for beginners does not
 * hide "Junior Developer" postings that never wrote "0-2 years".
 */
export function experienceFilter(buckets: string[]): Record<string, unknown> {
  const parts: Record<string, unknown>[] = [];
  for (const key of buckets) {
    const b = EXPERIENCE_BUCKETS.find((x) => x.key === key);
    if (!b) continue;
    const range: Record<string, number> = { $gte: key === "5-10" ? 5 : key === "3-5" ? 3 : b.min };
    if (key === "0-2") range.$lte = 2;
    else if (key === "3-5") range.$lte = 4;
    else if (key === "5-10") range.$lte = 9;
    parts.push({ experienceMin: range });
    if (key === "0-2") parts.push({ experienceMin: null, $or: [{ job: JUNIOR_RE }, { job: INTERN_RE }, { seniority: JUNIOR_RE }] });
  }
  return parts.length ? { $or: parts } : {};
}

/** Mongo filter for technologies: the posting names at least one of them. */
export function techFilter(tech: string[]): Record<string, unknown> {
  const list = Array.from(new Set(tech.map((t) => t.trim()).filter(Boolean))).slice(0, 10);
  return list.length ? { tech: { $in: list } } : {};
}

/** The same rules on a loaded document (the ranked feed post-filters the recall pool). */
export function matchesStructured(doc: { experienceMin?: number | null; tech?: string[]; job?: string; seniority?: string[] | string }, opts: { experienceBuckets?: string[]; tech?: string[] }): boolean {
  if (opts.tech?.length) {
    const have = new Set(doc.tech || []);
    if (!opts.tech.some((t) => have.has(t))) return false;
  }
  if (opts.experienceBuckets?.length) {
    const min = doc.experienceMin;
    const ok = opts.experienceBuckets.some((key) => {
      if (min == null) return key === "0-2" && (JUNIOR_RE.test(doc.job || "") || INTERN_RE.test(doc.job || "") || JUNIOR_RE.test(Array.isArray(doc.seniority) ? doc.seniority.join(" ") : doc.seniority || ""));
      if (key === "0-2") return min <= 2;
      if (key === "3-5") return min >= 3 && min <= 4;
      if (key === "5-10") return min >= 5 && min <= 9;
      return min >= 10;
    });
    if (!ok) return false;
  }
  return true;
}
