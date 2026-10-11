import { connectToDatabase } from "@/app/lib/db";
import ApplicationOutcome, { type OutcomeFeatures } from "@/app/models/ApplicationOutcome";
import ScoreModel from "@/app/models/ScoreModel";
import { isPositive } from "@/app/lib/outcomes/outcomes";

/**
 * "Interview likelihood" — the number the product shows instead of a cosine.
 *
 * A logistic regression over the features frozen at apply time
 * (ApplicationOutcome.features), trained on what actually happened
 * (reached ≥ screen = positive). With few outcomes the prediction is pulled
 * toward a calibrated prior derived from the match score, so the score is
 * sensible on day one and becomes JobMatch's own as the data accumulates:
 *   p = (1 − α)·prior + α·learned,  α = n / (n + SHRINK)
 */
export const MODEL_ID = "interview_likelihood";
export const MIN_SAMPLES = 20;
export const SHRINK = 40;
const CACHE_MS = 5 * 60_000;

export const FEATURE_NAMES = ["score", "cosine", "levelFit", "rerankFit", "levelJunior", "levelSenior", "seniorityMatch", "overqualified", "remote", "postedAge", "autoApplied", "hasReferral"] as const;

const LEVEL_RANK: Record<string, number> = { junior: 0, mid: 1, senior: 2 };

/** Numeric feature vector (no bias; added by the model). */
export function featureVector(f: Partial<OutcomeFeatures>): number[] {
  const score = f.matchScore ?? f.rerankFit ?? 50;
  const cand = LEVEL_RANK[f.level || ""] ?? 1;
  const job = LEVEL_RANK[f.jobSeniority || ""];
  return [
    score / 100,
    f.cosine ?? 0.5,
    f.levelFit ?? 0.7,
    (f.rerankFit ?? score) / 100,
    f.level === "junior" ? 1 : 0,
    f.level === "senior" ? 1 : 0,
    job !== undefined && job === cand ? 1 : 0,
    job !== undefined && cand > job ? 1 : 0,
    f.remote ? 1 : 0,
    Math.min(1, Math.log1p(f.postedAgeDays ?? 7) / Math.log1p(60)),
    f.autoApplied ? 1 : 0,
    f.hasReferral ? 1 : 0,
  ];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Prior from the shown score alone: 90 → ~41%, 75 → 25%, 60 → ~9%, 40 → ~2%.
 * Roughly the response rates junior candidates see in Israel's market; the
 * learned model replaces it as outcomes accumulate.
 */
export const priorLikelihood = (score: number | null | undefined) => 0.5 * sigmoid(((score ?? 50) - 75) / 10);

export type TrainedModel = { featureNames: string[]; weights: number[]; means: number[]; stds: number[]; samples: number; positives: number; baseRate: number; metrics: Record<string, number>; trainedAt?: Date };

/** Logistic regression by batch gradient descent with L2; inputs standardised. Pure, deterministic. */
export function fitLogistic(X: number[][], y: number[], opts: { epochs?: number; lr?: number; l2?: number } = {}): { weights: number[]; means: number[]; stds: number[] } {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const means = Array(d).fill(0);
  const stds = Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    const col = X.map((r) => r[j]);
    means[j] = col.reduce((a, b) => a + b, 0) / n;
    const v = col.reduce((a, b) => a + (b - means[j]) ** 2, 0) / n;
    // A constant feature (std ≈ 0 up to float noise) must not blow up z-scores at prediction time.
    stds[j] = Math.sqrt(v) > 1e-6 ? Math.sqrt(v) : 1;
  }
  const Z = X.map((r) => r.map((v, j) => (v - means[j]) / stds[j]));
  const w = Array(d + 1).fill(0); // last = bias
  const lr = opts.lr ?? 0.1;
  const l2 = opts.l2 ?? 0.05;
  const epochs = opts.epochs ?? 400;
  for (let e = 0; e < epochs; e++) {
    const grad = Array(d + 1).fill(0);
    for (let i = 0; i < n; i++) {
      let z = w[d];
      for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < d; j++) grad[j] += err * Z[i][j];
      grad[d] += err;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (grad[j] / n + l2 * w[j]);
    w[d] -= lr * (grad[d] / n);
  }
  return { weights: w, means, stds };
}

export function predictLearned(m: Pick<TrainedModel, "weights" | "means" | "stds">, x: number[]): number {
  const d = m.means.length;
  let z = m.weights[d] ?? 0;
  for (let j = 0; j < d; j++) z += (m.weights[j] ?? 0) * ((x[j] - m.means[j]) / (m.stds[j] > 1e-6 ? m.stds[j] : 1));
  return sigmoid(z);
}

/** Area under the ROC curve (rank-based), for the training report. */
export function auc(scores: number[], labels: number[]): number {
  const pos = scores.filter((_, i) => labels[i] === 1);
  const neg = scores.filter((_, i) => labels[i] === 0);
  if (!pos.length || !neg.length) return 0.5;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

let cache: { model: TrainedModel | null; at: number } | null = null;

export async function loadModel(opts: { fresh?: boolean } = {}): Promise<TrainedModel | null> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.model;
  await connectToDatabase();
  const doc: any = await ScoreModel.findById(MODEL_ID).lean();
  const model = doc && doc.samples >= MIN_SAMPLES ? { featureNames: doc.featureNames, weights: doc.weights, means: doc.means, stds: doc.stds, samples: doc.samples, positives: doc.positives, baseRate: doc.baseRate, metrics: doc.metrics || {}, trainedAt: doc.trainedAt } : null;
  cache = { model, at: Date.now() };
  return model;
}

export const resetModelCache = () => {
  cache = null;
};

/** Train on every resolved outcome. Stores the model; returns the report (or null when there's too little data). */
export async function trainLikelihood(opts: { minSamples?: number } = {}): Promise<{ samples: number; positives: number; auc: number; logLoss: number; trained: boolean }> {
  await connectToDatabase();
  const rows: any[] = await ApplicationOutcome.find({ outcome: { $ne: "pending" } }).select("features reached").lean();
  const X = rows.map((r) => featureVector(r.features || {}));
  const y: number[] = rows.map((r) => (isPositive(r.reached) ? 1 : 0));
  const positives = y.reduce((a, b) => a + b, 0);
  const minSamples = opts.minSamples ?? MIN_SAMPLES;
  if (rows.length < minSamples || positives === 0 || positives === rows.length) {
    await ScoreModel.updateOne({ _id: MODEL_ID }, { $set: { samples: rows.length, positives, baseRate: rows.length ? positives / rows.length : 0, metrics: { note: "not enough data" } } }, { upsert: true });
    resetModelCache();
    return { samples: rows.length, positives, auc: 0.5, logLoss: 0, trained: false };
  }
  const fit = fitLogistic(X, y);
  const p = X.map((x) => predictLearned(fit, x));
  const logLoss = -p.reduce((a, pi, i) => a + (y[i] ? Math.log(Math.max(pi, 1e-9)) : Math.log(Math.max(1 - pi, 1e-9))), 0) / p.length;
  const metrics = { auc: Number(auc(p, y).toFixed(3)), logLoss: Number(logLoss.toFixed(3)) };
  await ScoreModel.updateOne({ _id: MODEL_ID }, { $set: { version: 1, featureNames: [...FEATURE_NAMES], weights: fit.weights, means: fit.means, stds: fit.stds, samples: rows.length, positives, baseRate: positives / rows.length, metrics, trainedAt: new Date() } }, { upsert: true });
  resetModelCache();
  return { samples: rows.length, positives, auc: metrics.auc, logLoss: metrics.logLoss, trained: true };
}

export type Likelihood = { pct: number; basis: "prior" | "blended" | "learned"; samples: number };

/** The score for one (candidate, job) pair, given the same features the outcome rows store. */
export function likelihoodFrom(model: TrainedModel | null, f: Partial<OutcomeFeatures>): Likelihood {
  const prior = priorLikelihood(f.matchScore ?? f.rerankFit);
  if (!model) return { pct: Math.round(prior * 100), basis: "prior", samples: 0 };
  const learned = predictLearned(model, featureVector(f));
  const alpha = model.samples / (model.samples + SHRINK);
  const p = (1 - alpha) * prior + alpha * learned;
  return { pct: Math.round(Math.max(0.01, Math.min(0.95, p)) * 100), basis: alpha > 0.8 ? "learned" : "blended", samples: model.samples };
}

export async function interviewLikelihood(f: Partial<OutcomeFeatures>): Promise<Likelihood> {
  return likelihoodFrom(await loadModel(), f);
}

/** Model status for the admin/settings UI. */
export async function likelihoodStatus(): Promise<{ samples: number; positives: number; baseRate: number; trainedAt: Date | null; metrics: Record<string, number>; active: boolean; weights: Record<string, number> }> {
  await connectToDatabase();
  const doc: any = await ScoreModel.findById(MODEL_ID).lean();
  const weights: Record<string, number> = {};
  if (doc?.featureNames?.length) doc.featureNames.forEach((n: string, i: number) => (weights[n] = Number((doc.weights[i] ?? 0).toFixed(3))));
  return { samples: doc?.samples ?? 0, positives: doc?.positives ?? 0, baseRate: doc?.baseRate ?? 0, trainedAt: doc?.trainedAt ?? null, metrics: doc?.metrics ?? {}, active: !!doc && doc.samples >= MIN_SAMPLES && !!doc.weights?.length, weights };
}
