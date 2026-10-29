import { AsyncLocalStorage } from "node:async_hooks";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { llmProvider, modelFor, type LlmProvider, type LlmRole } from "./models";

export type ChatOptions = {
  temperature?: number;
  /** Required in practice: Anthropic truncates at its default otherwise. */
  maxTokens?: number;
  /** The caller will JSON.parse the reply. OpenAI gets JSON mode; Anthropic relies on the prompt ("Return STRICT JSON") + extractJson. */
  json?: boolean;
  timeout?: number;
  maxRetries?: number;
  /** Force a provider for this call (A/B harnesses); otherwise the ambient/override provider. */
  provider?: LlmProvider;
};

/** Lets a harness run the same code path on another provider without touching call sites. */
const providerOverride = new AsyncLocalStorage<LlmProvider>();
export function withProvider<T>(provider: LlmProvider, fn: () => Promise<T>): Promise<T> {
  return providerOverride.run(provider, fn);
}
export const activeProvider = (): LlmProvider => providerOverride.getStore() || llmProvider();

/**
 * The one way the product builds a chat model. Picks the concrete model for
 * the role and provider, applies the same defaults everywhere, and returns a
 * LangChain chat model so call sites keep their `invoke([...messages])`.
 */
export function chatModel(role: LlmRole, opts: ChatOptions = {}): BaseChatModel {
  const provider = opts.provider || activeProvider();
  const model = modelFor(role, provider);
  const temperature = opts.temperature ?? 0.3;
  const maxTokens = opts.maxTokens ?? 4096;
  const timeout = opts.timeout ?? 60_000;
  const maxRetries = opts.maxRetries ?? 1;
  if (provider === "anthropic") {
    return new ChatAnthropic({ model, temperature, maxTokens, apiKey: process.env.ANTHROPIC_API_KEY, clientOptions: { timeout, maxRetries } });
  }
  return new ChatOpenAI({
    modelName: model,
    temperature,
    maxTokens,
    timeout,
    maxRetries,
    openAIApiKey: process.env.OPENAI_API_KEY,
    ...(opts.json ? { modelKwargs: { response_format: { type: "json_object" } } } : {}),
  });
}

/** True when the active provider has a key, i.e. LLM features can run. */
export function llmConfigured(): boolean {
  return activeProvider() === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY;
}

/** Text of a LangChain reply (Anthropic may return content blocks). */
export const replyText = (res: any): string => (typeof res?.content === "string" ? res.content : Array.isArray(res?.content) ? res.content.map((p: any) => p?.text ?? "").join("") : String(res?.content ?? ""));
