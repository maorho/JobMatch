import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { embedText } from "./embeddings";
import { buildCandidateText } from "./text";
import { inferCandidateLevel } from "./level";
import { invalidate } from "@/app/lib/cache";
import { invalidateRankedFeed, scheduleFeedWarm } from "./rankedFeed";

/**
 * Build the candidate's profile text (résumé + memory), embed it, and store the
 * vector on the user. Called when a résumé is processed (e.g. at signup).
 */
export async function embedAndStoreResume(
  userId: string,
  resumeText: string
): Promise<number[] | null> {
  await connectToDatabase();
  const user = await User.findById(userId).select("currentJob company memory");
  if (!user) return null;

  const text = buildCandidateText(user as any, resumeText);
  if (!text.trim()) return null;

  const vec = await embedText(text);
  // resumeUpdatedAt is the résumé version in every match cache key (rank list,
  // reranker verdicts, MatchCache), and searchVectorKey is the blended search
  // vector's cache key: bumping one and dropping the other makes the feed
  // re-rank against the new résumé instead of serving the old one.
  await User.updateOne(
    { _id: userId },
    {
      $set: { resumeText: (resumeText || "").slice(0, 20000), embedding: vec, level: inferCandidateLevel(resumeText || "", (user as any).currentJob || ""), resumeUpdatedAt: new Date() },
      $unset: { searchVectorKey: 1 },
    }
  );
  // The persisted feed belongs to the old résumé; drop it and rank against the new one in the background.
  invalidate(`rank:${userId}:`);
  await invalidateRankedFeed(userId).catch(() => {});
  scheduleFeedWarm(userId);
  return vec;
}

/**
 * Get the candidate's embedding — the stored one if present, otherwise build it
 * from their résumé text / memory on the fly and cache it for next time.
 */
export async function getCandidateVector(
  userId: string
): Promise<number[] | null> {
  await connectToDatabase();
  const user = await User.findById(userId).select(
    "+embedding +resumeText currentJob company memory"
  );
  if (!user) return null;

  if (Array.isArray(user.embedding) && user.embedding.length) {
    return user.embedding;
  }

  const text = buildCandidateText(user as any, (user as any).resumeText);
  if (!text.trim()) return null;

  const vec = await embedText(text);
  await User.updateOne({ _id: userId }, { $set: { embedding: vec } });
  return vec;
}
