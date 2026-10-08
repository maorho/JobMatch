import mongoose from "mongoose";

/**
 * One professional contact a user imported (LinkedIn "Connections.csv").
 * Used to surface "you know N people at this company" and to draft referral
 * outreach. Private to the importing user; never shared or cross-linked.
 */
const ContactSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    source: { type: String, enum: ["linkedin", "manual"], default: "linkedin" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    fullName: { type: String, default: "" },
    url: { type: String, default: "" },
    email: { type: String, default: "" },
    company: { type: String, default: "" },
    /** Lower-cased company without legal suffixes — what we match jobs against. */
    companyKey: { type: String, default: "", index: true },
    position: { type: String, default: "" },
    connectedOn: { type: Date },
    /** Stable per-user identity for upserts: the profile URL, else email, else name+company. */
    dedupeKey: { type: String, required: true },
  },
  { timestamps: true }
);

ContactSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
ContactSchema.index({ userId: 1, companyKey: 1 });

export default mongoose.models.Contact || mongoose.model("Contact", ContactSchema);
