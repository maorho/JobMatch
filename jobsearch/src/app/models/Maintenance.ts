import mongoose, { Schema, model, models } from "mongoose";

const MaintenanceSchema = new Schema(
  {
    _id: { type: String, required: true }, // למשל: "externalJobsCleanup"
    lastRunAt: { type: Date },
    running: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

export default models.Maintenance || model("Maintenance", MaintenanceSchema);