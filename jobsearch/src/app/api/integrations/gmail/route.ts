import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import ApplicationEvent from "@/app/models/ApplicationEvent";
import { syncUserEmails } from "@/app/lib/email/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET — connection status + recent email-detected events for the dashboard. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectToDatabase();
  const user: any = await User.findById(userId).select("gmail").lean();
  const events = await ApplicationEvent.find({ userId, $or: [{ applied: true }, { status: { $ne: "" } }] }).sort({ emailDate: -1, createdAt: -1 }).limit(30).lean();
  return NextResponse.json({
    connected: !!user?.gmail?.connectedAt,
    address: user?.gmail?.address || "",
    lastSyncAt: user?.gmail?.lastSyncAt || null,
    lastError: user?.gmail?.lastError || "",
    configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.TOKEN_ENCRYPTION_KEY),
    events,
  });
}

/** POST — "sync now" for the signed-in user. */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await syncUserEmails(userId);
  if (result.error === "NOT_CONNECTED") return NextResponse.json({ error: "Gmail is not connected" }, { status: 400 });
  return NextResponse.json({ ok: !result.error, ...result });
}

/** DELETE — disconnect Gmail (forget the token; events are kept). */
export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectToDatabase();
  await User.updateOne({ _id: userId }, { $set: { "gmail.refreshTokenSealed": "", "gmail.address": "", "gmail.lastError": "" }, $unset: { "gmail.connectedAt": 1, "gmail.lastSyncAt": 1 } });
  return NextResponse.json({ ok: true });
}
