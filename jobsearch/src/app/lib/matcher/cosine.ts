/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Map a raw cosine similarity to an intuitive 0-100 match score.
 * text-embedding-3 similarities for related job/profile text cluster roughly
 * in 0.15–0.65, so we rescale that band to 0–100 (clamped). Heuristic, tune later.
 */
export function toMatchScore(cosine: number): number {
  const lo = 0.15;
  const hi = 0.65;
  const pct = ((cosine - lo) / (hi - lo)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
