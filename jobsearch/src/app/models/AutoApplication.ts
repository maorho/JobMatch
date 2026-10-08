import mongoose from "mongoose";

/**
 * The audit trail of the Applier agent: one row per job it considered for a
 * user, whatever the outcome. The dashboard shows these; the daily cap
 * counts the "submitted" ones.
 */
export const AUTO_APPLY_STATUSES = ["submitted", "needs_user", "failed", "skipped"] as const;
export type AutoApplyStatus = (typeof AUTO_APPLY_STATUSES)[number];

const AutoApplicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    jobModel: { type: String, enum: ["Job", "ExternalJobs"], required: true },
    jobTitle: { type: String, default: "" },
    company: { type: String, default: "" },
    url: { type: String, default: "" },
    score: { type: Number, default: 0 },
    status: { type: String, enum: AUTO_APPLY_STATUSES, required: true, index: true },
    /** ATS the form belonged to (greenhouse, lever, …) when known. */
    ats: { type: String, default: "" },
    /** Why it needs the user / failed, in plain words. */
    note: { type: String, default: "", maxlength: 1000 },
    /** The tailored résumé that was (or would be) attached. */
    resumeStructured: { type: mongoose.Schema.Types.Mixed, default: undefined, select: false },
  },
  { timestamps: true }
);

AutoApplicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });
AutoApplicationSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.models.AutoApplication || mongoose.model("AutoApplication", AutoApplicationSchema);
