import mongoose from "mongoose";

/** One skill-gap report per computation: the user's market slice, demand per technology, and the model's short reading of it (lib/skills/gap.ts). */
const SkillGapReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    slice: {
      roles: { type: [String], default: [] },
      level: { type: String, default: "" },
      cities: { type: [String], default: [] },
      jobs: { type: Number, default: 0 },
    },
    skills: { type: [{ name: String, count: Number, demandPct: Number, have: Boolean }], default: [] },
    widened: { type: String, default: null }, // "cities" | "level" | null
    summary: { type: String, default: "", maxlength: 600 }, // Hebrew
    summaryEn: { type: String, default: "", maxlength: 600 },
    priorities: { type: [String], default: [] }, // up to 3 skill names to work on, in order
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

SkillGapReportSchema.index({ userId: 1, createdAt: -1 }); // "the user's latest report"

export default mongoose.models.SkillGapReport || mongoose.model("SkillGapReport", SkillGapReportSchema);
