import mongoose from "mongoose";

/**
 * A 1:1 thread between two users, always anchored to an internally-posted
 * job (candidate ↔ the recruiter who published it). One thread per
 * (pair, job); `participants` is stored sorted so the pair is a stable key.
 */
const ConversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
      validate: [(v: unknown[]) => Array.isArray(v) && v.length === 2, "exactly two participants"],
    },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    // "<idA>:<idB>:<jobId>" with the ids sorted — the one-thread-per-pair-per-job
    // key. (A unique index on the `participants` array would be multikey and
    // collide across different pairs sharing one member.)
    pairKey: { type: String, required: true, unique: true },
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    lastSenderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Per-participant unread counters keyed by user id.
    unread: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

ConversationSchema.index({ participants: 1, lastMessageAt: -1 });

export default mongoose.models.Conversation || mongoose.model("Conversation", ConversationSchema);
