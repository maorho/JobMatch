import mongoose from "mongoose";

/**
 * A run groups the messages of one conversation between agents — e.g. a
 * nightly catalog refresh, or everything that followed one résumé upload.
 */
export const RUN_STATUSES = ["running", "done", "failed"] as const;

const AgentRunSchema = new mongoose.Schema(
  {
    flow: { type: String, required: true, index: true }, // e.g. "catalog.refresh"
    title: { type: String, default: "" },
    startedBy: { type: String, default: "system" }, // "cron" | "admin:<id>" | "user:<id>" | "system"
    status: { type: String, enum: RUN_STATUSES, default: "running", index: true },
    stats: {
      messages: { type: Number, default: 0 },
      done: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.AgentRun || mongoose.model("AgentRun", AgentRunSchema);
