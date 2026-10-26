import mongoose from "mongoose";

export const SIGNAL_KINDS = ["saved", "dismissed"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * What a person told us about a posting without applying: saved it, or said
 * "not relevant". Dismissed postings leave the feed; both are kept with the
 * matching features of the moment so the likelihood model can learn from
 * them later (a dismissal is the negative signal the outcome loop lacks).
 */
const JobSignalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    jobModel: { type: String, enum: ["Job", "ExternalJobs"], default: "ExternalJobs" },
    kind: { type: String, enum: SIGNAL_KINDS, required: true },
    company: { type: String, default: "" },
    title: { type: String, default: "" },
    matchScore: { type: Number, default: null },
    features: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

JobSignalSchema.index({ userId: 1, jobId: 1, kind: 1 }, { unique: true });
JobSignalSchema.index({ userId: 1, kind: 1, createdAt: -1 });

export default mongoose.models.JobSignal || mongoose.model("JobSignal", JobSignalSchema);
