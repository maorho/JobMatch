import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { assertParticipant, MessagingError } from "@/app/lib/messaging/messaging";
import { signedMessageFileUrl } from "@/app/lib/messaging/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ conversationId: string }> };

/** GET ?key= → a short-lived URL for a file of this thread; only its two participants get one. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const me = await getUserIdFromRequest(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conversationId } = await ctx.params;
  const key = req.nextUrl.searchParams.get("key") || "";
  try {
    await assertParticipant(me, conversationId);
    const url = await signedMessageFileUrl(conversationId, key);
    if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  } catch (e: any) {
    if (e instanceof MessagingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("❌ message file:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
