import mongoose from "mongoose";

/**
 * A generated interview-preparation plan for one user and one job.
 * Generated once (expensive LLM call), re-used on later visits, and
 * regenerated only on request.
 */
const InterviewPrepSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    source: { type: String, enum: ["external", "internal"], required: true },
    jobTitle: { type: String, default: "" },
    company: { type: String, default: "" },
    plan: { type: mongoose.Schema.Types.Mixed, required: true }, // InterviewPlan (see lib/interview/prepare.ts)
    model: { type: String, default: "" },
  },
  { timestamps: true }
);

InterviewPrepSchema.index({ userId: 1, jobId: 1, source: 1 }, { unique: true });

export default mongoose.models.InterviewPrep || mongoose.model("InterviewPrep", InterviewPrepSchema);
