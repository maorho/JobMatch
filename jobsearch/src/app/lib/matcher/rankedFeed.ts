import { after } from "next/server";
import { gzipSync, gunzipSync } from "node:zlib";
import { connectToDatabase } from "@/app/lib/db";
import RankedFeed from "@/app/models/RankedFeed";
import type { RankedJob } from "./hybrid";

/** A persisted feed is served for this long; the catalog refreshes every 30 min anyway. */
export const FEED_TTL_MS = 15 * 60_000;
/** A warm-up claim older than this is considered dead (function killed) and may be retaken. */
const WARM_LOCK_MS = 3 * 60_000;
/** Off under test, like the route memo: suites write fixtures and expect the next rank to see them. */
const feedTtlMs = () => (process.env.NODE_ENV === "test" && !process.env.FEED_PERSIST_IN_TESTS ? 0 : FEED_TTL_MS);
const freshSince = () => new Date(Date.now() - feedTtlMs());

/** The persisted list for a cache key, if it is still fresh. */
export async function loadRankedFeed(userId: string, key: string): Promise<RankedJob[] | null> {
  await connectToDatabase();
  const doc: any = await RankedFeed.findOne({ userId, key, computedAt: { $gt: freshSince() } }).select("blob").lean();
  if (!doc?.blob) return null;
  const raw = Buffer.isBuffer(doc.blob) ? doc.blob : Buffer.from(doc.blob.buffer ?? doc.blob);
  return JSON.parse(gunzipSync(raw).toString("utf8")) as RankedJob[];
}

export async function saveRankedFeed(userId: string, key: string, jobs: RankedJob[], isDefault: boolean): Promise<void> {
  await connectToDatabase();
  const blob = gzipSync(Buffer.from(JSON.stringify(jobs), "utf8"));
  await RankedFeed.updateOne({ userId, key }, { $set: { blob, count: jobs.length, isDefault, computedAt: new Date() }, $unset: { warmingAt: 1 } }, { upsert: true });
  // One default list per person: an older résumé/profile version is dead weight and would fool the warm-up's freshness check.
  if (isDefault) await RankedFeed.deleteMany({ userId, isDefault: true, key: { $ne: key } });
}

/** Drop every persisted list of a person (a signal, a search-profile change). The in-process memo is cleared by the caller. */
export async function invalidateRankedFeed(userId: string): Promise<void> {
  await connectToDatabase();
  await RankedFeed.deleteMany({ userId });
}

/**
 * Compute the default feed now if no fresh copy exists. Safe to call often:
 * one indexed read when there is nothing to do, and a lock so several
 * instances don't rank the same person at once.
 */
export async function warmFeedForUser(userId: string): Promise<"fresh" | "warming-elsewhere" | "computed" | "no-profile"> {
  await connectToDatabase();
  const now = Date.now();
  const fresh = await RankedFeed.exists({ userId, isDefault: true, computedAt: { $gt: freshSince() } });
  if (fresh) return "fresh";
  // Claim: the person's default row when nobody holds a live lock on it; a placeholder row when there is none.
  const placeholderKey = `warming:${userId}`;
  const claim: any = await RankedFeed.findOneAndUpdate(
    { userId, isDefault: true, $or: [{ warmingAt: { $exists: false } }, { warmingAt: { $lt: new Date(now - WARM_LOCK_MS) } }] },
    { $set: { warmingAt: new Date(now) }, $setOnInsert: { key: placeholderKey, count: 0, computedAt: new Date(0) } },
    { upsert: true, new: true }
  ).catch((e: any) => (e?.code === 11000 ? null : Promise.reject(e)));
  if (!claim) return "warming-elsewhere";
  try {
    const { rankForUser } = await import("./hybrid"); // lazy: hybrid imports this module
    const r = await rankForUser(userId, { limit: 48, skip: 0 }); // exactly what the jobs page asks for first
    return r.profile?.vector ? "computed" : "no-profile";
  } finally {
    // The real row was written by rankJobs (which also clears the lock); only the placeholder is left to remove.
    if (claim.key === placeholderKey) await RankedFeed.deleteOne({ _id: claim._id }).catch(() => {});
    else await RankedFeed.updateOne({ _id: claim._id }, { $unset: { warmingAt: 1 } }).catch(() => {});
  }
}

/**
 * Schedule a warm-up after the current response is sent (sign-in, app open).
 * Never blocks the response; never runs under test unless asked.
 */
export function scheduleFeedWarm(userId: string): void {
  if (process.env.NODE_ENV === "test" && !process.env.FEED_WARM_IN_TESTS) return;
  const run = () => warmFeedForUser(userId).catch((e) => console.warn("[feed] warm-up skipped:", (e as Error)?.message));
  try {
    after(run);
  } catch {
    void run(); // outside a request scope (scripts, tests)
  }
}
