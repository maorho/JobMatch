import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE } from "@/app/lib/cache";
import { respondToRequest, withdrawRequest, type RespondAction } from "@/app/lib/referrals/insiders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH { action: "accept"|"decline"|"submitted", note? } (insider) or { action: "withdraw" } (candidate). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action === "withdraw") {
    const ok = await withdrawRequest(userId, id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: PRIVATE_CACHE });
  }
  if (!["accept", "decline", "submitted"].includes(body.action)) return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  const r = await respondToRequest(userId, id, body.action as RespondAction, typeof body.note === "string" ? body.note : "");
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === "not_found" ? 404 : 409, headers: PRIVATE_CACHE });
}
