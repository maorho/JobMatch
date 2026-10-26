import mongoose from "mongoose";
import { QUESTION_STAGES } from "./InterviewQuestion";

/**
 * An interview question reported publicly on the web (Glassdoor reviews,
 * Reddit/Blind threads, blog posts, Hebrew forums) and harvested by the
 * web-questions agent (lib/interview/webQuestions.ts). Kept apart from
 * InterviewQuestion (what OUR candidates reported) so provenance is never
 * mixed up: the bank shows both, labelled.
 */
const WebInterviewQuestionSchema = new mongoose.Schema(
  {
    company: { type: String, required: true },
    companyKey: { type: String, required: true, index: true },
    roleTitle: { type: String, default: "", maxlength: 80 },
    stage: { type: String, enum: QUESTION_STAGES, default: "other" },
    question: { type: String, required: true, maxlength: 600 },
    topic: { type: String, default: "", maxlength: 60 },
    /** Normalised text for de-duplication (same rule as InterviewQuestion.key). */
    key: { type: String, required: true },
    sourceUrl: { type: String, default: "", maxlength: 500 },
    sourceName: { type: String, default: "", maxlength: 60 },
    language: { type: String, enum: ["he", "en"], default: "en" },
    harvestedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

WebInterviewQuestionSchema.index({ companyKey: 1, stage: 1, key: 1 }, { unique: true });

export default mongoose.models.WebInterviewQuestion || mongoose.model("WebInterviewQuestion", WebInterviewQuestionSchema);

/** One harvest run per company (when, how many, whether the search tool actually ran). */
const WebQuestionHarvestSchema = new mongoose.Schema(
  {
    companyKey: { type: String, required: true, unique: true },
    company: { type: String, required: true },
    // Set only when a harvest completes (no default: a failed attempt's upsert
    // must not look like a fresh harvest).
    harvestedAt: { type: Date },
    /** Last attempt of any outcome; with `error` set it drives the retry back-off. */
    attemptedAt: { type: Date },
    /** In-flight marker: concurrent visits don't stack paid searches (cleared when the attempt ends). */
    harvestStartedAt: { type: Date, default: null },
    found: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    searched: { type: Boolean, default: false },
    model: { type: String, default: "" },
    processNotes: { type: String, default: "", maxlength: 1000 },
    error: { type: String, default: "" },
  },
  { versionKey: false }
);

export const WebQuestionHarvest = mongoose.models.WebQuestionHarvest || mongoose.model("WebQuestionHarvest", WebQuestionHarvestSchema);
