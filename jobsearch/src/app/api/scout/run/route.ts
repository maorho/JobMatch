import { NextRequest, NextResponse } from "next/server";
import { runScout } from "@/app/lib/scout/runScout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scout run endpoint. Protected by cron_secret, like the existing
 * external-jobs cron routes. Query params:
 *   ?cron_secret=...   (required)
 *   ?dry=1             fetch + diff, do not write
 *   ?company=Name      limit to one company source
 */
export async function GET(req: NextRequest) {
  const secret = (req.nextUrl.searchParams.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const company = req.nextUrl.searchParams.get("company") || undefined;

  try {
    const result = await runScout({ dry, company });
    return NextResponse.json({ ok: true, dry, ...result });
  } catch (err: any) {
    console.error("❌ Scout run error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Scout run failed" },
      { status: 500 }
    );
  }
}
