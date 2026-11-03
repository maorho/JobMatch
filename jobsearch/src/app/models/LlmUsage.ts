import mongoose from "mongoose";

/**
 * Spend ledger: one row per (hour, model, role, feature, user) with summed
 * tokens and USD. Written by lib/llm/usageMeter.ts after every model call,
 * read by the cost monitor and the admin cost card. Rows expire after 90 days.
 */
const LlmUsageSchema = new mongoose.Schema(
  {
    hour: { type: String, required: true }, // "YYYY-MM-DDTHH" (UTC)
    day: { type: String, required: true }, // "YYYY-MM-DD" (UTC)
    provider: { type: String, required: true },
    model: { type: String, required: true },
    role: { type: String, default: "" }, // fast / quality / coach / interviewer / embedding / research / voice …
    feature: { type: String, default: "" }, // the quota key or the agent message type that caused the spend
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    calls: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheWriteTokens: { type: Number, default: 0 },
    usd: { type: Number, default: 0 },
    /** Some of this row's cost used the fallback price (unknown model). */
    estimated: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

LlmUsageSchema.index({ hour: 1, model: 1, role: 1, feature: 1, userId: 1 }, { unique: true });
LlmUsageSchema.index({ day: 1 });
LlmUsageSchema.index({ userId: 1, day: 1 });
LlmUsageSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export default mongoose.models.LlmUsage || mongoose.model("LlmUsage", LlmUsageSchema);
