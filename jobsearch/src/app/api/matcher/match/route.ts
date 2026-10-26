import { NextRequest, NextResponse } from "next/server";
import { matchByText, matchByUser } from "@/app/lib/matcher/matchCandidate";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampLimit(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(100, Math.round(n)));
}

/**
 * Return jobs ranked by match to the signed-in candidate. Requires auth.
 * Body: { text?, resumeText?, limit?, minScore? }.
 * The match is always for the authenticated user (no client-supplied userId),
 * except the `text` path used by the ResumeAI flow before a profile is saved.
 */
export async function POST(req: NextRequest) {
  try {
    const authedId = await getUserIdFromRequest(req);
    if (!authedId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = clampLimit(body.limit);
    const minScore = Math.max(0, Math.min(100, Number(body.minScore) || 0));

    // Raw text path (ResumeAI, before a profile exists) — still auth-gated.
    if (body.text && String(body.text).trim()) {
      const matches = await matchByText(String(body.text), { limit, minScore });
      return NextResponse.json({ ok: true, count: matches.length, matches });
    }

    // Profile-based match is always for the authenticated user (no IDOR).
    const { matches } = await matchByUser(authedId, body.resumeText, {
      limit,
      minScore,
    });
    return NextResponse.json({ ok: true, count: matches.length, matches });
  } catch (err: any) {
    console.error("❌ match error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "match failed" },
      { status: 500 }
    );
  }
}
