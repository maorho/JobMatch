import mongoose from "mongoose";

/** One browser's Web Push subscription for a signed-in person (several per person: phone, laptop). */
const PushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
    lastUsedAt: { type: Date },
    failures: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.PushSubscription || mongoose.model("PushSubscription", PushSubscriptionSchema);
