import mongoose from "mongoose";

/**
 * One message on the agent bus: who sent it, to whom, what it asks for, and
 * what happened when the receiver handled it. Together the messages of a run
 * read like a conversation between the agents (see /AdminDashboard/agents).
 */
export const MESSAGE_STATUSES = ["queued", "processing", "done", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

const AgentMessageSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: "AgentRun", required: true, index: true },
    from: { type: String, required: true }, // agent name, or "system" / "user"
    to: { type: String, required: true, index: true },
    type: { type: String, required: true }, // e.g. "jobs.ingested"
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Human-readable line the sender wrote with the message. */
    says: { type: String, default: "", maxlength: 2000 },
    /** The message this one answers (request/reply). */
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "AgentMessage" },
    /** The message whose handling produced this one (conversation tree). */
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "AgentMessage" },
    status: { type: String, enum: MESSAGE_STATUSES, default: "queued", index: true },
    attempts: { type: Number, default: 0 },
    /** What the receiver said after handling it. */
    result: { type: String, default: "", maxlength: 2000 },
    error: { type: String, default: "" },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

AgentMessageSchema.index({ status: 1, createdAt: 1 });
AgentMessageSchema.index({ runId: 1, createdAt: 1 });

export default mongoose.models.AgentMessage || mongoose.model("AgentMessage", AgentMessageSchema);
