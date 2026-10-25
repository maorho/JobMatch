import mongoose from "mongoose";

/**
 * The audit trail of the Applier agent: one row per job it considered for a
 * user, whatever the outcome. The dashboard shows these; the daily cap
 * counts the "submitted" ones.
 */
/**
 * "submitting" is the claim written BEFORE the form's submit button is pressed
 * (the unique (userId, jobId) index makes it the lock). A row still in that
 * state on a later attempt means the outcome of the earlier attempt is
 * unknown — a crash or timeout between the click and the confirmation — and
 * the form must not be sent again.
 *
 * "deferred" means nothing was pressed: the apply server was down/busy before
 * any click, or this runtime has auto-apply switched off. The row carries
 * `retryAfter` (exponential backoff) and `attempts`; the Applier retries it
 * once it is due — the "submitting" claim is taken from it atomically
 * (deferred → submitting), so exactly-once still holds — and gives up as
 * "failed" after a few server-side deferrals.
 */
export const AUTO_APPLY_STATUSES = ["submitting", "submitted", "needs_user", "failed", "skipped", "deferred"] as const;
export type AutoApplyStatus = (typeof AUTO_APPLY_STATUSES)[number];

const AutoApplicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    jobModel: { type: String, enum: ["Job", "ExternalJobs"], required: true },
    jobTitle: { type: String, default: "" },
    company: { type: String, default: "" },
    url: { type: String, default: "" },
    score: { type: Number, default: 0 },
    status: { type: String, enum: AUTO_APPLY_STATUSES, required: true, index: true },
    /** ATS the form belonged to (greenhouse, lever, …) when known. */
    ats: { type: String, default: "" },
    /** Why it needs the user / failed, in plain words. */
    note: { type: String, default: "", maxlength: 1000 },
    /** How many times the applier attempted this posting (a "submitting" row seen again counts as an attempt). */
    attempts: { type: Number, default: 1 },
    /** When the claim was written (just before pressing submit). */
    claimedAt: { type: Date, default: undefined },
    /** "deferred" rows: not retried before this. */
    retryAfter: { type: Date, default: undefined },
    /** The person asked for this one explicitly (UI/MCP): a retry skips the score bar, like the original request. */
    explicit: { type: Boolean, default: undefined },
    /** The tailored résumé that was (or would be) attached. */
    resumeStructured: { type: mongoose.Schema.Types.Mixed, default: undefined, select: false },
  },
  { timestamps: true }
);

AutoApplicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });
AutoApplicationSchema.index({ userId: 1, status: 1, createdAt: -1 });
// The retry pass: due deferred rows.
AutoApplicationSchema.index({ status: 1, retryAfter: 1 }, { partialFilterExpression: { status: "deferred" } });

export default mongoose.models.AutoApplication || mongoose.model("AutoApplication", AutoApplicationSchema);
