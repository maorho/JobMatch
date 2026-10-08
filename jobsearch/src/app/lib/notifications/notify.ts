import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import Notification, { type NotificationType } from "@/app/models/Notification";

export type NotifyPayload = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  meta?: Record<string, unknown>;
};

/** Same-site paths only; anything else is dropped so a link can't leave the app. */
const safeLink = (l?: string) => (l && l.startsWith("/") && !l.startsWith("//") ? l : "");

/**
 * Create a notification for a user. Best-effort: logs and returns null on
 * failure so a notification problem never breaks the action that caused it
 * (an application still gets submitted if the notification write fails).
 */
export async function notify(userId: string | mongoose.Types.ObjectId, payload: NotifyPayload) {
  try {
    if (!mongoose.isValidObjectId(userId)) return null;
    await connectToDatabase();
    return await Notification.create({
      userId,
      type: payload.type,
      title: payload.title.slice(0, 200),
      body: (payload.body || "").slice(0, 2000),
      link: safeLink(payload.link),
      meta: payload.meta,
    });
  } catch (err) {
    console.warn("[notify] failed:", (err as Error)?.message);
    return null;
  }
}

export async function notifyMany(userIds: (string | mongoose.Types.ObjectId)[], payload: NotifyPayload) {
  const unique = Array.from(new Set(userIds.map(String)));
  const results = await Promise.all(unique.map((id) => notify(id, payload)));
  return results.filter(Boolean).length;
}

/** Unread count for the bell. */
export async function unreadCount(userId: string): Promise<number> {
  await connectToDatabase();
  return Notification.countDocuments({ userId, read: false });
}
