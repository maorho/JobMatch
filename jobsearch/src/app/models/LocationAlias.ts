import mongoose from "mongoose";

/**
 * Cache of resolved raw location strings → canonical { city, country, remote }.
 * Each distinct ATS string is resolved once (rules or LLM) and reused for
 * every posting that carries it, so the agent's cost is bounded by the number
 * of distinct strings (hundreds), not postings (thousands).
 */
const LocationAliasSchema = new mongoose.Schema(
  {
    raw: { type: String, required: true, unique: true },
    city: { type: String, default: "" },
    country: { type: String, default: "" },
    region: { type: String, default: "" },
    remote: { type: Boolean, default: false },
    source: { type: String, enum: ["rules", "llm", "manual"], required: true },
    confidence: { type: String, enum: ["high", "medium", "low"], default: "medium" },
  },
  { timestamps: true }
);

export default mongoose.models.LocationAlias ||
  mongoose.model("LocationAlias", LocationAliasSchema);
