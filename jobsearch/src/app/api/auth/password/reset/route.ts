import { NextRequest, NextResponse } from "next/server";
import { resetPassword } from "@/app/lib/auth/passwordReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/password/reset { token, password } — sets the new password when the token is valid and fresh. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const r = await resetPassword(String(body.token || ""), String(body.password || ""));
    if (!r.ok) {
      const status = r.error === "weak_password" ? 400 : 410;
      return NextResponse.json(r, { status, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("❌ password reset:", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
