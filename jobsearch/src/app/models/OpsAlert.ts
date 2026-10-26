import mongoose from "mongoose";

/**
 * Dedup memory for operational alerts (lib/ops/alerts.ts): one row per alert
 * key with when it was last sent. Lives in Mongo rather than a module-level
 * map because every warm lambda would otherwise send its own copy.
 *
 * The alert key IS the _id: dedup then rests on the always-present _id index
 * instead of a secondary unique index that only exists once sync-indexes ran.
 */
const OpsAlertSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // the alert key
    lastSentAt: { type: Date, required: true },
    title: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.OpsAlert || mongoose.model("OpsAlert", OpsAlertSchema);
