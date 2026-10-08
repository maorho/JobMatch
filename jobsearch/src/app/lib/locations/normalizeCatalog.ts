import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import { resolveRawLocations, rawKey } from "./resolveLocations";

export type NormalizeCatalogResult = {
  pairs: number;
  changedPairs: number;
  updatedDocs: number;
  bySource: Record<string, number>;
  unresolved: string[];
  unresolvedCount: number;
};

/**
 * Location agent core. Collects every distinct (city, country, rawLocation)
 * in the catalog, resolves each once (cache → rules → LLM), and rewrites the
 * postings that carry it. Idempotent; safe to run after every scout.
 */
export async function normalizeCatalogLocations(opts: { useLLM?: boolean; dry?: boolean; recompute?: boolean } = {}): Promise<NormalizeCatalogResult> {
  const useLLM = opts.useLLM !== false;
  await connectToDatabase();
  // Pairs come from the ORIGINAL strings when we have them (rawLocation),
  // so re-running never normalizes an already-normalized value.
  const pairs: { city: string; country: string; raw?: string; n: number }[] = await ExternalJobs.aggregate([
    { $group: { _id: { city: "$city", country: "$country", raw: "$rawLocation" }, n: { $sum: 1 } } },
    { $project: { _id: 0, city: "$_id.city", country: "$_id.country", raw: "$_id.raw", n: 1 } },
  ]);

  const inputs = pairs.map((p) => (p.raw ? { city: p.raw, country: "" } : { city: p.city || "", country: p.country || "" }));
  const resolved = await resolveRawLocations(inputs, { useLLM, ignoreRulesCache: !!opts.recompute });

  let updatedDocs = 0;
  let changedPairs = 0;
  const bySource = { rules: 0, llm: 0, manual: 0 } as Record<string, number>;
  const unresolved: string[] = [];
  const ops: any[] = [];

  pairs.forEach((p, i) => {
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

  if (!opts.dry && ops.length) {
    for (let i = 0; i < ops.length; i += 200) {
      const res = await ExternalJobs.bulkWrite(ops.slice(i, i + 200), { ordered: false });
      updatedDocs += res.modifiedCount ?? 0;
    }
  }

  return { pairs: pairs.length, changedPairs, updatedDocs, bySource, unresolved: unresolved.slice(0, 50), unresolvedCount: unresolved.length };
}
