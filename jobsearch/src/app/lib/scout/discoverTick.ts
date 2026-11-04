import { connectToDatabase } from "@/app/lib/db";
import Maintenance from "@/app/models/Maintenance";
import DiscoveryCandidate from "@/app/models/DiscoveryCandidate";
import { discoverCompanies, type DiscoverResult } from "@/app/lib/scout/discover";
import { pollCompanyNow } from "@/app/lib/scout/selfDrive";

/**
 * The company pool grows on every scheduler tick, not once a night: the
 * nightly GitHub job that used to drive discovery fired a handful of times a
 * month (12 candidates probed out of 463 collected). Each /api/scout/kick now
 * also probes a small batch of pending candidates; probing is plain HTTP to
 * the ATS APIs and costs nothing. The web search that collects *new* names
 * uses a model with web search, so it runs at most once a day and only when
 * the backlog is short. Companies found here are polled right away.
 */
export const DISCOVER_BATCH = 15;
export const SEARCH_EVERY_MS = 24 * 3600_000;
export const SEARCH_WHEN_PENDING_BELOW = 50;
const RUN_STALE_MS = 10 * 60_000;
const LOCK_ID = "discoverTick";

export const discoveryTickEnabled = () => process.env.SCOUT_DISCOVERY !== "0" && (process.env.NODE_ENV !== "test" || process.env.DISCOVERY_IN_TESTS === "1");

/** Take the lock (one tick at a time; a dead one is taken over after 10 minutes). Returns the lock doc or null. */
async function claim(): Promise<any | null> {
  const stale = new Date(Date.now() - RUN_STALE_MS);
  return Maintenance.findOneAndUpdate(
    { _id: LOCK_ID, $or: [{ running: { $ne: true } }, { running: true, lastRunAt: { $lt: stale } }] },
    { $set: { running: true, lastRunAt: new Date() } },
    { upsert: true, new: false, strict: false }
  )
    .lean()
    .then((prev) => prev ?? {}) // first ever run: no previous doc, but the upsert took the lock
    .catch((e: any) => (e?.code === 11000 ? null : Promise.reject(e)));
}

export type DiscoverTickResult = { ran: false; reason: string } | { ran: true; searched: boolean; result: DiscoverResult };

/** One discovery batch. `deadline` is an absolute ms timestamp the batch must end before. */
export async function runDiscoveryTick(opts: { deadline: number; batch?: number; poll?: (company: string) => Promise<void> }): Promise<DiscoverTickResult> {
  if (!discoveryTickEnabled()) return { ran: false, reason: "off" };
  await connectToDatabase();
  const prev = await claim();
  if (prev === null) return { ran: false, reason: "busy" };
  try {
    const pending = await DiscoveryCandidate.countDocuments({ status: "pending", attempts: { $lt: 3 } });
    const lastSearch = prev.lastSearchAt ? new Date(prev.lastSearchAt).getTime() : 0;
    const searched = pending < SEARCH_WHEN_PENDING_BELOW && Date.now() - lastSearch > SEARCH_EVERY_MS;
    const result = await discoverCompanies({ limit: opts.batch ?? DISCOVER_BATCH, search: searched, deadline: opts.deadline });
    const poll = opts.poll ?? pollCompanyNow;
    for (const f of result.found) await poll(f.name).catch(() => {});
    if (result.probed || searched) {
      const c = result.collected;
      console.log(`[discover] probed ${result.probed}: ${result.found.length} new source(s)${result.found.length ? ` (${result.found.map((f) => f.name).join(", ")})` : ""}; ${c.contacts + c.insiders + c.search} new names${searched ? ` incl. search "${c.topic || ""}"` : ""}; ${result.pending} pending`);
    }
    await Maintenance.updateOne({ _id: LOCK_ID }, { $set: { running: false, lastRunAt: new Date(), ...(searched ? { lastSearchAt: new Date() } : {}), lastResult: { probed: result.probed, found: result.found.length, pending: result.pending } } }, { strict: false });
    return { ran: true, searched, result };
  } catch (e) {
    await Maintenance.updateOne({ _id: LOCK_ID }, { $set: { running: false, lastError: (e as Error)?.message?.slice(0, 300) } }, { strict: false }).catch(() => {});
    throw e;
  }
}
