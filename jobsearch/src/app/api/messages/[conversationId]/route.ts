import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { readConversation, sendMessage, MessagingError } from "@/app/lib/messaging/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ conversationId: string }> };

const fail = (e: any) => {
  if (e instanceof MessagingError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("❌ messages:", e);
  return NextResponse.json({ error: "Failed" }, { status: 500 });
};

/** GET → the thread's messages (and marks them read for me). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const me = await getUserIdFromRequest(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conversationId } = await ctx.params;
  try {
    const { conversation, messages } = await readConversation(me, conversationId);
    return NextResponse.json({
      conversationId: String(conversation._id),
      participants: conversation.participants.map(String),
      messages: messages.map((m: any) => ({ _id: String(m._id), senderId: String(m.senderId), body: m.body, createdAt: m.createdAt, readAt: m.readAt ?? null })),
    });
  } catch (e) {
    return fail(e);
  }
}

/** POST { body } → send a message in the thread. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getUserIdFromRequest(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conversationId } = await ctx.params;
  const payload = await req.json().catch(() => ({}));
  try {
    const m: any = await sendMessage(me, conversationId, String(payload?.body ?? ""));
    return NextResponse.json({ ok: true, message: { _id: String(m._id), senderId: String(m.senderId), body: m.body, createdAt: m.createdAt } });
  } catch (e) {
    return fail(e);
  }
}
