import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/authGuard";
import { readRun } from "@/app/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin: one run as a conversation. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { runId } = await params;
  const data = await readRun(runId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...data });
}
