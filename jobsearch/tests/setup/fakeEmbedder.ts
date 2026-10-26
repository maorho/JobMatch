/**
 * Deterministic stand-in for OpenAI embeddings.
 *
 * Hashes each lower-cased token into one of DIM buckets (bag-of-words), then
 * L2-normalises. Texts that share vocabulary ("react", "frontend") land close
 * together, unrelated texts far apart — enough to test that a React résumé
 * ranks React jobs first, with zero network and perfectly repeatable results.
 * Vectors are tiny (DIM=64) so scale suites can hold tens of thousands.
 */
export const DIM = 64;

function hash(word: string): number {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % DIM;
}

export function fakeEmbed(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  const tokens = (text || "")
    .toLowerCase()
    .split(/[^a-z0-9֐-׿+#.]+/)
    .filter((t) => t.length > 1);
  for (const t of tokens) v[hash(t)] += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  return texts.map((t) => fakeEmbed(t));
}

export async function embedText(text: string): Promise<number[]> {
  return fakeEmbed(text);
}

export const EMBEDDING_MODEL = "fake-bag-of-words-64";
