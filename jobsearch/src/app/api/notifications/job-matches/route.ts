import { NextRequest, NextResponse } from "next/server";
import { runJobMatchDigest } from "@/app/lib/notifications/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily "new jobs that match you" digest (cron, cron_secret). The Notifier
 * agent runs the same core after every catalog refresh; this route is the
 * standalone entry. `?dry=1` reports without notifying.
 */
export async function GET(req: NextRequest) {
  const secret = (req.nextUrl.searchParams.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  try {
    const r = await runJobMatchDigest({ dry });
    return NextResponse.json({ ok: true, ...r });
  } catch (err: any) {
    console.error("❌ job-matches digest error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "failed" }, { status: 500 });
  }
}
