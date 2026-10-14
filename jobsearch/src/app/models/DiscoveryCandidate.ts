import mongoose from "mongoose";

export const DISCOVERY_ORIGINS = ["contacts", "insiders", "search", "manual", "postings"] as const;
export const DISCOVERY_STATUSES = ["pending", "found", "not_found", "exists"] as const;

/**
 * A company the Scout should try to add to the catalog: where the name came
 * from, which ATS endpoints were probed, and what came of it. One row per
 * company key, so a company is never probed twice for the same reason.
 */
const DiscoveryCandidateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    origin: { type: String, enum: DISCOVERY_ORIGINS, default: "manual" },
    /** Careers / board URLs seen for this company (search results, briefs, user hints). */
    urlHints: { type: [String], default: [] },
    domain: { type: String, default: "" },
    status: { type: String, enum: DISCOVERY_STATUSES, default: "pending", index: true },
    attempts: { type: Number, default: 0 },
    tried: { type: [{ ats: String, identifier: String, ok: Boolean, at: Date }], default: [] },
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySource" },
    lastTriedAt: { type: Date },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

DiscoveryCandidateSchema.index({ status: 1, attempts: 1, createdAt: 1 });

export default mongoose.models.DiscoveryCandidate || mongoose.model("DiscoveryCandidate", DiscoveryCandidateSchema);
