import mongoose from "mongoose";

/**
 * A model answer to one company interview question, written for one person from
 * their résumé. Cached per résumé version so re-opening the page costs nothing;
 * a new résumé upload naturally produces fresh answers.
 */
const SuggestedAnswerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** sha256 of `${companyKey}|${question}` — stable across harvest reruns. */
    key: { type: String, required: true },
    resumeVersion: { type: String, required: true },
    company: { type: String, default: "" },
    question: { type: String, default: "" },
    answer: { type: String, required: true },
    tips: { type: [String], default: [] },
    /** Résumé facts the answer leans on; placeholders mark what the résumé didn't say. */
    placeholders: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SuggestedAnswerSchema.index({ userId: 1, key: 1, resumeVersion: 1 }, { unique: true });
// Old résumé versions' answers are dead weight after a while.
SuggestedAnswerSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 120 });

export default mongoose.models.SuggestedAnswer || mongoose.model("SuggestedAnswer", SuggestedAnswerSchema);
