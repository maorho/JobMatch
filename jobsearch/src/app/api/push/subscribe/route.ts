import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { saveSubscription, removeSubscription, hasSubscriptions, pushConfigured, pushToUser } from "@/app/lib/push/webpush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validSub = (s: any) => s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";

/** GET — is push configured on the server, and does this person have a device registered? */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ configured: pushConfigured(), publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "", devices: await hasSubscriptions(userId) });
}

/** POST { subscription } — register this browser; sends a short confirmation push. */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const sub = body?.subscription;
  if (!validSub(sub)) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  await saveSubscription(userId, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, req.headers.get("user-agent") || "");
  if (body?.confirm !== false) await pushToUser(userId, { title: "JobMatch", body: "ההתראות פועלות. נעדכן כאן על משרות חדשות שמתאימות לך.", url: "/", tag: "welcome" });
  return NextResponse.json({ ok: true, devices: await hasSubscriptions(userId) });
}

/** DELETE { endpoint } — unregister this browser. */
export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  const removed = await removeSubscription(userId, body.endpoint);
  return NextResponse.json({ ok: true, removed, devices: await hasSubscriptions(userId) });
}
