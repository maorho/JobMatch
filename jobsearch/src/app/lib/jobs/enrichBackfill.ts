import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import { enrich, titleKey } from "@/app/lib/jobs/enrich";

/** Enrich open postings that lack the structured fields (or all of them). Returns what it did and what is left. */
export async function runEnrichBackfill(opts: { limit?: number; all?: boolean } = {}): Promise<{ updated: number; remaining: number; ms: number }> {
  const t0 = Date.now();
  await connectToDatabase();
  const limit = opts.limit ?? 1000;
  const filter = opts.all ? { ...OPEN_JOBS } : { ...OPEN_JOBS, enrichedAt: null };
  const docs: any[] = await ExternalJobs.find(filter).select("job description").limit(limit).lean();
  if (docs.length) {
    await ExternalJobs.bulkWrite(
      docs.map((d) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { ...enrich(d.job || "", d.description || ""), enrichedAt: new Date(), titleKey: titleKey(d.job || "") } } } })),
      { ordered: false }
    );
  }
  const remaining = opts.all ? Math.max(0, (await ExternalJobs.countDocuments(OPEN_JOBS)) - docs.length) : await ExternalJobs.countDocuments({ ...OPEN_JOBS, enrichedAt: null });
  return { updated: docs.length, remaining, ms: Date.now() - t0 };
}
