import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims, multilingual

let client: OpenAI | null = null;
function getClient(): OpenAI {
  // A batch of 100 × 6k chars can take a while; a hung connection must not take a cron with it.
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, timeout: 60_000, maxRetries: 1 });
  return client;
}

/** Embed a batch of texts. Chunks requests to stay well within API limits. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const openai = getClient();
  const out: number[][] = [];
  const CHUNK = 100;
  // Char cap kept well below the model's 8192-token limit so that dense,
  // non-Latin text (e.g. Hebrew, which tokenizes to more tokens per char)
  // still fits comfortably within a single input.
  const MAX_CHARS = 6000;
  for (let i = 0; i < texts.length; i += CHUNK) {
    const batch = texts
      .slice(i, i + CHUNK)
      .map((t) => (t && t.trim() ? t.slice(0, MAX_CHARS) : " "));
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    // Order by `index` — do not assume the API returns input order.
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    for (const d of sorted) out.push(d.embedding as number[]);
  }
  return out;
}

export async function embedText(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}
