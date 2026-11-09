import webpush from "web-push";
import { connectToDatabase } from "@/app/lib/db";
import PushSubscription from "@/app/models/PushSubscription";

/**
 * Web Push (VAPID): notifications on the person's own devices, no provider,
 * no cost. Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (and VAPID_SUBJECT, a
 * mailto:). The public key is also exposed as NEXT_PUBLIC_VAPID_PUBLIC_KEY
 * for the browser. A subscription that the push service reports gone
 * (404/410) is deleted; other failures are counted and the subscription
 * dropped after five in a row.
 */
export type PushPayload = { title: string; body?: string; url?: string; tag?: string };
export type PushSender = (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<void>;

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let sender: PushSender | null = null;
/** Tests inject a fake transport; null restores web-push. */
export function setPushSender(s: PushSender | null) {
  sender = s;
}

let vapidReady = false;
function realSender(): PushSender {
  if (!vapidReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:maorhomri1@gmail.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    vapidReady = true;
  }
  return async (sub, payload) => {
    await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 6 });
  };
}

const MAX_FAILURES = 5;

/** Send to every subscription of a person. Never throws; returns how many were delivered. */
export async function pushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!sender && !pushConfigured()) return { sent: 0, removed: 0 };
  const send = sender || realSender();
  await connectToDatabase();
  const subs: any[] = await PushSubscription.find({ userId }).lean();
  let sent = 0;
  let removed = 0;
  const body = JSON.stringify({ title: payload.title.slice(0, 120), body: (payload.body || "").slice(0, 300), url: payload.url || "/", tag: payload.tag });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await send({ endpoint: s.endpoint, keys: s.keys }, body);
        sent++;
        await PushSubscription.updateOne({ _id: s._id }, { $set: { lastUsedAt: new Date(), failures: 0 } }).catch(() => {});
      } catch (e: any) {
        const status = Number(e?.statusCode || e?.status || 0);
        if (status === 404 || status === 410 || (s.failures || 0) + 1 >= MAX_FAILURES) {
          await PushSubscription.deleteOne({ _id: s._id }).catch(() => {});
          removed++;
        } else {
          await PushSubscription.updateOne({ _id: s._id }, { $inc: { failures: 1 } }).catch(() => {});
        }
      }
    })
  );
  return { sent, removed };
}

/** Save (or refresh) a browser's subscription for this person. */
export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent = ""): Promise<void> {
  await connectToDatabase();
  await PushSubscription.updateOne({ endpoint: sub.endpoint }, { $set: { userId, keys: sub.keys, userAgent: userAgent.slice(0, 200), failures: 0 } }, { upsert: true });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<boolean> {
  await connectToDatabase();
  const r = await PushSubscription.deleteOne({ userId, endpoint });
  return (r.deletedCount || 0) > 0;
}

export async function hasSubscriptions(userId: string): Promise<number> {
  await connectToDatabase();
  return PushSubscription.countDocuments({ userId });
}
