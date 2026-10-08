import { NextRequest, NextResponse } from "next/server";
import { startFlow, processQueue } from "@/app/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FLOWS = ["catalog.refresh", "catalog.sweep"] as const;

/**
 * The agents' heartbeat (cron, cron_secret). Drains the bus for up to
 * `budget` seconds. `?flow=catalog.refresh` (or catalog.sweep) also opens
 * that conversation first — this is the one cron entry for the whole
 * scout → locator → matcher → notifier chain.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const secret = (sp.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const flow = sp.get("flow") as (typeof FLOWS)[number] | null;
  const budgetMs = Math.min((parseInt(sp.get("budget") ?? "", 10) || 240) * 1000, 240_000);

  try {
    let runId: string | undefined;
    if (flow === "catalog.refresh") {
      runId = (await startFlow("catalog.refresh", { since: new Date().toISOString() }, { from: "cron", startedBy: "cron", title: "Catalog refresh", says: "Scout — time to poll every source." })).runId;
    } else if (flow === "catalog.sweep") {
      runId = (await startFlow("catalog.sweep", {}, { from: "cron", startedBy: "cron", title: "Stale-job sweep", says: "Janitor — anything unseen for two weeks goes." })).runId;
    } else if (flow) {
      return NextResponse.json({ error: `Unknown flow "${flow}"` }, { status: 400 });
    }
    const result = await processQueue({ budgetMs });
    return NextResponse.json({ ok: true, runId, ...result });
  } catch (err: any) {
    console.error("❌ agents tick:", err);
    return NextResponse.json({ ok: false, error: err?.message || "tick failed" }, { status: 500 });
  }
}
