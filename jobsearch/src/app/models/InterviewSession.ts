import mongoose from "mongoose";

/**
 * One mock interview: the interviewer agent's conversation with the
 * candidate for a stage of their plan, and the feedback written at the end.
 * Feedback is only produced once the interview is over (no coaching mid-way).
 */
export const SESSION_STATUSES = ["active", "finished"] as const;

const TurnSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["interviewer", "candidate"], required: true },
    content: { type: String, required: true, maxlength: 6000 },
    at: { type: Date, default: Date.now },
    /** Voice mode: how long this turn was spoken, and the measured voice profile. */
    seconds: { type: Number },
    prosody: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const InterviewSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    prepId: { type: mongoose.Schema.Types.ObjectId, ref: "InterviewPrep", required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    source: { type: String, enum: ["external", "internal"], required: true },
    jobTitle: { type: String, default: "" },
    company: { type: String, default: "" },
    stage: { type: String, required: true },
    language: { type: String, enum: ["he", "en"], default: "he" },
    mode: { type: String, enum: ["chat", "voice"], default: "chat" },
    realtime: {
      model: { type: String, default: "" },
      voice: { type: String, default: "" },
      name: { type: String, default: "" },
      gender: { type: String, default: "" },
    },
    /** Per-question reviews written while the interview runs (voice mode). */
    reviews: { type: [mongoose.Schema.Types.Mixed], default: [] },
    /** Lock + timestamp for the background debrief generation. */
    feedbackStartedAt: { type: Date },
    /** Voice mode: pace / fillers / answer lengths / tone (see lib/interview/voice.ts). */
    delivery: { type: mongoose.Schema.Types.Mixed, default: undefined },
    /** Voice mode: what the interviewer model heard (reported with end_interview). */
    impression: { type: mongoose.Schema.Types.Mixed, default: undefined },
    targetQuestions: { type: Number, default: 8 },
    /** What the interviewer "knows" about the company (frozen at start). */
    companyBrief: { type: String, default: "", maxlength: 6000 },
    transcript: { type: [TurnSchema], default: [] },
    status: { type: String, enum: SESSION_STATUSES, default: "active", index: true },
    /** Interviewer said goodbye; waiting for feedback to be generated. */
    wrappedUp: { type: Boolean, default: false },
    feedback: { type: mongoose.Schema.Types.Mixed, default: undefined }, // InterviewFeedback (lib/interview/simulator.ts)
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

InterviewSessionSchema.index({ userId: 1, prepId: 1, createdAt: -1 });

export default mongoose.models.InterviewSession || mongoose.model("InterviewSession", InterviewSessionSchema);
