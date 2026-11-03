/**
 * What a model call costs, in USD. Prices are per million tokens from the
 * providers' price pages (checked 2026-11-01); an unknown model falls back to
 * LLM_PRICE_DEFAULT_IN/OUT and is flagged `estimated`, so a new model can
 * never make the meter read zero.
 */
export type Price = { in: number; out: number; cacheRead?: number; cacheWrite?: number };

export const PRICES: Record<string, Price> = {
  // Anthropic (cache hits 0.05× on 5.5, 0.1× on 4.5; 5-minute cache writes 1.25×)
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-fable-5-1": { in: 10, out: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  // OpenAI
  "gpt-6-astra": { in: 10, out: 50 },
  "gpt-6.1-sol": { in: 2, out: 10 },
  "gpt-6-sol": { in: 2, out: 10 },
  "gpt-6.1-terra": { in: 1, out: 5 },
  "gpt-6-luna": { in: 0.1, out: 0.5 },
  "gpt-5.5": { in: 5, out: 30 },
  "gpt-5.4": { in: 2.5, out: 15 },
  "gpt-5.2": { in: 1.75, out: 14 },
  "gpt-5.1": { in: 1.25, out: 10 },
  "gpt-5": { in: 1.25, out: 10 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "text-embedding-3-small": { in: 0.02, out: 0 },
  "text-embedding-3-large": { in: 0.13, out: 0 },
};

/** Flat charges for things that are not tokens. */
export const FLAT_USD = {
  /** One web-search tool call in the research agent (OpenAI charges per call). */
  webSearch: Number(process.env.COST_WEB_SEARCH_USD || 0.01),
  /** A realtime voice interview session (audio in/out billed per minute; ~10 min on gpt-realtime-mini). */
  voiceSession: Number(process.env.COST_VOICE_SESSION_USD || 0.6),
  /** A phone interview session (voice + Twilio minutes). */
  phoneSession: Number(process.env.COST_PHONE_SESSION_USD || 1.0),
};

const DEFAULT_IN = Number(process.env.LLM_PRICE_DEFAULT_IN || 2);
const DEFAULT_OUT = Number(process.env.LLM_PRICE_DEFAULT_OUT || 10);

/** Match "gpt-4o-2024-08-06" to "gpt-4o", "claude-sonnet-5-5-20260301" to "claude-sonnet-5-5". */
export function priceFor(model: string): { price: Price; estimated: boolean } {
  const m = (model || "").toLowerCase();
  if (PRICES[m]) return { price: PRICES[m], estimated: false };
  const known = Object.keys(PRICES)
    .filter((k) => m.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (known) return { price: PRICES[known], estimated: false };
  return { price: { in: DEFAULT_IN, out: DEFAULT_OUT }, estimated: true };
}

export function costOf(model: string, tokens: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }): { usd: number; estimated: boolean } {
  const { price, estimated } = priceFor(model);
  const inTok = Math.max(0, (tokens.input || 0) - (tokens.cacheRead || 0) - (tokens.cacheWrite || 0));
  const usd =
    (inTok * price.in + (tokens.output || 0) * price.out + (tokens.cacheRead || 0) * (price.cacheRead ?? price.in) + (tokens.cacheWrite || 0) * (price.cacheWrite ?? price.in)) / 1e6;
  return { usd, estimated };
}
