import { AsyncLocalStorage } from "node:async_hooks";
import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { BaseMessage } from "@langchain/core/messages";
import { llmProvider, modelFor, providerFor, type LlmProvider, type LlmRole } from "./models";
import { recordUsage } from "./usageMeter";
import { spendAllowed } from "@/app/lib/ops/costMonitor";

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

/** GPT-5 and later (and the o-series) take `max_completion_tokens`, no `temperature`, and reason before answering. */
export const isNextGenOpenAI = (model: string) => /^(gpt-[5-9]|gpt-\d{2}|o\d)/.test(model);

/**
 * Current GPT models through the OpenAI SDK: the LangChain client we have
 * still sends `max_tokens`/`temperature`, which these models reject.
 */
export class OpenAIChat implements ChatLike {
  readonly model: string;
  readonly maxTokens: number;
  private client: OpenAI;
  constructor(private readonly opts: { model: string; maxTokens: number; timeout: number; maxRetries: number; json?: boolean }) {
    this.model = opts.model;
    this.maxTokens = opts.maxTokens;
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: opts.timeout, maxRetries: opts.maxRetries });
  }
  async invoke(messages: BaseMessage[]): Promise<ChatReply> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: this.maxTokens,
      messages: messages.map((m) => ({ role: roleOf(m), content: textOf(m) })),
      ...(this.opts.json ? { response_format: { type: "json_object" as const } } : {}),
    });
    const choice = res.choices[0];
    const u: any = res.usage;
    return {
      content: choice?.message?.content || "",
      response_metadata: { finish_reason: choice?.finish_reason ?? undefined, model: res.model, usage: u && { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens, cache_read_input_tokens: u.prompt_tokens_details?.cached_tokens || 0, reasoning_tokens: u.completion_tokens_details?.reasoning_tokens || 0 } },
    };
  }
}

/** Token usage of one call, for the cost meter and the model harnesses. */
export type LlmUsage = { provider: LlmProvider; model: string; role: LlmRole; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
const usageListeners = new Set<(u: LlmUsage) => void>();
export function onLlmUsage(fn: (u: LlmUsage) => void): () => void {
  usageListeners.add(fn);
  return () => usageListeners.delete(fn);
}
function usageOf(res: any): Omit<LlmUsage, "provider" | "model" | "role"> | null {
  const a = res?.response_metadata?.usage; // our adapters (Anthropic field names)
  const l = res?.usage_metadata; // LangChain's ChatOpenAI
  if (a && typeof a.input_tokens === "number") return { inputTokens: a.input_tokens, outputTokens: a.output_tokens || 0, cacheReadTokens: a.cache_read_input_tokens || 0, cacheWriteTokens: a.cache_creation_input_tokens || 0 };
  if (l && typeof l.input_tokens === "number") return { inputTokens: l.input_tokens, outputTokens: l.output_tokens || 0, cacheReadTokens: l.input_token_details?.cache_read || 0, cacheWriteTokens: 0 };
  return null;
}
/** Thrown when today's spend reached COST_HARD_CAP_DAILY_USD (lib/ops/costMonitor.ts): the product's circuit breaker. */
export class SpendCapError extends Error {
  constructor(public readonly today: number, public readonly cap: number) {
    super(`AI features are paused: today's spend $${today} reached the daily cap of $${cap}`);
    this.name = "SpendCapError";
  }
}

class Metered implements ChatLike {
  constructor(readonly inner: ChatLike, private readonly tag: { provider: LlmProvider; model: string; role: LlmRole }) {}
  async invoke(messages: BaseMessage[]): Promise<ChatReply> {
    const gate = await spendAllowed();
    if (!gate.allowed) throw new SpendCapError(gate.today, gate.cap);
    const res = await this.inner.invoke(messages);
    const u = usageListeners.size ? usageOf(res) : null;
    if (u) for (const fn of usageListeners) fn({ ...this.tag, ...u });
    return res;
  }
}

/**
 * The one way the product builds a chat model. Picks the concrete model for
 * the role and provider and applies the same defaults everywhere; call sites
 * keep their `invoke([...messages])`.
 */
export function chatModel(role: LlmRole, opts: ChatOptions = {}): ChatLike {
  // A pinned model id picks its own provider (LLM_MODEL_COACH=gpt-6.1-sol next to Claude for the rest); a harness override wins.
  const provider = opts.provider || (providerOverride.getStore() ? activeProvider() : providerFor(role, activeProvider()));
  const model = modelFor(role, provider);
  const temperature = opts.temperature ?? 0.3;
  const maxTokens = opts.maxTokens ?? 4096;
  const timeout = opts.timeout ?? 60_000;
  const maxRetries = opts.maxRetries ?? 1;
  const build = (budget: number): ChatLike => {
    // Claude's thinking shares the output budget, so a budget sized for the visible answer alone would cut it off.
    if (provider === "anthropic") return new AnthropicChat({ model, maxTokens: Math.max(budget, 1500), temperature, timeout, maxRetries });
    if (isNextGenOpenAI(model)) return new OpenAIChat({ model, maxTokens: Math.max(budget, 1500), timeout, maxRetries, json: opts.json }); // reasoning shares the budget here too
    return new ChatOpenAI({
      modelName: model,
      temperature,
      maxTokens: budget,
      timeout,
      maxRetries,
      openAIApiKey: process.env.OPENAI_API_KEY,
      ...(opts.json ? { modelKwargs: { response_format: { type: "json_object" } } } : {}),
    }) as unknown as ChatLike;
  };
  const metered = (budget: number): ChatLike => new Metered(build(budget), { provider, model, role }); // always: the meter and the cap
  // A reply the caller will parse is useless when cut off: grow the budget and ask again rather than fail on a half JSON.
  return opts.json ? new GrowOnTruncate(metered, maxTokens, OUTPUT_CEILING[provider], model) : metered(maxTokens);
}

/** Output caps a retry may grow to: gpt-4o's hard limit; Claude's is far higher but minutes of generation time out first. */
export const OUTPUT_CEILING: Record<LlmProvider, number> = { openai: 16_384, anthropic: 16_000 };

export class LlmTruncatedError extends Error {
  constructor(public readonly model: string, public readonly maxTokens: number) {
    super(`${model} output was cut off at ${maxTokens} tokens`);
    this.name = "LlmTruncatedError";
  }
}
export const isTruncated = (r: ChatReply | any): boolean => r?.response_metadata?.stop_reason === "max_tokens" || r?.response_metadata?.finish_reason === "length" || r?.additional_kwargs?.finish_reason === "length";

/**
 * Every JSON-producing call goes through this: Hebrew costs Claude ~1.7
 * characters per token, so budgets sized for English (or for GPT-4o) cut
 * replies mid-array — "Expected ',' or ']' after array element" — in the
 * debrief, the suggested answers and the prep plan before this existed.
 * A cut-off reply is retried with double the budget (up to the ceiling);
 * a reply still cut off is a clear LlmTruncatedError, never a parse error.
 */
export class GrowOnTruncate implements ChatLike {
  readonly inner: ChatLike;
  constructor(private readonly build: (maxTokens: number) => ChatLike, readonly maxTokens: number, readonly ceiling: number, readonly model: string) {
    this.inner = build(maxTokens);
  }
  async invoke(messages: BaseMessage[]): Promise<ChatReply> {
    let budget = this.maxTokens;
    let res = await this.inner.invoke(messages);
    while (isTruncated(res) && budget < this.ceiling) {
      const grown = Math.min(budget * 2, this.ceiling);
      console.warn(`[llm] ${this.model} output cut at ${budget} tokens; retrying with ${grown}`);
      budget = grown;
      res = await this.build(budget).invoke(messages);
    }
    if (isTruncated(res)) throw new LlmTruncatedError(this.model, budget);
    return res;
  }
}

/** True when the active provider has a key, i.e. LLM features can run. */
export function llmConfigured(): boolean {
  return activeProvider() === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY;
}

// The spend ledger listens to every chat call (lib/llm/usageMeter.ts); harnesses may add their own listeners.
onLlmUsage((u) => void recordUsage({ provider: u.provider, model: u.model, role: u.role, inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens }));
