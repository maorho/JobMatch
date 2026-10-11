import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/authGuard";
import { createPartner, listPartners } from "@/app/lib/partners/partners";
import { PARTNER_KINDS } from "@/app/models/Partner";
import { siteUrl } from "@/app/lib/seo/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin: GET → partners with their funnels; POST → create one (dashboard token returned once). */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partners = (await listPartners()).map((p) => ({ ...p, landingUrl: `${siteUrl()}/partners/${p.slug}`, signupUrl: `${siteUrl()}/SignUp?ref=${p.inviteCode}` }));
  return NextResponse.json({ ok: true, partners });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.name || typeof body.name !== "string") return NextResponse.json({ error: "name is required" }, { status: 400 });
  const kind = (PARTNER_KINDS as readonly string[]).includes(body.kind) ? body.kind : "bootcamp";
  const { partner, token } = await createPartner({ name: body.name, kind, blurb: body.blurb, website: body.website, contactEmail: body.contactEmail, cohort: body.cohort, slug: body.slug, createdBy: admin.id });
  return NextResponse.json({ ok: true, partner, token, landingUrl: `${siteUrl()}/partners/${partner.slug}`, signupUrl: `${siteUrl()}/SignUp?ref=${partner.inviteCode}`, dashboardUrl: `${siteUrl()}/partners/${partner.slug}/dashboard?token=${token}` });
}
