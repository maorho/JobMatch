import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import OpsAlert from "@/app/models/OpsAlert";
import { notifyMany } from "@/app/lib/notifications/notify";
import { sendEmail } from "@/app/lib/email/send";
import { absolute } from "@/app/lib/seo/site";

/**
 * Operational alerts: an in-app notification to every admin (which also
 * reaches their WhatsApp/Telegram when linked) and, when ALERT_EMAIL (or
 * CONTACT_TO_EMAIL) is set, an email. Deduplicated per key for an hour so a
 * failing cron can't send sixty of them. The dedup lives in Mongo (OpsAlert)
 * because every warm lambda would otherwise send its own copy. Never throws.
 */
export const ALERT_DEDUP_MS = 60 * 60_000;

/** Claim the right to send `key` now: true when the last send is older than the window (or there was none). */
async function claimAlert(key: string, title: string): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - ALERT_DEDUP_MS);
  try {
    // Matches only a stale (or missing) row; a fresh one makes the upsert try
    // to insert a second `_id: key` → 11000 on the _id index → deduped.
    const r = await OpsAlert.findOneAndUpdate(
      { _id: key, $or: [{ lastSentAt: { $lt: cutoff } }, { lastSentAt: { $exists: false } }] },
      { $set: { lastSentAt: now, title } },
      { upsert: true, new: true }
    ).lean();
    return !!r;
  } catch (e: any) {
    if (e?.code !== 11000) throw e;
    // A collision on _id means a fresh row exists. Anything else is the legacy
    // `key_1` unique index (pre-_id rows) colliding until sync-indexes drops
    // it — fail open rather than silence alerts.
    const fresh = await OpsAlert.exists({ _id: key, lastSentAt: { $gte: cutoff } });
    return !fresh;
  }
}

export async function alertAdmins(key: string, title: string, body: string, link = "/AdminDashboard"): Promise<{ notified: number; emailed: boolean; deduped: boolean }> {
  try {
    await connectToDatabase();
    if (!(await claimAlert(key, title))) return { notified: 0, emailed: false, deduped: true };
    const admins: any[] = await User.find({ admin: true }).select("_id").limit(20).lean();
    const notified = await notifyMany(admins.map((a) => String(a._id)), { type: "system", title: `⚠️ ${title}`, body, link, meta: { alert: key } });
    const to = process.env.ALERT_EMAIL || process.env.CONTACT_TO_EMAIL;
    let emailed = false;
    if (to) {
      const r = await sendEmail({ to, subject: `[JobMatch alert] ${title}`, text: `${body}\n\n${absolute(link)}`, html: `<p style="font-family:Inter,Arial,sans-serif">${body.replace(/</g, "&lt;")}</p><p><a href="${absolute(link)}">${absolute(link)}</a></p>` });
      emailed = r.sent;
    }
    return { notified, emailed, deduped: false };
  } catch (e) {
    console.warn("[alerts] failed:", (e as Error)?.message);
    return { notified: 0, emailed: false, deduped: false };
  }
}

/** Tests: forget the dedup memory. */
export async function resetAlertDedup(): Promise<void> {
  await connectToDatabase();
  await OpsAlert.deleteMany({});
}
