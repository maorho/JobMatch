import mongoose from "mongoose";

/**
 * Fixed-window request counters (lib/ops/rateLimit.ts): one row per
 * (key, window). Rows expire on their own a day after the window opened, so
 * the collection never needs sweeping.
 */
const RateLimitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, default: 0 },
  },
  { versionKey: false }
);

RateLimitSchema.index({ key: 1, windowStart: 1 }, { unique: true });
RateLimitSchema.index({ windowStart: 1 }, { expireAfterSeconds: 24 * 3600 });

export default mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema);
