import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { attachPartner, partnerByCode } from "@/app/lib/partners/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?code= → is this a valid invite (name only); POST { code } → attach the signed-in user. */
export async function GET(req: NextRequest) {
  const p = await partnerByCode(req.nextUrl.searchParams.get("code") || "");
  return NextResponse.json(p ? { ok: true, valid: true, name: p.name, kind: p.kind, slug: p.slug } : { ok: true, valid: false });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const r = await attachPartner(userId, String(body.code || ""));
  if (!r.ok) return NextResponse.json({ error: r.reason === "unknown_code" ? "קוד הזמנה לא מוכר" : "לא נמצא" }, { status: 404 });
  return NextResponse.json({ ok: true, partner: { name: r.partner.name, slug: r.partner.slug, kind: r.partner.kind }, already: r.reason === "already", hasOther: r.reason === "has_other" });
}
