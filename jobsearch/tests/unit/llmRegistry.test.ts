import { describe, it, expect, afterEach, vi } from "vitest";

const ENV = ["ANTHROPIC_API_KEY", "LLM_PROVIDER", "LLM_MODEL_FAST", "LLM_MODEL_QUALITY", "LLM_MODEL_COACH"] as const;
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
  });

  it("honours LLM_PROVIDER and per-tier pins", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_MODEL_COACH = "gpt-4.1";
    const m = await load();
    expect(m.llmProvider()).toBe("openai");
    expect(m.modelFor("coach")).toBe("gpt-4.1");
    expect(m.modelFor("fast")).toBe("gpt-4o-mini");
    expect(m.describeModels()).toEqual({ provider: "openai", models: { fast: "gpt-4o-mini", quality: "gpt-4o", coach: "gpt-4.1" } });
  });
});

describe("chatModel factory", () => {
  it("builds the provider's model for the role and lets a harness override the provider per call", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.LLM_PROVIDER;
    const { chatModel, withProvider, activeProvider } = await import("@/app/lib/llm/chat");
    const claude: any = chatModel("coach", { maxTokens: 123, temperature: 0.1 });
    expect(claude.constructor.name).toBe("ChatAnthropic");
    expect(claude.model).toBe("claude-opus-5-5");
    expect(claude.maxTokens).toBe(123);
    const forced: any = chatModel("fast", { provider: "openai", json: true });
    expect(forced.constructor.name).toBe("ChatOpenAI");
    expect(forced.modelName ?? forced.model).toBe("gpt-4o-mini");
    expect(forced.modelKwargs?.response_format?.type).toBe("json_object");
    await withProvider("openai", async () => {
      expect(activeProvider()).toBe("openai");
      expect((chatModel("quality") as any).constructor.name).toBe("ChatOpenAI");
    });
    expect(activeProvider()).toBe("anthropic");
  });
});
