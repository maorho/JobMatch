import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE } from "@/app/lib/cache";
import { attemptForUser } from "@/app/lib/practice/attempts";
import { checkSyntax } from "@/app/lib/practice/syntaxCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/practice/attempts/:id/check { answer } — does the answer compile?
 * Called before a coding submission so the candidate can go back and fix a
 * syntax error instead of being graded on one. Never changes the attempt.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const r = await attemptForUser(userId, id);
  if (!r?.task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const answer = String(body?.answer ?? "").slice(0, 60000);
  try {
    const report = await checkSyntax(r.task.language || "", answer);
    return NextResponse.json({ language: r.task.language || "", ...report }, { headers: PRIVATE_CACHE });
  } catch (err: any) {
    console.error("❌ practice check:", err);
    return NextResponse.json({ language: r.task.language || "", supported: false, ok: true, issues: [], checker: "error" }, { headers: PRIVATE_CACHE });
  }
}
