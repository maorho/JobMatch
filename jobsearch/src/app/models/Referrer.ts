import mongoose from "mongoose";

/**
 * An "insider": a JobMatch user who works at a company and is willing to
 * refer candidates there ("חבר מביא חבר"). Verified through a work email on
 * the company's domain. One row per (user, company).
 */
const ReferrerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    company: { type: String, required: true },
    companyKey: { type: String, required: true, index: true },
    domain: { type: String, default: "" },
    title: { type: String, default: "", maxlength: 80 },
    workEmail: { type: String, required: true, lowercase: true, trim: true },
    verifyCodeHash: { type: String, select: false },
    verifyCodeExpires: { type: Date },
    verifiedAt: { type: Date },
    active: { type: Boolean, default: true },
    /** Open (requested/accepted) requests this person will hold at once. */
    capacity: { type: Number, default: 5, min: 1, max: 50 },
    /** Free text shown to candidates: what they refer, what they want in a message. */
    note: { type: String, default: "", maxlength: 300 },
    stats: { requests: { type: Number, default: 0 }, accepted: { type: Number, default: 0 }, submitted: { type: Number, default: 0 }, declined: { type: Number, default: 0 } },
  },
  { timestamps: true }
);

ReferrerSchema.index({ userId: 1, companyKey: 1 }, { unique: true });
ReferrerSchema.index({ companyKey: 1, active: 1, verifiedAt: 1 });

export default mongoose.models.Referrer || mongoose.model("Referrer", ReferrerSchema);
