import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE } from "@/app/lib/cache";
import { referralOpportunities } from "@/app/lib/contacts/opportunities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET → my ranked postings at companies where I know someone, with apply / outreach state. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await referralOpportunities(userId, { limit: Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "60", 10) || 60, 200) });
    return NextResponse.json({ ok: true, ...r }, { headers: PRIVATE_CACHE });
  } catch (err: any) {
    console.error("❌ opportunities:", err);
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}
