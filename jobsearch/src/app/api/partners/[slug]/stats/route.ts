import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/authGuard";
import { partnerBySlug, partnerForToken, partnerFunnel } from "@/app/lib/partners/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The cohort funnel for one partner: `?token=` (the partner's dashboard token) or an admin session. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const token = req.nextUrl.searchParams.get("token") || req.headers.get("x-partner-token") || "";
  const partner = (await partnerForToken(slug, token)) || ((await requireAdmin(req)) ? await partnerBySlug(slug) : null);
  if (!partner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const funnel = await partnerFunnel(partner.slug);
  return NextResponse.json({ ok: true, partner: { name: partner.name, slug: partner.slug, kind: partner.kind, cohort: partner.cohort, inviteCode: partner.inviteCode }, funnel });
}
