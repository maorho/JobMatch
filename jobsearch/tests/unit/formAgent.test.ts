import { describe, it, expect } from "vitest";
import { ruleAnswer, answerFormFields, buildFormPrompt } from "@/app/lib/apply/formAgent";

const ctx = { profile: { fullname: "Dana Cohen", email: "dana@test.dev", phone: "050-0000000", linkedin: "https://linkedin.com/in/dana" }, resumeText: "Tel Aviv based React developer", job: { title: "Frontend", company: "Acme" } };

describe("form agent rules", () => {
  it("answers the standard fields deterministically and only from the options offered", () => {
    expect(ruleAnswer({ selector: "a", label: "LinkedIn Profile", type: "text", required: false }, ctx)).toBe("https://linkedin.com/in/dana");
    expect(ruleAnswer({ selector: "b", label: "Phone", type: "text", required: true }, ctx)).toBe("050-0000000");
    expect(ruleAnswer({ selector: "c", label: "How did you hear about us?", type: "select", required: true, options: ["Referral", "Job Board", "LinkedIn"] }, ctx)).toBe("LinkedIn");
    expect(ruleAnswer({ selector: "d", label: "How did you hear about us?", type: "select", required: true, options: ["Referral", "Newspaper"] }, ctx)).toBeUndefined();
    expect(ruleAnswer({ selector: "e", label: "I agree to the privacy policy", type: "checkbox", required: true, options: ["I agree"] }, ctx)).toBe("I agree");
    expect(ruleAnswer({ selector: "f", label: "Expected salary", type: "text", required: true }, ctx)).toBeUndefined();
  });

  it("without an LLM, leaves unknown questions unanswered instead of guessing", async () => {
    const r = await answerFormFields([{ selector: "x", label: "Years of experience with Rust", type: "text", required: true }, { selector: "y", label: "LinkedIn", type: "text", required: false }], ctx, { useLLM: false });
    expect(r.answers).toEqual([{ selector: "y", value: "https://linkedin.com/in/dana", source: "rule", confidence: 1 }]);
    expect(r.unanswered.map((f) => f.selector)).toEqual(["x"]);
  });

  it("the prompt binds select answers to the options and forbids invention", () => {
    const { system, user } = buildFormPrompt([{ selector: "s", label: "Country", type: "select", required: true, options: ["Israel", "USA"] }], ctx);
    expect(system).toMatch(/Never invent/);
    expect(system).toMatch(/MUST be one of its options/);
    expect(user).toContain('"options":["Israel","USA"]');
    expect(user).toContain("Tel Aviv based React developer");
  });
});

describe("unreadable questions", () => {
  it("never answers a field whose label is just its internal name", async () => {
    const { isUnreadableLabel } = await import("@/app/lib/apply/formAgent");
    expect(isUnreadableLabel("cards[aeb318a9-cc55][field0]")).toBe(true);
    expect(isUnreadableLabel("question_123")).toBe(true);
    expect(isUnreadableLabel("Are you authorized to work in Israel?")).toBe(false);
    const r = await answerFormFields([{ selector: "s", label: "cards[1][field0]", type: "select", required: true, options: ["No", "Yes"] }], ctx, { useLLM: false });
    expect(r.answers).toEqual([]);
    expect(r.unanswered).toHaveLength(1);
  });
});
