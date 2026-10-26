import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { loadCoachMemory, rebuildCoachMemory } from "@/app/lib/interview/coachMemory";
import { consumeQuota, quotaResponse } from "@/app/lib/ops/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the coach's memory of this candidate (progress across mock interviews); ?rebuild=1 recomputes. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rebuild = req.nextUrl.searchParams.get("rebuild") === "1";
  if (rebuild) {
    // A forced rebuild re-reads every session through the LLM: a few per day is plenty.
    try {
      await consumeQuota(userId, "progress_rebuild");
    } catch (e) {
      const q = quotaResponse(e);
      if (q) return q;
      throw e;
    }
  }
  const memory = rebuild ? await rebuildCoachMemory(userId) : (await loadCoachMemory(userId)) || (await rebuildCoachMemory(userId));
  return NextResponse.json({ ok: true, memory });
}
