import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { likelihoodStatus, trainLikelihood } from "@/app/lib/matcher/likelihood";
import { requireRecruiterOrAdmin } from "@/app/lib/authGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET → model status (any signed-in user); POST → retrain now (admin or cron secret). */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await likelihoodStatus()) });
}

export async function POST(req: NextRequest) {
  const secret = (req.nextUrl.searchParams.get("cron_secret") || req.headers.get("x-service-token") || "").trim();
  const expected = (process.env.CRON_SECRET || "").trim();
  const auth = expected && secret === expected ? { admin: true } : await requireRecruiterOrAdmin(req);
  if (!auth || !(auth as any).admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = await trainLikelihood();
  return NextResponse.json({ ok: true, ...report, status: await likelihoodStatus() });
}
