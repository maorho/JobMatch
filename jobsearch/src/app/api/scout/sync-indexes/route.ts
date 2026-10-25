import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
// Side-effect import: registers every model so mongoose.modelNames() is complete.
import "@/app/lib/allModels";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModelReport = { model: string; ok: true; indexes: string[] } | { model: string; ok: false; error: string };

/**
 * Maintenance: sync Mongo indexes to the current schema for EVERY model. Drops
 * stale indexes and builds new ones — autoIndex is off in production, so this
 * is the only place unique/TTL indexes (User email, Candidates pair, ...) get
 * built. One failing model (e.g. duplicates blocking a unique index) is
 * reported and doesn't stop the rest. Guarded by cron_secret.
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    await connectToDatabase();
  } catch (err: any) {
    console.error("❌ sync-indexes connect error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "connect failed" }, { status: 500 });
  }

  const report: ModelReport[] = [];
  for (const name of mongoose.modelNames()) {
    const m = mongoose.model(name);
    try {
      await m.syncIndexes();
      const indexes = (await m.collection.indexes()).map((i: any) => String(i.name));
      report.push({ model: name, ok: true, indexes });
    } catch (err: any) {
      console.error(`❌ sync-indexes ${name}:`, err);
      report.push({ model: name, ok: false, error: err?.message || String(err) });
    }
  }
  const failed = report.filter((r) => !r.ok).length;
  // 500 only when nothing worked (likely a DB-level problem); partial failures are in the report.
  const status = report.length > 0 && failed === report.length ? 500 : 200;
  return NextResponse.json({ ok: failed === 0, synced: report.length - failed, failed, models: report }, { status });
}
