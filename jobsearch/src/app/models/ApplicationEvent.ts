import mongoose from "mongoose";

/**
 * Timeline entry for a user's job application: a status change detected
 * from an email (or set manually/by a recruiter). One per source email.
 */
const ApplicationEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate", default: undefined }, // matched application, if any
    source: { type: String, enum: ["email", "recruiter", "manual"], required: true },
    status: { type: String, default: "" }, // Candidates status enum value, "" when unknown
    company: { type: String, default: "" },
    roleTitle: { type: String, default: "" },
    summary: { type: String, default: "", maxlength: 1000 },
    confidence: { type: Number, default: 0 },
    emailId: { type: String, default: undefined },
    emailFrom: { type: String, default: "" },
    emailSubject: { type: String, default: "" },
    emailDate: { type: Date, default: undefined },
    applied: { type: Boolean, default: false }, // did we change the application's status?
  },
  { timestamps: true }
);

ApplicationEventSchema.index({ userId: 1, emailId: 1 }, { unique: true, partialFilterExpression: { emailId: { $type: "string" } } });
ApplicationEventSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.ApplicationEvent || mongoose.model("ApplicationEvent", ApplicationEventSchema);
