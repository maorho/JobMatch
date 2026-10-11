import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { notifyMany } from "@/app/lib/notifications/notify";
import { sendEmail } from "@/app/lib/email/send";
import { absolute } from "@/app/lib/seo/site";

/**
 * Operational alerts: an in-app notification to every admin (which also
 * reaches their WhatsApp/Telegram when linked) and, when ALERT_EMAIL (or
 * CONTACT_TO_EMAIL) is set, an email. Deduplicated per key for an hour so a
 * failing cron can't send sixty of them. Never throws.
 */
const recent = new Map<string, number>();
export const ALERT_DEDUP_MS = 60 * 60_000;

export async function alertAdmins(key: string, title: string, body: string, link = "/AdminDashboard"): Promise<{ notified: number; emailed: boolean; deduped: boolean }> {
  try {
    const last = recent.get(key) || 0;
    if (Date.now() - last < ALERT_DEDUP_MS) return { notified: 0, emailed: false, deduped: true };
    recent.set(key, Date.now());
    await connectToDatabase();
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
export function resetAlertDedup() {
  recent.clear();
}
