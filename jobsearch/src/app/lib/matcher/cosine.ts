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
 * Map a raw cosine similarity to a 0-100 match score.
 *
 * Measured on text-embedding-3-small with real résumés: a software profile's
 * top-600 recall pool sits in 0.75–0.82, with the best matches at the top of
 * that band and unrelated-but-"techy" postings (front desk, field ops) at the
 * bottom. The old 0.15–0.65 band saturated the whole pool at 100%. Piecewise
 * so the realistic band spreads over ~50–80 — the semantic signal alone never
 * claims a "strong fit" (85+ is reserved for the LLM reranker's verdict) —
 * while low cosines (test embedders, unrelated domains) still order sensibly.
 */
const BAND: [number, number][] = [
  [0.3, 0],
  [0.7, 35],
  [0.86, 80],
  [1.0, 100],
];
export function toMatchScore(cosine: number): number {
  if (!(cosine > BAND[0][0])) return 0;
  for (let i = 1; i < BAND.length; i++) {
    const [c0, s0] = BAND[i - 1];
    const [c1, s1] = BAND[i];
    if (cosine <= c1) return Math.round(s0 + ((cosine - c0) / (c1 - c0)) * (s1 - s0));
  }
  return 100;
}
