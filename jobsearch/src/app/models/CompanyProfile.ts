import mongoose from "mongoose";

/**
 * One short, candidate-facing profile per company in the catalog: what they
 * do (Hebrew, two sentences), industry, HQ, size. Written by the Researcher
 * agent (lib/companies/profiles.ts) from web search when a key is available,
 * otherwise from the company description the ATS ships with its postings.
 * Shown on the Companies page.
 */
const CompanyProfileSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // companyKey(name)
    name: { type: String, required: true },
    domain: { type: String, default: "" },
    summary: { type: String, default: "", maxlength: 400 },
    industry: { type: String, default: "", maxlength: 60 },
    hq: { type: String, default: "", maxlength: 80 },
    founded: { type: String, default: "", maxlength: 12 },
    size: { type: String, default: "", maxlength: 60 },
    website: { type: String, default: "", maxlength: 200 },
    sources: { type: [String], default: [] },
    /** "web" = searched; "ats" = from the postings' company description; "model" = prior knowledge only. */
    source: { type: String, enum: ["web", "ats", "model"], default: "ats" },
    confidence: { type: String, enum: ["high", "medium", "low"], default: "low" },
    model: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.models.CompanyProfile || mongoose.model("CompanyProfile", CompanyProfileSchema);
