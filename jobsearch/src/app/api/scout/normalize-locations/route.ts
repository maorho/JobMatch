import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import { resolveRawLocations, rawKey } from "@/app/lib/locations/resolveLocations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Location agent backfill. Collects every distinct (city, country) pair in
 * the catalog, resolves each once (cache → rules → LLM), and rewrites the
 * postings that carry it. Idempotent; safe to run after every scout.
 *   ?cron_secret=…  (required)
 *   ?llm=0          rules only (default: use the LLM for unresolved strings)
 *   ?dry=1          report what would change without writing
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const secret = (sp.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const useLLM = sp.get("llm") !== "0";
  const dry = sp.get("dry") === "1";
  // After a rules upgrade: recompute cached rules answers (LLM answers are kept).
  const recompute = sp.get("recompute") === "1";

  try {
    await connectToDatabase();
    // Pairs come from the ORIGINAL strings when we have them (rawLocation),
    // so re-running never normalizes an already-normalized value.
    // Every posting, ATS-managed or CSV/manual — all of them feed the facets.
    const pairs: { city: string; country: string; n: number }[] = await ExternalJobs.aggregate([
      { $group: { _id: { city: "$city", country: "$country", raw: "$rawLocation" }, n: { $sum: 1 } } },
      { $project: { _id: 0, city: "$_id.city", country: "$_id.country", raw: "$_id.raw", n: 1 } },
    ]);

    const inputs = pairs.map((p: any) => (p.raw ? { city: p.raw, country: "" } : { city: p.city || "", country: p.country || "" }));
    const resolved = await resolveRawLocations(inputs, { useLLM, ignoreRulesCache: recompute });

    let updatedDocs = 0;
    let changedPairs = 0;
    const bySource = { rules: 0, llm: 0, manual: 0 } as Record<string, number>;
    const unresolved: string[] = [];
    const ops: any[] = [];

    pairs.forEach((p: any, i: number) => {
      const key = rawKey(inputs[i]);
      const r = resolved.get(key);
      if (!r) return;
      bySource[r.source] = (bySource[r.source] || 0) + 1;
      if (!r.country && !r.remote) unresolved.push(key);
      // Trust the agent whenever it is at least medium-confident (that includes
      // "no city here" answers for area words); keep the old value only when
      // it genuinely couldn't tell.
      const city = r.confidence === "low" ? p.city || "" : r.city;
      const country = r.country || (r.remote ? "Remote" : r.confidence === "low" ? p.country || "Unknown" : "Unknown");
      const same = city === (p.city || "") && country === (p.country || "") && !!r.remote === false;
      if (same && p.raw) return;
      changedPairs++;
      ops.push({
        updateMany: {
          filter: { city: p.city || "", country: p.country || "", ...(p.raw ? { rawLocation: p.raw } : { rawLocation: { $in: ["", null] } }) },
          update: { $set: { city, country, remote: !!r.remote, rawLocation: p.raw || key } },
        },
      });
    });

    if (!dry && ops.length) {
      for (let i = 0; i < ops.length; i += 200) {
        const res = await ExternalJobs.bulkWrite(ops.slice(i, i + 200), { ordered: false });
        updatedDocs += res.modifiedCount ?? 0;
      }
    }

    return NextResponse.json({
      ok: true,
      dry,
      useLLM,
      pairs: pairs.length,
      changedPairs,
      updatedDocs,
      bySource,
      unresolved: unresolved.slice(0, 50),
      unresolvedCount: unresolved.length,
    });
  } catch (err: any) {
    console.error("❌ normalize-locations error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "failed" }, { status: 500 });
  }
}
