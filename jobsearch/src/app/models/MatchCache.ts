import mongoose from "mongoose";

/**
 * Reranker verdicts, cached per (user, résumé version, job) so the LLM pass
 * over a user's top matches runs once per résumé change, not per page view.
 */
const MatchCacheSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** Résumé version the verdict was computed for (resumeUpdatedAt ms, or 0). */
    resumeVersion: { type: Number, required: true },
    fit: { type: Number, required: true }, // 0–100
    why: { type: String, default: "", maxlength: 400 },
    gaps: { type: [String], default: [] },
    model: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 14 }, // TTL 14 days
  },
  { versionKey: false }
);

MatchCacheSchema.index({ userId: 1, resumeVersion: 1, jobId: 1 }, { unique: true });

export default mongoose.models.MatchCache || mongoose.model("MatchCache", MatchCacheSchema);
