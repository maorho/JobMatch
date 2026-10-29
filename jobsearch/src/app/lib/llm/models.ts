/**
 * Every text model the product uses, in one place.
 *
 * A *role* is what the call is for; the provider decides which concrete model
 * serves it. Three tiers:
 *   fast    — high-volume, mechanical work (classification, normalisation, drafts)
 *   quality — writing the person reads (résumés, articles, research)
 *   coach   — the interview coach: the interviewer's turns, the debrief, the
 *             model answers. The product's core; gets the strongest model.
 *
 * Provider: `LLM_PROVIDER=anthropic|openai`; default anthropic when
 * ANTHROPIC_API_KEY is set, else openai. Any role can be pinned with
 * LLM_MODEL_<ROLE>=<model id> regardless of provider (the id must belong to
 * the active provider).
 *
 * Not here on purpose: embeddings (text-embedding-3-small), realtime voice
 * (gpt-realtime-mini) and transcription — OpenAI-only capabilities.
 */
export type LlmProvider = "openai" | "anthropic";
export type LlmRole = "fast" | "quality" | "coach";

export const MODEL_IDS: Record<LlmProvider, Record<LlmRole, string>> = {
  openai: { fast: "gpt-4o-mini", quality: "gpt-4o", coach: "gpt-4o" },
  anthropic: { fast: "claude-haiku-4-5-20251001", quality: "claude-sonnet-5-5", coach: "claude-opus-5-5" },
};

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function llmProvider(): LlmProvider {
  const forced = clean(process.env.LLM_PROVIDER)?.toLowerCase();
  if (forced === "anthropic" || forced === "openai") return forced;
  return clean(process.env.ANTHROPIC_API_KEY) ? "anthropic" : "openai";
}

export function modelFor(role: LlmRole, provider: LlmProvider = llmProvider()): string {
  return clean(process.env[`LLM_MODEL_${role.toUpperCase()}`]) || MODEL_IDS[provider][role];
}

/** What a health check / admin page shows. */
export function describeModels(): { provider: LlmProvider; models: Record<LlmRole, string> } {
  const provider = llmProvider();
  return { provider, models: { fast: modelFor("fast", provider), quality: modelFor("quality", provider), coach: modelFor("coach", provider) } };
}
