import { describe, it, expect, afterEach, vi } from "vitest";

const ENV = ["ANTHROPIC_API_KEY", "LLM_PROVIDER", "LLM_MODEL_FAST", "LLM_MODEL_QUALITY", "LLM_MODEL_COACH", "LLM_MODEL_INTERVIEWER"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV) saved[k] = process.env[k];
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
});

const load = () => import("@/app/lib/llm/models");

describe("LLM registry", () => {
  it("defaults to OpenAI without an Anthropic key, and to Claude with one", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.LLM_PROVIDER;
    let m = await load();
    expect(m.llmProvider()).toBe("openai");
    expect(m.modelFor("coach")).toBe("gpt-4o");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    vi.resetModules();
    m = await load();
    expect(m.llmProvider()).toBe("anthropic");
    expect(m.modelFor("fast")).toMatch(/^claude-haiku/);
    expect(m.modelFor("quality")).toBe("claude-sonnet-5-5");
    expect(m.modelFor("coach")).toBe("claude-opus-5-5");
    delete process.env.LLM_MODEL_INTERVIEWER; // vitest pins gpt-4o for the fakes
    expect(m.modelFor("interviewer")).toBe("gpt-6.1-sol"); // the same under both providers
    expect(m.providerFor("interviewer")).toBe("openai");
  });

  it("honours LLM_PROVIDER and per-tier pins", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_MODEL_COACH = "gpt-4.1";
    const m = await load();
    expect(m.llmProvider()).toBe("openai");
    expect(m.modelFor("coach")).toBe("gpt-4.1");
    expect(m.modelFor("fast")).toBe("gpt-4o-mini");
    expect(m.describeModels()).toEqual({ provider: "openai", models: { fast: "gpt-4o-mini", quality: "gpt-4o", coach: "gpt-4.1", interviewer: "gpt-4o" }, providers: { fast: "openai", quality: "openai", coach: "openai", interviewer: "openai" } });
  });

  it("a pinned model id picks its own provider, so one role can run on OpenAI while the rest stays on Claude", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.LLM_PROVIDER;
    process.env.LLM_MODEL_COACH = "gpt-6.1-sol";
    const m = await load();
    expect(m.providerOfModel("gpt-6.1-sol")).toBe("openai");
    expect(m.providerOfModel("claude-opus-5-5")).toBe("anthropic");
    expect(m.providerOfModel("mystery")).toBeNull();
    expect(m.describeModels()).toEqual({ provider: "anthropic", models: { fast: "claude-haiku-4-5-20251001", quality: "claude-sonnet-5-5", coach: "gpt-6.1-sol", interviewer: "gpt-4o" }, providers: { fast: "anthropic", quality: "anthropic", coach: "openai", interviewer: "openai" } });
    const { chatModel } = await import("@/app/lib/llm/chat");
    expect((chatModel("coach") as any).constructor.name).toBe("OpenAIChat"); // GPT-5+ ids go through the SDK adapter
    expect((chatModel("quality") as any).constructor.name).toBe("AnthropicChat");
  });
});

describe("chatModel factory", () => {
  it("builds the provider's model for the role and lets a harness override the provider per call", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.LLM_PROVIDER;
    const { chatModel, withProvider, activeProvider } = await import("@/app/lib/llm/chat");
    const claude: any = chatModel("coach", { maxTokens: 123, temperature: 0.1 });
    expect(claude.constructor.name).toBe("AnthropicChat");
    expect(claude.model).toBe("claude-opus-5-5");
    expect(claude.maxTokens).toBe(1500); // Anthropic floor: thinking shares the output budget
    expect((chatModel("coach", { maxTokens: 8000 }) as any).maxTokens).toBe(8000);
    const forced: any = chatModel("fast", { provider: "openai", json: true });
    expect(forced.constructor.name).toBe("GrowOnTruncate"); // JSON replies are guarded against cut-offs
    expect(forced.inner.constructor.name).toBe("ChatOpenAI");
    expect(forced.inner.modelName ?? forced.inner.model).toBe("gpt-4o-mini");
    expect(forced.inner.modelKwargs?.response_format?.type).toBe("json_object");
    await withProvider("openai", async () => {
      expect(activeProvider()).toBe("openai");
      expect((chatModel("quality") as any).constructor.name).toBe("ChatOpenAI");
    });
    expect(activeProvider()).toBe("anthropic");
  });
});

describe("JSON replies that get cut off", () => {
  it("retries with a doubled budget and fails clearly when the ceiling is not enough", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.LLM_PROVIDER;
    const seen: number[] = [];
    let cutUntil = 1;
    const build = (maxTokens: number) => ({
      async invoke() {
        seen.push(maxTokens);
        const cut = seen.length <= cutUntil;
        return { content: cut ? '{"a":[1,2' : '{"a":[1,2,3]}', response_metadata: { stop_reason: cut ? "max_tokens" : "end_turn" } };
      },
    });
    const { GrowOnTruncate, LlmTruncatedError } = await import("@/app/lib/llm/chat");
    const ok = await new GrowOnTruncate(build, 1000, 16_000, "m").invoke([]);
    expect(ok.content).toBe('{"a":[1,2,3]}');
    expect(seen).toEqual([1000, 2000]);

    seen.length = 0;
    cutUntil = 99; // never fits
    await expect(new GrowOnTruncate(build, 1000, 4000, "m").invoke([])).rejects.toBeInstanceOf(LlmTruncatedError);
    expect(seen).toEqual([1000, 2000, 4000]); // grew to the ceiling, then gave up with a clear error
  });

  it("the guard wraps every json call, on both providers, and reads OpenAI's finish_reason too", async () => {
    const { chatModel, isTruncated } = await import("@/app/lib/llm/chat");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect((chatModel("quality", { json: true }) as any).constructor.name).toBe("GrowOnTruncate");
    expect((chatModel("quality") as any).constructor.name).toBe("AnthropicChat"); // free text: no guard
    expect(isTruncated({ content: "", response_metadata: { finish_reason: "length" } })).toBe(true);
    expect(isTruncated({ content: "", response_metadata: { finish_reason: "stop" } })).toBe(false);
    expect(isTruncated({ content: "" })).toBe(false); // test doubles without metadata
  });
});
