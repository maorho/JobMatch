import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE } from "@/app/lib/cache";
import { setSignal, signalsFor, savedJobs } from "@/app/lib/jobs/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { saved: ids, dismissed: ids }; GET ?list=saved → the saved postings with details. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (req.nextUrl.searchParams.get("list") === "saved") return NextResponse.json({ ok: true, jobs: await savedJobs(userId) }, { headers: PRIVATE_CACHE });
  return NextResponse.json({ ok: true, ...(await signalsFor(userId)) }, { headers: PRIVATE_CACHE });
}

/** POST { jobId, jobModel?, kind: "saved"|"dismissed", on: boolean, matchScore? } */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.kind !== "saved" && body.kind !== "dismissed") return NextResponse.json({ error: "bad kind" }, { status: 400 });
  const r = await setSignal(userId, { jobId: String(body.jobId || ""), jobModel: body.jobModel === "Job" ? "Job" : "ExternalJobs", kind: body.kind, on: body.on !== false, matchScore: typeof body.matchScore === "number" ? body.matchScore : null });
  return NextResponse.json({ ok: true, ...r }, { headers: PRIVATE_CACHE });
}
