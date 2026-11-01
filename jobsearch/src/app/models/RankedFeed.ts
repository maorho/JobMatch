import mongoose from "mongoose";

/**
 * A person's ranked feed, persisted so it survives serverless instances:
 * computed in the background when they sign in / open the app, and served
 * as-is when they reach the jobs page. One doc per (user, cache key); the
 * key carries the résumé + search-profile versions, so a new résumé is a new
 * key. `isDefault` marks the plain feed (no query/filter), the one worth
 * warming. Rows expire on their own.
 */
const RankedFeedSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    /** The RankedJob[] as gzipped JSON (~1000 rows ≈ 500 KB raw, ~60 KB stored). */
    blob: { type: Buffer },
    count: { type: Number, default: 0 },
    computedAt: { type: Date, required: true },
    /** Set while a background warm-up is running, so parallel instances don't all compute. */
    warmingAt: { type: Date },
  },
  { timestamps: false }
);

RankedFeedSchema.index({ userId: 1, key: 1 }, { unique: true });
RankedFeedSchema.index({ userId: 1, isDefault: 1, computedAt: -1 });
RankedFeedSchema.index({ computedAt: 1 }, { expireAfterSeconds: 60 * 60 }); // stale copies are useless after an hour

export default mongoose.models.RankedFeed || mongoose.model("RankedFeed", RankedFeedSchema);
