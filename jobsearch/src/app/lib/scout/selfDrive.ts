import { after } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import CompanySource from "@/app/models/CompanySource";
import Maintenance from "@/app/models/Maintenance";

/**
 * The catalogue keeps itself fresh without depending on GitHub's schedules:
 * a kick (Google Cloud Scheduler every 30 min via /api/scout/kick, and every
 * signed-in visit via /api/auth/me) starts a walk when the last completed walk
 * is older than SCOUT_STALE_MIN. A walk is a chain of chunk calls: each chunk
 * runs as its own function invocation and fires the next one from `after()`.
 *
 * Vercel stops such a self-calling chain after a few hops (seen in production:
 * every walk died after four), so the chain is not trusted to finish. The lock
 * ("scoutWalk" in Maintenance) records where the walk is (offset, since, n);
 * a walk whose chunks stopped heartbeating for WALK_STALE_MIN is resumed from
 * that offset by the next kick, never restarted from zero. Freshness is judged
 * by the last *completed* walk, so a half-finished walk never looks fresh.
 * Off under test and when SCOUT_SELF_DRIVE=0.
 */
export const SCOUT_STALE_MIN = Number(process.env.SCOUT_STALE_MIN || 30);
const WALK_STALE_MIN = 5; // no chunk heartbeat for this long → the chain stopped (a chunk takes ~1-3 min)
export const CHUNK_SOURCES = 30; // few hops per walk: ~133 sources in 5 chunks
export const CHUNK_BUDGET_SEC = 180; // well inside the route's maxDuration (300 s)
export const MAX_CHUNKS = 120;
const LOCK_ID = "scoutWalk";

export const selfDriveEnabled = () =>
  process.env.SCOUT_SELF_DRIVE !== "0" && process.env.NODE_ENV !== "test" && !!process.env.CRON_SECRET && !!(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL);

const baseUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

/**
 * Fire a chunk as its own function invocation and return once the request
 * has been accepted (a cold function can take a few seconds to answer; we
 * wait up to 6 s for headers, never for the chunk to finish): the caller's
 * function may end right after, and a serverless function keeps running
 * after its client goes away.
 */
async function fire(path: string): Promise<void> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    await fetch(`${baseUrl()}${path}`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: ctrl.signal, cache: "no-store" });
  } catch (e: any) {
    if (e?.name !== "AbortError") console.warn("[scout] self-drive kick failed:", e?.message);
  } finally {
    clearTimeout(t);
  }
}

const chunkPath = (walkId: string, offset: number, n: number, since: string) =>
  `/api/scout/run?offset=${offset}&limit=${CHUNK_SOURCES}&budget=${CHUNK_BUDGET_SEC}&since=${encodeURIComponent(since)}&walk=${walkId}&n=${n}`;

/** True when the newest poll of any enabled source is older than `staleMin` (default SCOUT_STALE_MIN), or nothing was ever polled. */
export async function catalogueIsStale(staleMin = SCOUT_STALE_MIN): Promise<boolean> {
  await connectToDatabase();
  const enabled = await CompanySource.countDocuments({ enabled: true });
  if (!enabled) return false;
  const last: any = await CompanySource.findOne({ enabled: true, lastPolledAt: { $ne: null } }).sort({ lastPolledAt: -1 }).select("lastPolledAt").lean();
  return !last?.lastPolledAt || Date.now() - new Date(last.lastPolledAt).getTime() > staleMin * 60_000;
}

const newWalkId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Take the walk lock when nobody holds it (or the holder died). Returns the new walk id, or null. A claimed walk starts at offset 0. */
export async function claimWalk(): Promise<string | null> {
  await connectToDatabase();
  const walkId = newWalkId();
  const stale = new Date(Date.now() - WALK_STALE_MIN * 60_000);
  const now = new Date();
  const doc: any = await Maintenance.findOneAndUpdate(
    { _id: LOCK_ID, $or: [{ running: { $ne: true } }, { running: true, updatedAt: { $lt: stale } }] },
    { $set: { running: true, lastRunAt: now, walkId, offset: 0, n: 1, since: now.toISOString(), startedAt: now } },
    { upsert: true, new: true, strict: false }
  ).catch((e: any) => (e?.code === 11000 ? null : Promise.reject(e)));
  return doc && doc.get("walkId") === walkId ? walkId : null;
}

export type WalkPosition = { walkId: string; offset: number; n: number; since: string };

/**
 * A walk whose chain stopped (still "running", no heartbeat for WALK_STALE_MIN):
 * take it over under a new id and return where it was, so the caller continues
 * from there. Null when no walk is stuck.
 */
export async function resumeStalledWalk(): Promise<WalkPosition | null> {
  await connectToDatabase();
  const walkId = newWalkId();
  const stale = new Date(Date.now() - WALK_STALE_MIN * 60_000);
  const doc: any = await Maintenance.findOneAndUpdate(
    { _id: LOCK_ID, running: true, updatedAt: { $lt: stale } },
    { $set: { walkId, lastRunAt: new Date() } },
    { new: true, strict: false }
  ).lean();
  if (!doc) return null;
  return { walkId, offset: Number(doc.offset) || 0, n: Number(doc.n) || 1, since: doc.since || new Date().toISOString() };
}

/** Each chunk calls this: is this walk still the live one? (Also a heartbeat, so a slow walk isn't taken over.) */
export async function heartbeat(walkId: string): Promise<boolean> {
  await connectToDatabase();
  const doc: any = await Maintenance.findOneAndUpdate({ _id: LOCK_ID, running: true, walkId }, { $set: { lastRunAt: new Date() } }, { new: true, strict: false });
  return !!doc;
}

/** Record where the walk goes next, before firing that chunk: if the hop is lost, a resume starts here. */
export async function recordProgress(walkId: string, offset: number, n: number): Promise<void> {
  await connectToDatabase();
  await Maintenance.updateOne({ _id: LOCK_ID, running: true, walkId }, { $set: { offset, n, lastRunAt: new Date() } }, { strict: false }).catch(() => {});
}

/** Free the lock. `completed` marks a walk that covered the whole catalogue (what freshness is measured from). */
export async function releaseWalk(walkId: string, completed = false): Promise<void> {
  await connectToDatabase();
  const now = new Date();
  await Maintenance.updateOne({ _id: LOCK_ID, walkId }, { $set: { running: false, lastRunAt: now, ...(completed ? { completedAt: now } : {}) } }, { strict: false }).catch(() => {});
}

/** Is a new walk due? Measured from the last completed walk; before the first one, from the newest source poll. */
export async function walkDue(staleMin = SCOUT_STALE_MIN): Promise<boolean> {
  await connectToDatabase();
  const lock: any = await Maintenance.findById(LOCK_ID).lean();
  if (lock?.completedAt) {
    const enabled = await CompanySource.countDocuments({ enabled: true });
    return enabled > 0 && Date.now() - new Date(lock.completedAt).getTime() > staleMin * 60_000;
  }
  return catalogueIsStale(staleMin);
}

/**
 * Called after a response from /api/auth/me (traffic) and by /api/scout/kick
 * (the scheduler, which may pass a shorter `staleMin`): resume a walk whose
 * chain stopped, otherwise start one when the last completed walk is stale.
 */
export async function kickScoutIfStale(staleMin = SCOUT_STALE_MIN): Promise<"started" | "resumed" | "fresh" | "busy" | "off"> {
  if (!selfDriveEnabled()) return "off";
  const stalled = await resumeStalledWalk();
  if (stalled) {
    console.log(`[scout] self-drive: resuming walk at offset ${stalled.offset} (chunk ${stalled.n}) as ${stalled.walkId}`);
    await fire(chunkPath(stalled.walkId, stalled.offset, stalled.n, stalled.since));
    return "resumed";
  }
  const lock: any = await Maintenance.findById(LOCK_ID).lean();
  if (lock?.running) return "busy";
  if (!(await walkDue(staleMin))) return "fresh";
  const walkId = await claimWalk();
  if (!walkId) return "busy";
  console.log(`[scout] self-drive: last full walk older than ${staleMin} min, starting walk ${walkId}`);
  await fire(chunkPath(walkId, 0, 1, new Date().toISOString()));
  return "started";
}

/** Poll one company's source now, as its own function call (a source discovery just added). */
export async function pollCompanyNow(company: string): Promise<void> {
  if (!selfDriveEnabled()) return;
  await fire(`/api/scout/run?company=${encodeURIComponent(company)}&budget=60`);
}

/** Schedule the kick after the current response; never throws into the request. */
export function scheduleScoutKick(): void {
  if (!selfDriveEnabled()) return;
  const run = () => kickScoutIfStale().catch((e) => console.warn("[scout] self-drive skipped:", (e as Error)?.message));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Called by the scout route after a chunk: continue the walk, or close it. */
export function continueWalk(walkId: string, n: number, since: string, nextOffset: number | null): void {
  const run = async () => {
    if (nextOffset === null || n >= MAX_CHUNKS) {
      if (n >= MAX_CHUNKS && nextOffset !== null) console.warn(`[scout] self-drive: walk ${walkId} hit the ${MAX_CHUNKS}-chunk cap at offset ${nextOffset}`);
      await releaseWalk(walkId, nextOffset === null);
      // The cron's follow-up step: canonical locations for whatever was ingested.
      await fire("/api/scout/normalize-locations");
      return;
    }
    await recordProgress(walkId, nextOffset, n + 1);
    await fire(chunkPath(walkId, nextOffset, n + 1, since));
  };
  try {
    after(() => run().catch((e) => console.warn("[scout] self-drive chain broke:", (e as Error)?.message)));
  } catch {
    void run();
  }
}
