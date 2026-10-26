import mongoose from "mongoose";

/** Cached output of the company research agent (lib/interview/companyResearch.ts), one per company, refreshed weekly. */
const CompanyBriefSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // lower-cased company name
    company: { type: String, required: true },
    domain: { type: String, default: "" },
    brief: { type: mongoose.Schema.Types.Mixed, required: true }, // CompanyResearch
    searched: { type: Boolean, default: false }, // true when web search actually ran
    model: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.models.CompanyBrief || mongoose.model("CompanyBrief", CompanyBriefSchema);
