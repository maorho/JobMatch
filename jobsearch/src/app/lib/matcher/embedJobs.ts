import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import { embedTexts } from "./embeddings";
import { buildJobText } from "./text";

/**
 * Backfill embeddings for ExternalJobs that don't have one yet. Run after the
 * Scout ingests new jobs. Processes up to `limit` jobs per call.
 */
export async function embedPendingJobs(limit = 500): Promise<{
  processed: number;
  remaining: number;
}> {
  await connectToDatabase();

  const jobs = await ExternalJobs.find({ embedding: { $exists: false } })
    .select("job company city country description skills seniority")
    .limit(limit);

  if (jobs.length === 0) {
    const remaining = await ExternalJobs.countDocuments({
      embedding: { $exists: false },
    });
    return { processed: 0, remaining };
  }

  const texts = jobs.map((j: any) => buildJobText(j));
  const vectors = await embedTexts(texts);

  await ExternalJobs.bulkWrite(
    jobs.map((j: any, i: number) => ({
      updateOne: {
        filter: { _id: j._id },
        update: { $set: { embedding: vectors[i] } },
      },
    }))
  );

  const remaining = await ExternalJobs.countDocuments({
    embedding: { $exists: false },
  });
  return { processed: jobs.length, remaining };
}
