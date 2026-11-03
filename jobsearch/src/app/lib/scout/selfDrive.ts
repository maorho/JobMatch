import { after } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import CompanySource from "@/app/models/CompanySource";
import Maintenance from "@/app/models/Maintenance";

/**
 * The catalogue keeps itself fresh without any external scheduler: when a
 * signed-in person opens the app and the newest source poll is older than
 * SCOUT_STALE_MIN, one scout chunk is kicked (a separate function call, so
 * the request that noticed it is not slowed), and every chunk kicks the next
 * one from its own `after()` until the whole catalogue is covered. A Mongo
 * lock ("scoutWalk") makes sure only one walk runs at a time and a dead walk
 * is taken over after WALK_STALE_MIN. The GitHub cron remains a second driver;
 * the lock keeps the two from overlapping. Off under test and when
 * SCOUT_SELF_DRIVE=0.
 */
export const SCOUT_STALE_MIN = Number(process.env.SCOUT_STALE_MIN || 30);
const WALK_STALE_MIN = 20; // no chunk heartbeat for this long → the walk died (function killed)
export const CHUNK_SOURCES = 10; // small chunks: each fits well inside a serverless function on any plan
export const CHUNK_BUDGET_SEC = 45;
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

/** True when the newest poll of any enabled source is older than SCOUT_STALE_MIN (or nothing was ever polled). */
export async function catalogueIsStale(): Promise<boolean> {
  await connectToDatabase();
  const enabled = await CompanySource.countDocuments({ enabled: true });
  if (!enabled) return false;
  const last: any = await CompanySource.findOne({ enabled: true, lastPolledAt: { $ne: null } }).sort({ lastPolledAt: -1 }).select("lastPolledAt").lean();
  return !last?.lastPolledAt || Date.now() - new Date(last.lastPolledAt).getTime() > SCOUT_STALE_MIN * 60_000;
}

/** Take the walk lock when nobody holds it (or the holder died). Returns the new walk id, or null. */
export async function claimWalk(): Promise<string | null> {
  await connectToDatabase();
  const walkId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const stale = new Date(Date.now() - WALK_STALE_MIN * 60_000);
  const doc: any = await Maintenance.findOneAndUpdate(
    { _id: LOCK_ID, $or: [{ running: { $ne: true } }, { running: true, updatedAt: { $lt: stale } }] },
    { $set: { running: true, lastRunAt: new Date(), walkId } },
    { upsert: true, new: true, strict: false }
  ).catch((e: any) => (e?.code === 11000 ? null : Promise.reject(e)));
  return doc && doc.get("walkId") === walkId ? walkId : null;
}

/** Each chunk calls this: is this walk still the live one? (Also a heartbeat, so a slow walk isn't taken over.) */
export async function heartbeat(walkId: string): Promise<boolean> {
  await connectToDatabase();
  const doc: any = await Maintenance.findOneAndUpdate({ _id: LOCK_ID, running: true, walkId }, { $set: { lastRunAt: new Date() } }, { new: true, strict: false });
  return !!doc;
}

export async function releaseWalk(walkId: string): Promise<void> {
  await connectToDatabase();
  await Maintenance.updateOne({ _id: LOCK_ID, walkId }, { $set: { running: false, lastRunAt: new Date() } }).catch(() => {});
}

/** Called after a response (from /api/auth/me): start a walk when the catalogue is stale and no walk is running. */
export async function kickScoutIfStale(): Promise<"started" | "fresh" | "busy" | "off"> {
  if (!selfDriveEnabled()) return "off";
  if (!(await catalogueIsStale())) return "fresh";
  const walkId = await claimWalk();
  if (!walkId) return "busy";
  console.log(`[scout] self-drive: catalogue older than ${SCOUT_STALE_MIN} min, starting walk ${walkId}`);
  await fire(chunkPath(walkId, 0, 1, new Date().toISOString()));
  return "started";
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
      await releaseWalk(walkId);
      // The cron's follow-up step: canonical locations for whatever was ingested.
      await fire("/api/scout/normalize-locations");
      return;
    }
    await fire(chunkPath(walkId, nextOffset, n + 1, since));
  };
  try {
    after(() => run().catch((e) => console.warn("[scout] self-drive chain broke:", (e as Error)?.message)));
  } catch {
    void run();
  }
}
