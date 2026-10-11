import mongoose from "mongoose";

export const REFERRAL_STATUSES = ["requested", "accepted", "declined", "submitted", "withdrawn", "expired"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
/** Statuses that count against the insider's capacity. */
export const OPEN_STATUSES: ReferralStatus[] = ["requested", "accepted"];

/** A candidate asking an insider to refer them for one posting, and what the insider did with it. */
const ReferralRequestSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: "Referrer", required: true, index: true },
    referrerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    company: { type: String, required: true },
    companyKey: { type: String, required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    jobModel: { type: String, enum: ["Job", "ExternalJobs"], required: true },
    jobTitle: { type: String, default: "" },
    jobUrl: { type: String, default: "" },
    /** The candidate's pitch to the insider. */
    message: { type: String, default: "", maxlength: 1200 },
    matchScore: { type: Number, default: null },
    status: { type: String, enum: REFERRAL_STATUSES, default: "requested", index: true },
    referrerNote: { type: String, default: "", maxlength: 600 },
    respondedAt: { type: Date },
    submittedAt: { type: Date },
    /** The application row created when the insider reports the submission. */
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate" },
  },
  { timestamps: true }
);

ReferralRequestSchema.index({ candidateId: 1, jobId: 1 }, { unique: true });
ReferralRequestSchema.index({ referrerUserId: 1, status: 1, createdAt: -1 });

export default mongoose.models.ReferralRequest || mongoose.model("ReferralRequest", ReferralRequestSchema);
