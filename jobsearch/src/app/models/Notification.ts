import mongoose from "mongoose";

/**
 * In-app notification for one user. Created by the notify() helper from
 * product events (application status change, new application, new message,
 * daily job matches) and listed by /api/notifications.
 */
export const NOTIFICATION_TYPES = [
  "application_status", // recruiter changed the status of my application
  "application_received", // someone applied to a job I published
  "new_message", // new chat message
  "job_match", // new postings that match my résumé
  "system",
  "referral", // insiders network: a request for a referral, or the insider's answer
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const NotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 2000 },
    link: { type: String, default: "" }, // same-site path to open
    read: { type: Boolean, default: false },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export default mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
