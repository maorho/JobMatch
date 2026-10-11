import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { captureInterviewQuestions, skipQuestions, questionBank } from "@/app/lib/outcomes/questions";
import { QUESTION_STAGES } from "@/app/models/InterviewQuestion";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import { connectToDatabase } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { applicationId?, company?, stage, text, shareable? } → structure and store
 * the questions the candidate was asked; { applicationId, stage, skip: true } → don't ask again.
 * GET ?company=&stage= → the bank for a company (signed-in users see everything, incl. their private rows).
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const stage = (QUESTION_STAGES as readonly string[]).includes(body.stage) ? body.stage : "other";
  const applicationId = typeof body.applicationId === "string" && body.applicationId ? body.applicationId : undefined;
  if (body.skip && applicationId) {
    await skipQuestions(userId, applicationId, stage);
    return NextResponse.json({ ok: true, skipped: true });
  }
  const text = String(body.text || "").trim();
  if (text.length < 5) return NextResponse.json({ error: "text is required" }, { status: 400 });
  let company = String(body.company || "").trim();
  let roleTitle = String(body.roleTitle || "").trim();
  if (applicationId) {
    await connectToDatabase();
    const row: any = await ApplicationOutcome.findOne({ applicationId, userId }).select("company title").lean();
    if (!row) return NextResponse.json({ error: "Application not found" }, { status: 404 });
    company = company || row.company;
    roleTitle = roleTitle || row.title;
  }
  if (!company) return NextResponse.json({ error: "company is required" }, { status: 400 });
  const r = await captureInterviewQuestions({ userId, applicationId, company, roleTitle, stage, text: text.slice(0, 6000), shareable: body.shareable !== false, language: body.language === "en" ? "en" : undefined });
  return NextResponse.json({ ok: true, created: r.created, questions: r.questions });
}

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  const sp = req.nextUrl.searchParams;
  const company = (sp.get("company") || "").trim();
  if (!company) return NextResponse.json({ error: "company is required" }, { status: 400 });
  const stage = sp.get("stage");
  const bank = await questionBank(company, { stage: stage && (QUESTION_STAGES as readonly string[]).includes(stage) ? (stage as any) : undefined, userId: userId || undefined, limit: userId ? 200 : 5 });
  return NextResponse.json({ ok: true, ...bank, gated: !userId });
}
