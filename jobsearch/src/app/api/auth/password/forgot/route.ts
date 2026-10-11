import { NextRequest, NextResponse } from "next/server";
import { requestPasswordReset } from "@/app/lib/auth/passwordReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/password/forgot { email } — always 200; mails a reset link when the account exists. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const r = await requestPasswordReset(String(body.email || ""));
    return NextResponse.json(r, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("❌ password forgot:", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
