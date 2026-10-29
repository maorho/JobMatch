import { AsyncLocalStorage } from "node:async_hooks";
import { ChatOpenAI } from "@langchain/openai";
import Anthropic from "@anthropic-ai/sdk";
import type { BaseMessage } from "@langchain/core/messages";
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

/** What every call site needs: `invoke(messages)` → a reply with `.content`. */
export type ChatReply = { content: string; response_metadata?: { finish_reason?: string; stop_reason?: string; model?: string; usage?: unknown } };
export type ChatLike = { invoke(messages: BaseMessage[]): Promise<ChatReply> };

/** Lets a harness run the same code path on another provider without touching call sites. */
const providerOverride = new AsyncLocalStorage<LlmProvider>();
export function withProvider<T>(provider: LlmProvider, fn: () => Promise<T>): Promise<T> {
  return providerOverride.run(provider, fn);
}
export const activeProvider = (): LlmProvider => providerOverride.getStore() || llmProvider();

const roleOf = (m: BaseMessage): "system" | "user" | "assistant" => {
  const t = typeof (m as any)._getType === "function" ? (m as any)._getType() : (m as any).type;
  return t === "system" ? "system" : t === "ai" ? "assistant" : "user";
};
const textOf = (m: BaseMessage): string => (typeof m.content === "string" ? m.content : (m.content as any[]).map((p) => p?.text ?? "").join(""));

/**
 * Claude through the Anthropic SDK (the LangChain integration predates the
 * current models). Same `invoke` shape as ChatOpenAI; system messages become
 * the `system` field, consecutive same-role turns are merged as the API requires.
 */
export class AnthropicChat implements ChatLike {
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  private client: Anthropic;
  constructor(opts: { model: string; maxTokens: number; temperature: number; timeout: number; maxRetries: number }) {
    this.model = opts.model;
    this.maxTokens = opts.maxTokens;
    this.temperature = opts.temperature;
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: opts.timeout, maxRetries: opts.maxRetries });
  }
  async invoke(messages: BaseMessage[]): Promise<ChatReply> {
    const system = messages.filter((m) => roleOf(m) === "system").map(textOf).join("\n\n");
    const turns: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of messages) {
      const role = roleOf(m);
      if (role === "system") continue;
      const text = textOf(m);
      if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += `\n\n${text}`;
      else turns.push({ role, content: text });
    }
    if (turns.length === 0 || turns[0].role !== "user") turns.unshift({ role: "user", content: "(begin)" });
    // The current Messages API takes no temperature; the model's default sampling is used (the field is kept for introspection).
    const res = await this.client.messages.create({ model: this.model, max_tokens: this.maxTokens, ...(system ? { system } : {}), messages: turns });
    const content = res.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    return { content, response_metadata: { stop_reason: res.stop_reason ?? undefined, model: res.model, usage: res.usage } };
  }
}

/**
 * The one way the product builds a chat model. Picks the concrete model for
 * the role and provider and applies the same defaults everywhere; call sites
 * keep their `invoke([...messages])`.
 */
export function chatModel(role: LlmRole, opts: ChatOptions = {}): ChatLike {
  const provider = opts.provider || activeProvider();
  const model = modelFor(role, provider);
  const temperature = opts.temperature ?? 0.3;
  const maxTokens = opts.maxTokens ?? 4096;
  const timeout = opts.timeout ?? 60_000;
  const maxRetries = opts.maxRetries ?? 1;
  // Claude's thinking shares the output budget, so a budget sized for the visible answer alone would cut it off.
  if (provider === "anthropic") return new AnthropicChat({ model, maxTokens: Math.max(maxTokens, 1500), temperature, timeout, maxRetries });
  return new ChatOpenAI({
    modelName: model,
    temperature,
    maxTokens,
    timeout,
    maxRetries,
    openAIApiKey: process.env.OPENAI_API_KEY,
    ...(opts.json ? { modelKwargs: { response_format: { type: "json_object" } } } : {}),
  }) as unknown as ChatLike;
}

/** True when the active provider has a key, i.e. LLM features can run. */
export function llmConfigured(): boolean {
  return activeProvider() === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY;
}
