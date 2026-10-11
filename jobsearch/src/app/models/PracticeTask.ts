import mongoose from "mongoose";
import { PRACTICE_ROLES, PRACTICE_LEVELS, TASK_KINDS } from "@/app/lib/practice/roles";

/**
 * A practice task: a timed coding question (Examiner) or a take-home
 * assignment (Assigner), per role × level. Written once, attempted by many.
 */
const RubricItemSchema = new mongoose.Schema({ criterion: { type: String, required: true, maxlength: 80 }, weight: { type: Number, default: 1, min: 0 }, description: { type: String, default: "", maxlength: 300 } }, { _id: false });
const ExampleSchema = new mongoose.Schema({ input: { type: String, default: "", maxlength: 600 }, output: { type: String, default: "", maxlength: 600 }, explanation: { type: String, default: "", maxlength: 300 } }, { _id: false });

const PracticeTaskSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: TASK_KINDS, required: true, index: true },
    role: { type: String, enum: PRACTICE_ROLES, required: true, index: true },
    level: { type: String, enum: PRACTICE_LEVELS, required: true, index: true },
    /** Dedup: `${kind}:${role}:${level}:${slug}`. */
    key: { type: String, required: true, unique: true },
    title: { type: String, required: true, maxlength: 120 },
    /** The statement (Hebrew, technical terms in English; plain text with blank-line paragraphs). */
    prompt: { type: String, required: true, maxlength: 6000 },
    language: { type: String, default: "typescript", maxlength: 20 },
    starterCode: { type: String, default: "", maxlength: 3000 },
    examples: { type: [ExampleSchema], default: [] },
    constraints: { type: [String], default: [] },
    deliverables: { type: [String], default: [] },
    rubric: { type: [RubricItemSchema], default: [] },
    hints: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    /** Coding: minutes on the clock. Assignment: hours in the window. */
    timeLimitMin: { type: Number, default: 0 },
    estimatedHours: { type: Number, default: 0 },
    difficulty: { type: Number, default: 2, min: 1, max: 5 },
    source: { type: String, enum: ["llm", "seed"], default: "llm" },
    createdBy: { type: String, enum: ["examiner", "assigner"], required: true },
    active: { type: Boolean, default: true },
    stats: { attempts: { type: Number, default: 0 }, graded: { type: Number, default: 0 }, scoreSum: { type: Number, default: 0 } },
  },
  { timestamps: true }
);

PracticeTaskSchema.index({ kind: 1, role: 1, level: 1, active: 1 });

export default mongoose.models.PracticeTask || mongoose.model("PracticeTask", PracticeTaskSchema);
