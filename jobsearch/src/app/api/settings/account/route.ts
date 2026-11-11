import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { deleteAccount } from "@/app/lib/account/deleteAccount";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/settings/account { confirm: "DELETE" } — the person deletes their own account (lib/account/deleteAccount.ts). */
export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") return NextResponse.json({ error: 'Send { "confirm": "DELETE" }' }, { status: 400 });

  if (!(await deleteAccount(userId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: "token", value: "", path: "/", maxAge: 0 });
  return res;
}
