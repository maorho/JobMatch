import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import AutoApplication from "@/app/models/AutoApplication";
import { startFlow, kick } from "@/app/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  enabled: z.boolean(),
  minScore: z.number().int().min(50).max(100).default(75),
  dailyCap: z.number().int().min(1).max(30).default(5),
});

async function snapshot(userId: string) {
  const u: any = await User.findById(userId).select("autoApply resumeUpdatedAt").lean();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [today, total, needsUser] = await Promise.all([
    AutoApplication.countDocuments({ userId, status: "submitted", createdAt: { $gte: start } }),
    AutoApplication.countDocuments({ userId, status: "submitted" }),
    AutoApplication.countDocuments({ userId, status: "needs_user" }),
  ]);
  return {
    enabled: !!u?.autoApply?.enabled,
    minScore: u?.autoApply?.minScore ?? 75,
    dailyCap: u?.autoApply?.dailyCap ?? 5,
    enabledAt: u?.autoApply?.enabledAt ?? null,
    hasResume: !!u?.resumeUpdatedAt,
    applierConfigured: !!(process.env.PUPPETEER_SERVER_URL || process.env.NODE_ENV !== "production"),
    stats: { today, total, needsUser },
  };
}

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectToDatabase();
  return NextResponse.json({ ok: true, ...(await snapshot(userId)) });
}

/** PUT { enabled, minScore, dailyCap }. Turning it on wakes the Matcher → Applier right away. */
export async function PUT(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings", issues: parsed.error.issues }, { status: 400 });
  await connectToDatabase();
  const before: any = await User.findById(userId).select("autoApply").lean();
  const wasOn = !!before?.autoApply?.enabled;
  await User.updateOne(
    { _id: userId },
    { $set: { "autoApply.enabled": parsed.data.enabled, "autoApply.minScore": parsed.data.minScore, "autoApply.dailyCap": parsed.data.dailyCap, ...(parsed.data.enabled && !wasOn ? { "autoApply.enabledAt": new Date() } : {}) } }
  );
  let runId: string | undefined;
  if (parsed.data.enabled && !wasOn) {
    runId = (await startFlow("resume.updated", { userId }, { from: "user", startedBy: `user:${userId}`, title: "Auto-apply switched on", says: "Auto-apply is on. Matcher — what clears the bar right now?" })).runId;
    kick();
  }
  return NextResponse.json({ ok: true, runId, ...(await snapshot(userId)) });
}
