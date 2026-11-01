import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { readConversation, sendMessage, assertParticipant, MessagingError } from "@/app/lib/messaging/messaging";
import { filesFromForm, storeMessageFile, s3Configured, AttachmentError, type MessageAttachment } from "@/app/lib/messaging/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ conversationId: string }> };

const fail = (e: any) => {
  if (e instanceof MessagingError || e instanceof AttachmentError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("❌ messages:", e);
  return NextResponse.json({ error: "Failed" }, { status: 500 });
};

/** A message as the page shows it; files are reached through this thread's files endpoint, which signs a URL per request. */
const shape = (conversationId: string, m: any) => ({
  _id: String(m._id),
  senderId: String(m.senderId),
  body: m.body || "",
  attachments: (m.attachments || []).map((a: MessageAttachment) => ({ name: a.name, size: a.size, mime: a.mime, url: `/api/messages/${conversationId}/files?key=${encodeURIComponent(a.key)}` })),
  createdAt: m.createdAt,
  readAt: m.readAt ?? null,
});

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
      filesEnabled: s3Configured() || process.env.NODE_ENV === "test",
      messages: messages.map((m: any) => shape(conversationId, m)),
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * POST → send a message in the thread.
 *   JSON      { body }
 *   multipart body=<text> files=<file>… (up to 3, 10 MB each; PDF, Office, text, images, zip)
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getUserIdFromRequest(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conversationId } = await ctx.params;
  try {
    let body = "";
    const attachments: MessageAttachment[] = [];
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      body = String(form.get("body") ?? "");
      const files = await filesFromForm(form);
      if (files.length) {
        if (!s3Configured() && process.env.NODE_ENV !== "test") return NextResponse.json({ error: "שליחת קבצים אינה מוגדרת בשרת הזה" }, { status: 503 });
        await assertParticipant(me, conversationId); // never store a byte for a thread that isn't mine
        for (const f of files) attachments.push(await storeMessageFile(conversationId, f));
      }
    } else {
      const payload = await req.json().catch(() => ({}));
      body = String(payload?.body ?? "");
    }
    const m: any = await sendMessage(me, conversationId, body, attachments);
    return NextResponse.json({ ok: true, message: shape(conversationId, m) });
  } catch (e) {
    return fail(e);
  }
}
