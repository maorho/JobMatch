/**
 * Every text model the product uses, in one place.
 *
 * A *role* is what the call is for; the provider decides which concrete model
 * serves it. Three tiers:
 *   fast    — high-volume, mechanical work (classification, normalisation, drafts)
 *   quality — writing the person reads (résumés, articles, research)
 *   coach   — the debrief and the model answers: the coach's written work.
 *   interviewer — the live turns of the mock interview (simulator and the
 *             practice chat). Chosen on 2026-11-01 by replaying one real HR
 *             interview (scripts/interviewer-models.ts) with cost per run:
 *             Opus 5.5 was the warmest and most persistent ($0.24/interview,
 *             7 s/turn); gpt-6.1-sol kept every rule (one question per turn,
 *             corrected the candidate's misattributions, invented nothing) at
 *             a quarter of the price ($0.06, 4.5 s/turn) and was picked;
 *             gpt-6.1-terra repeated itself; gpt-6-luna invented a fact.
 *             An earlier Claude-only round (2026-10-29): Sonnet 5.5 curt,
 *             Haiku 4.5 broken Hebrew, Fable 5.1 invented facts.
 *             The default is the same GPT id under both providers: a pinned
 *             or default id picks its own provider (providerFor).
 *
 * Provider: `LLM_PROVIDER=anthropic|openai`; default anthropic when
 * ANTHROPIC_API_KEY is set, else openai. Any role can be pinned with
 * LLM_MODEL_<ROLE>=<model id>; a claude-* id runs on Anthropic and a gpt-* id
 * on OpenAI whatever the ambient provider is (providerFor), so one role can
 * move without the others.
 *
 * Not here on purpose: embeddings (text-embedding-3-small), realtime voice
 * (gpt-realtime-mini) and transcription — OpenAI-only capabilities.
 */
export type LlmProvider = "openai" | "anthropic";
export type LlmRole = "fast" | "quality" | "coach" | "interviewer";

export const MODEL_IDS: Record<LlmProvider, Record<LlmRole, string>> = {
  openai: { fast: "gpt-4o-mini", quality: "gpt-4o", coach: "gpt-4o", interviewer: "gpt-6.1-sol" },
  anthropic: { fast: "claude-haiku-4-5-20251001", quality: "claude-sonnet-5-5", coach: "claude-opus-5-5", interviewer: "gpt-6.1-sol" },
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
  return providerOfModel(modelFor(role, ambient)) || ambient; // pinned id, else the role's default under the ambient provider
}

/** What a health check / admin page shows. */
export function describeModels(): { provider: LlmProvider; models: Record<LlmRole, string>; providers: Record<LlmRole, LlmProvider> } {
  const provider = llmProvider();
  const roles: LlmRole[] = ["fast", "quality", "coach", "interviewer"];
  const models = Object.fromEntries(roles.map((r) => [r, modelFor(r, providerFor(r, provider))])) as Record<LlmRole, string>;
  const providers = Object.fromEntries(roles.map((r) => [r, providerFor(r, provider)])) as Record<LlmRole, LlmProvider>;
  return { provider, models, providers };
}
