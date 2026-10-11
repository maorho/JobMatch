import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE } from "@/app/lib/cache";
import { requestReferral, referralsOverview } from "@/app/lib/referrals/insiders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → my requests (as a candidate) + my inbox (as an insider) + my insider profiles. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await referralsOverview(userId)) }, { headers: PRIVATE_CACHE });
}

/** POST { jobId, jobModel, referrerId?, message?, matchScore? } → ask an insider at the posting's company. */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const jobModel = body.jobModel === "Job" ? "Job" : "ExternalJobs";
  const r = await requestReferral(userId, { jobId: String(body.jobId || ""), jobModel, referrerId: body.referrerId ? String(body.referrerId) : undefined, message: typeof body.message === "string" ? body.message : "", matchScore: typeof body.matchScore === "number" ? body.matchScore : null });
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === "no_job" ? 404 : 409, headers: PRIVATE_CACHE });
}
