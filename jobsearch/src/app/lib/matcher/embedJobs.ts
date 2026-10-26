import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import { embedTexts } from "./embeddings";
import { buildJobText } from "./text";

/**
 * Open postings that still need an embedding. `embeddedAt` is the indexed
 * marker (index {active, embeddedAt}); the `embedding` clause keeps postings
 * embedded before the marker existed from being paid for twice until
 * src/scripts/backfill-embedded-at.ts has stamped them.
 */
export const PENDING_EMBEDDING = { ...OPEN_JOBS, embeddedAt: { $exists: false }, embedding: { $exists: false } } as const;

/**
 * Backfill embeddings for ExternalJobs that don't have one yet. Run after the
 * Scout ingests new jobs. Processes up to `limit` jobs per call.
 */
export async function embedPendingJobs(limit = 500): Promise<{
  processed: number;
  remaining: number;
}> {
  await connectToDatabase();

  const jobs = await ExternalJobs.find(PENDING_EMBEDDING)
    .select("job company city country description skills seniority")
    .limit(limit);

  if (jobs.length === 0) {
    const remaining = await ExternalJobs.countDocuments(PENDING_EMBEDDING);
    return { processed: 0, remaining };
  }

  const texts = jobs.map((j: any) => buildJobText(j));
  const vectors = await embedTexts(texts);
  const embeddedAt = new Date();

  await ExternalJobs.bulkWrite(
    jobs.map((j: any, i: number) => ({
      updateOne: {
        filter: { _id: j._id },
        update: { $set: { embedding: vectors[i], embeddedAt } },
      },
    }))
  );

  const remaining = await ExternalJobs.countDocuments(PENDING_EMBEDDING);
  return { processed: jobs.length, remaining };
}
