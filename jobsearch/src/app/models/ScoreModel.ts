import mongoose from "mongoose";

/**
 * Trained weights for a product score (today: "interview_likelihood").
 * One document per model id; retrained by the outcome loop, read with a
 * short in-memory cache by lib/matcher/likelihood.ts.
 */
const ScoreModelSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    version: { type: Number, default: 1 },
    featureNames: { type: [String], default: [] },
    weights: { type: [Number], default: [] },
    /** Per-feature mean / std used to standardise inputs. */
    means: { type: [Number], default: [] },
    stds: { type: [Number], default: [] },
    samples: { type: Number, default: 0 },
    positives: { type: Number, default: 0 },
    baseRate: { type: Number, default: 0 },
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    trainedAt: { type: Date, default: undefined },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.models.ScoreModel || mongoose.model("ScoreModel", ScoreModelSchema);
