/**
 * Every text model the product uses, in one place.
 *
 * A *role* is what the call is for; the provider decides which concrete model
 * serves it. Three tiers:
 *   fast    — high-volume, mechanical work (classification, normalisation, drafts)
 *   quality — writing the person reads (résumés, articles, research)
 *   coach   — the interview coach: the interviewer's turns, the debrief, the
 *             model answers. The product's core; gets the strongest model.
 *             Chosen on 2026-10-29 by replaying one real HR interview on four
 *             Claude models (scripts/interviewer-models.ts): Opus 5.5 was the
 *             only one that was warm and professional, asked one question per
 *             turn, re-asked an unanswered question once and then moved on,
 *             corrected the candidate's misattributions, and never stated a
 *             fact that wasn't in the brief. Fable 5.1 probed hardest but
 *             invented two facts and was slowest; Sonnet 5.5 turned curt;
 *             Haiku 4.5 wrote broken Hebrew and ignored the résumé mismatch.
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

/** The provider a model id belongs to, when the id says so (claude-* / gpt-*, o-series); null for an unknown pattern. */
export function providerOfModel(model: string): LlmProvider | null {
  if (/^claude-/.test(model)) return "anthropic";
  if (/^(gpt-|o\d|chatgpt-)/.test(model)) return "openai";
  return null;
}

/**
 * The provider that serves a role: a pinned LLM_MODEL_<ROLE> decides by its
 * id (so LLM_MODEL_COACH=gpt-6.1-sol runs the coach on OpenAI while the rest
 * stays on Claude), otherwise the ambient provider.
 */
export function providerFor(role: LlmRole, ambient: LlmProvider = llmProvider()): LlmProvider {
  const pinned = clean(process.env[`LLM_MODEL_${role.toUpperCase()}`]);
  return (pinned && providerOfModel(pinned)) || ambient;
}

/** What a health check / admin page shows. */
export function describeModels(): { provider: LlmProvider; models: Record<LlmRole, string>; providers: Record<LlmRole, LlmProvider> } {
  const provider = llmProvider();
  const roles: LlmRole[] = ["fast", "quality", "coach"];
  const models = Object.fromEntries(roles.map((r) => [r, modelFor(r, providerFor(r, provider))])) as Record<LlmRole, string>;
  const providers = Object.fromEntries(roles.map((r) => [r, providerFor(r, provider)])) as Record<LlmRole, LlmProvider>;
  return { provider, models, providers };
}
