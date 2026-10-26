import mongoose from "mongoose";
import { PRACTICE_ROLES, PRACTICE_LEVELS, TASK_KINDS } from "@/app/lib/practice/roles";

export const ATTEMPT_STATUSES = ["in_progress", "submitted", "graded", "failed"] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/** One person working on one task: the clock, what they handed in, and the agent's grade. */
const BreakdownSchema = new mongoose.Schema({ criterion: { type: String, required: true, maxlength: 80 }, weight: { type: Number, default: 1 }, score: { type: Number, default: 0, min: 0, max: 100 }, comment: { type: String, default: "", maxlength: 500 } }, { _id: false });

const PracticeAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "PracticeTask", required: true, index: true },
    kind: { type: String, enum: TASK_KINDS, required: true },
    role: { type: String, enum: PRACTICE_ROLES, required: true },
    level: { type: String, enum: PRACTICE_LEVELS, required: true },
    status: { type: String, enum: ATTEMPT_STATUSES, default: "in_progress", index: true },
    startedAt: { type: Date, default: Date.now },
    deadlineAt: { type: Date, required: true },
    submittedAt: { type: Date, default: undefined },
    durationSec: { type: Number, default: 0 },
    timedOut: { type: Boolean, default: false },
    /** Code (coding) or the write-up (assignment). */
    answer: { type: String, default: "", maxlength: 60000 },
    repoUrl: { type: String, default: "", maxlength: 300 },
    language: { type: String, default: "" },
    score: { type: Number, default: null, min: 0, max: 100 },
    verdict: { type: String, enum: ["pass", "borderline", "fail", ""], default: "" },
    breakdown: { type: [BreakdownSchema], default: [] },
    feedback: { type: String, default: "", maxlength: 6000 },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    gradedBy: { type: String, default: "" }, // "examiner" | "assigner"
    gradedAt: { type: Date, default: undefined },
    model: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { timestamps: true }
);

PracticeAttemptSchema.index({ userId: 1, taskId: 1, status: 1 });
PracticeAttemptSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.PracticeAttempt || mongoose.model("PracticeAttempt", PracticeAttemptSchema);
