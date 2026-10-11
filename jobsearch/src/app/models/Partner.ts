import mongoose from "mongoose";

/**
 * A bootcamp / college / community that sends its graduates to JobMatch.
 * Members join with the partner's invite code (signup link, OAuth cookie or
 * the join form) and the partner follows its cohort's funnel on a dashboard
 * protected by a token that is shown once at creation.
 */
export const PARTNER_KINDS = ["bootcamp", "college", "community", "other"] as const;

const PartnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true },
    kind: { type: String, enum: PARTNER_KINDS, default: "bootcamp" },
    inviteCode: { type: String, required: true, unique: true },
    /** Shown on the landing page. */
    blurb: { type: String, default: "", maxlength: 600 },
    website: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    /** Free-text cohort label the partner can use (e.g. "Cohort 14"). */
    cohort: { type: String, default: "" },
    /** sha256 of the dashboard token (plain token shown once). */
    tokenHash: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
  },
  { timestamps: true }
);

export default mongoose.models.Partner || mongoose.model("Partner", PartnerSchema);
