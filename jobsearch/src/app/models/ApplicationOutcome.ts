import mongoose from "mongoose";

/**
 * What happened after an application — the training data behind the
 * "interview likelihood" score. One row per application, created when the
 * application is made (with a snapshot of the matching features at that
 * moment) and resolved by the candidate ("did you get a reply?"), the Gmail
 * tracker, a recruiter, or a timeout.
 *
 * `outcome` is the latest state; `reached` is the furthest stage ever reached
 * (a rejection after a technical interview is still a positive example for
 * "got an interview").
 */
export const OUTCOMES = ["pending", "no_reply", "rejected", "screen", "interview", "offer"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const STAGES_REACHED = ["none", "screen", "interview", "offer"] as const;
export type StageReached = (typeof STAGES_REACHED)[number];
export const OUTCOME_SOURCES = ["user", "email", "recruiter", "timeout", "mcp"] as const;

export type OutcomeFeatures = {
  matchScore: number | null; // the blended score the product showed (0–100)
  cosine: number | null;
  levelFit: number | null;
  rerankFit: number | null;
  level: string; // candidate level at apply time
  jobSeniority: string; // junior / mid / senior / "" from the posting
  remote: boolean;
  postedAgeDays: number | null;
  autoApplied: boolean;
  hasReferral: boolean;
  jobModel: string;
};

const ApplicationOutcomeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate", required: true, unique: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    jobModel: { type: String, enum: ["Job", "ExternalJobs"], required: true },
    company: { type: String, default: "" },
    companyKey: { type: String, default: "", index: true },
    title: { type: String, default: "" },
    appliedAt: { type: Date, required: true },
    features: { type: mongoose.Schema.Types.Mixed, default: {} },
    outcome: { type: String, enum: OUTCOMES, default: "pending", index: true },
    reached: { type: String, enum: STAGES_REACHED, default: "none" },
    source: { type: String, enum: OUTCOME_SOURCES, default: undefined },
    /** First time we learned of any response (reply, rejection, invitation). */
    respondedAt: { type: Date, default: undefined },
    firstResponseDays: { type: Number, default: undefined },
    resolvedAt: { type: Date, default: undefined },
    /** "Did you get a reply?" prompting. */
    askedAt: { type: Date, default: undefined },
    askCount: { type: Number, default: 0 },
    /** "What did they ask?" prompting: when the stage was reached and which stages were captured / skipped. */
    stageAt: { type: Date, default: undefined },
    questionsAskedAt: { type: Date, default: undefined },
    questionsAskCount: { type: Number, default: 0 },
    questionsCaptured: { type: [String], default: [] },
    questionsSkipped: { type: [String], default: [] },
  },
  { timestamps: true }
);

ApplicationOutcomeSchema.index({ userId: 1, outcome: 1, appliedAt: 1 });
ApplicationOutcomeSchema.index({ outcome: 1, askedAt: 1, appliedAt: 1 });

export default mongoose.models.ApplicationOutcome || mongoose.model("ApplicationOutcome", ApplicationOutcomeSchema);
