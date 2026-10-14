import mongoose from "mongoose";

/**
 * Dedup memory for operational alerts (lib/ops/alerts.ts): one row per alert
 * key with when it was last sent. Lives in Mongo rather than a module-level
 * map because every warm lambda would otherwise send its own copy.
 */
const OpsAlertSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    lastSentAt: { type: Date, required: true },
    title: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.OpsAlert || mongoose.model("OpsAlert", OpsAlertSchema);
