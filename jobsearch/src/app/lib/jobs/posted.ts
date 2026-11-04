/**
 * "Posted within" filter, shared by the filter UI, /api/jobs/search and the
 * personalised feed. A posting's date is the employer's `postedAt`; when the
 * ATS gave none, the moment the Scout first saw it (`firstSeenAt`), the same
 * rule the job card shows.
 */
export const POSTED_WINDOWS: { days: number; label: string }[] = [
  { days: 1, label: "Last 24 hours" },
  { days: 3, label: "Last 3 days" },
  { days: 7, label: "Last week" },
  { days: 14, label: "Last 2 weeks" },
  { days: 30, label: "Last month" },
];

/** `?posted=7` → 7; anything else → null (no filter). */
export function parsePostedDays(raw: string | null | undefined): number | null {
  const n = Number(raw);
  return POSTED_WINDOWS.some((w) => w.days === n) ? n : null;
}

/** Start of the window, on a 10-minute boundary: two clicks minutes apart ask for the same list, so the memo and the persisted ranking answer the second one. */
export const SINCE_BUCKET_MS = 10 * 60_000;
export const postedSince = (days: number, now = Date.now()) => new Date(Math.floor((now - days * 86_400_000) / SINCE_BUCKET_MS) * SINCE_BUCKET_MS);

/** Mongo filter for external postings: posted (or, without a date, first seen) at or after `since`. */
export function postedWithinFilter(since: Date): Record<string, unknown> {
  return { $or: [{ postedAt: { $gte: since } }, { postedAt: null, firstSeenAt: { $gte: since } }] };
}

/** The same rule on a loaded document (internal jobs only have createdAt). */
export function postedWithin(doc: { postedAt?: Date | string | null; firstSeenAt?: Date | string | null; createdAt?: Date | string | null }, since: Date): boolean {
  const d = doc.postedAt || doc.firstSeenAt || doc.createdAt;
  return !!d && new Date(d).getTime() >= since.getTime();
}
