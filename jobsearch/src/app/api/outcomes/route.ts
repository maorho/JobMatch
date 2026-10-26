import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { duePrompts, recordOutcome, outcomeStats } from "@/app/lib/outcomes/outcomes";
import { OUTCOMES } from "@/app/models/ApplicationOutcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → what to ask the candidate now + their funnel; POST { applicationId, outcome, note? } → record an answer. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const due = await duePrompts(userId); // backfills missing rows first, so the stats below count them
  const stats = await outcomeStats(userId);
  return NextResponse.json({ ok: true, ...due, stats });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const applicationId = String(body.applicationId || "");
  const outcome = String(body.outcome || "");
  if (!applicationId || !(OUTCOMES as readonly string[]).includes(outcome)) return NextResponse.json({ error: "applicationId and a valid outcome are required" }, { status: 400 });
  const row = await recordOutcome({ userId, applicationId, outcome: outcome as any, source: "user", note: typeof body.note === "string" ? body.note.slice(0, 500) : "" });
  if (!row) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  return NextResponse.json({ ok: true, outcome: { id: String(row._id), outcome: row.outcome, reached: row.reached, firstResponseDays: row.firstResponseDays ?? null } });
}
