import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/authGuard";
import { connectToDatabase } from "@/app/lib/db";
import AgentRun from "@/app/models/AgentRun";
import AgentMessage from "@/app/models/AgentMessage";
import { listAgents, startFlow, processQueue, type MessageType } from "@/app/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Admin: the agent roster, recent runs and queue depth. */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectToDatabase();
  const [runs, queued, processing, failed] = await Promise.all([
    AgentRun.find().sort({ createdAt: -1 }).limit(30).lean(),
    AgentMessage.countDocuments({ status: "queued" }),
    AgentMessage.countDocuments({ status: "processing" }),
    AgentMessage.countDocuments({ status: "failed" }),
  ]);
  const agents = listAgents().map((a) => ({ name: a.name, title: a.title, description: a.description, handles: a.handles }));
  return NextResponse.json({ ok: true, agents, runs, queue: { queued, processing, failed } });
}

const STARTABLE: Record<string, { type: MessageType; payload: () => any; title: string; says: string }> = {
  "catalog.refresh": { type: "catalog.refresh", payload: () => ({ since: new Date().toISOString() }), title: "Catalog refresh", says: "Scout — time to poll every source." },
  "catalog.sweep": { type: "catalog.sweep", payload: () => ({}), title: "Stale-job sweep", says: "Janitor — anything unseen for two weeks goes." },
  "content.plan": { type: "content.plan", payload: () => ({ count: 1 }), title: "Write an article", says: "Writer — one new article, your pick of topic." },
  "digest": { type: "jobs.embedded", payload: () => ({ since: new Date().toISOString(), embedded: 0, remaining: 0 }), title: "Match digest", says: "Notifier — run the match digest now." },
};

/**
 * Admin: POST { flow } starts a conversation and works on it for a few
 * seconds so the page can show it moving; POST { drain: true } just drains.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  let runId: string | undefined;
  if (body?.flow) {
    const f = STARTABLE[String(body.flow)];
    if (!f) return NextResponse.json({ error: "Unknown flow" }, { status: 400 });
    runId = (await startFlow(f.type, f.payload(), { from: "admin", startedBy: `admin:${admin.id}`, title: f.title, says: f.says })).runId;
  } else if (!body?.drain) {
    return NextResponse.json({ error: "flow or drain required" }, { status: 400 });
  }
  const result = await processQueue({ budgetMs: 20_000, max: 50 });
  return NextResponse.json({ ok: true, runId, ...result });
}
