import mongoose from "mongoose";

/**
 * One question a candidate was actually asked in a real interview, as they
 * reported it afterwards ("what did they ask?"). The per-company question
 * bank is built from these: `shareable` rows are shown (anonymously) on the
 * public company pages and feed the interviewer and the prep plans.
 */
export const QUESTION_STAGES = ["hr", "technical", "final", "other"] as const;
export type QuestionStage = (typeof QUESTION_STAGES)[number];

const InterviewQuestionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate", default: undefined },
    company: { type: String, required: true },
    companyKey: { type: String, required: true, index: true },
    roleTitle: { type: String, default: "" },
    stage: { type: String, enum: QUESTION_STAGES, default: "other" },
    question: { type: String, required: true, maxlength: 600 },
    /** Short topic label (e.g. "React hooks", "system design", "salary"). */
    topic: { type: String, default: "", maxlength: 60 },
    /** Candidate's own note on how it went / what a good answer was. */
    note: { type: String, default: "", maxlength: 600 },
    /** Normalised text for de-duplication across reporters. */
    key: { type: String, required: true },
    shareable: { type: Boolean, default: true },
    askedAt: { type: Date, default: Date.now },
    language: { type: String, enum: ["he", "en"], default: "he" },
  },
  { timestamps: true }
);

InterviewQuestionSchema.index({ companyKey: 1, stage: 1, shareable: 1 });
InterviewQuestionSchema.index({ userId: 1, applicationId: 1, key: 1 }, { unique: true });

export default mongoose.models.InterviewQuestion || mongoose.model("InterviewQuestion", InterviewQuestionSchema);
