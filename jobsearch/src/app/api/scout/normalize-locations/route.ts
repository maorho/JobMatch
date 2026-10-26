import { NextRequest, NextResponse } from "next/server";
import { normalizeCatalogLocations } from "@/app/lib/locations/normalizeCatalog";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Location agent backfill (the Locator agent runs the same core on the bus).
 *   ?cron_secret=…  (required)
 *   ?llm=0          rules only (default: use the LLM for unresolved strings)
 *   ?dry=1          report what would change without writing
 *   ?recompute=1    after a rules upgrade: recompute cached rules answers
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const denied = requireCron(req);
  if (denied) return denied;
  const useLLM = sp.get("llm") !== "0";
  const dry = sp.get("dry") === "1";
  const recompute = sp.get("recompute") === "1";

  try {
    const r = await normalizeCatalogLocations({ useLLM, dry, recompute });
    return NextResponse.json({ ok: true, dry, useLLM, ...r });
  } catch (err: any) {
    console.error("❌ normalize-locations error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "failed" }, { status: 500 });
  }
}
