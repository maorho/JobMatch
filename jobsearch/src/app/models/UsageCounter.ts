import mongoose from "mongoose";

/** Per-user, per-day counters for the actions that cost money (LLM / voice minutes). One row per (user, day, key). */
const UsageCounterSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    day: { type: String, required: true }, // YYYY-MM-DD (UTC)
    key: { type: String, required: true },
    n: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

UsageCounterSchema.index({ userId: 1, day: 1, key: 1 }, { unique: true });
UsageCounterSchema.index({ day: 1, key: 1 });

export default mongoose.models.UsageCounter || mongoose.model("UsageCounter", UsageCounterSchema);
