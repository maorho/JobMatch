import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { listConversations, openConversation, MessagingError } from "@/app/lib/messaging/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/messages → my conversations + unread total. */
export async function GET(req: NextRequest) {
  const me = await getUserIdFromRequest(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rawLimit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
  const data = await listConversations(me, limit);
  return NextResponse.json(data);
}

/** POST /api/messages { userId, jobId } → get-or-create a thread (policy-checked). */
export async function POST(req: NextRequest) {
  const me = await getUserIdFromRequest(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const convo = await openConversation(me, String(body?.userId || ""), String(body?.jobId || ""));
    return NextResponse.json({ conversationId: String(convo._id) });
  } catch (e: any) {
    if (e instanceof MessagingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("❌ open conversation:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
