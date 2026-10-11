import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE } from "@/app/lib/cache";
import { channelStatus, setChannelPrefs, unlinkChannel, deliverToChannels, type Channel } from "@/app/lib/messaging/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → linked channels, prefs, the link code and what is configured on this server. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await channelStatus(userId)) }, { headers: PRIVATE_CACHE });
}

/** POST { prefs } | { unlink: "whatsapp"|"telegram" } | { test: true } */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.unlink === "whatsapp" || body.unlink === "telegram") await unlinkChannel(userId, body.unlink as Channel);
  if (body.prefs && typeof body.prefs === "object") await setChannelPrefs(userId, { ...(typeof body.prefs.matches === "boolean" ? { matches: body.prefs.matches } : {}), ...(typeof body.prefs.updates === "boolean" ? { updates: body.prefs.updates } : {}) });
  let test: Record<string, boolean> | undefined;
  if (body.test) test = await deliverToChannels(userId, { kind: "updates", title: "JobMatch is connected ✅", body: "This is a test message. New matches and updates about your applications will arrive here.", link: "/Settings" });
  return NextResponse.json({ ok: true, test, ...(await channelStatus(userId)) }, { headers: PRIVATE_CACHE });
}
