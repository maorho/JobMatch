import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { syncUserEmails } from "@/app/lib/email/track";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET ?cron_secret= — sync every connected mailbox (cron, every 2h). */
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  await connectToDatabase();
  const users: any[] = await User.find({ "gmail.connectedAt": { $exists: true } }).select("_id").limit(500).lean();
  const started = Date.now();
  const results: Record<string, unknown>[] = [];
  for (const u of users) {
    if (Date.now() - started > 240_000) break; // leave the rest for the next tick
    const r = await syncUserEmails(String(u._id));
    results.push({ userId: String(u._id), ...r });
  }
  return NextResponse.json({ ok: true, users: users.length, synced: results.length, updated: results.reduce((s, r: any) => s + (r.updated || 0), 0), errors: results.filter((r: any) => r.error).length });
}
