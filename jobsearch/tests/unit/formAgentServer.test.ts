import { describe, it, expect } from "vitest";
import { buildAgentPrompt, parseDecision, isSubmitLabel, CONFIRM_RE, type Observation, type AgentContext } from "../../server/formAgent";

const obs: Observation = {
  url: "https://jobs.ashbyhq.com/acme/123/application",
  title: "Apply — Acme",
  text: "Application for Frontend Engineer. Name, Email, Resume, Are you authorized to work in Israel?",
  elements: [
    { id: "e1", tag: "input", type: "text", label: "Full name", value: "", required: true },
    { id: "e2", tag: "input", type: "email", label: "Email", value: "", required: true },
    { id: "e3", tag: "input", type: "file", label: "Resume", value: "", required: true },
    { id: "e4", tag: "select", type: "select", label: "Are you authorized to work in Israel?", value: "", required: true, options: ["Yes", "No"] },
    { id: "e5", tag: "button", type: "submit", label: "Submit application", value: "", required: false },
  ],
};
const ctx: AgentContext = { profile: { firstName: "Dana", lastName: "Cohen", email: "dana@test.dev", phone: "050" }, resumeText: "Frontend developer in Tel Aviv, Israel.", resumePath: "/tmp/cv.pdf", jobTitle: "Frontend Engineer", company: "Acme", dryRun: true };

describe("form agent (pure parts)", () => {
  it("builds a prompt that forbids invention, lists elements with ids, and respects dry run", () => {
    const { system, user } = buildAgentPrompt(obs, ctx, []);
    expect(system).toMatch(/Never invent/);
    expect(system).toMatch(/DRY RUN/);
    expect(system).toMatch(/needs_user/);
    expect(user).toContain('e4 [select] * Are you authorized to work in Israel? options: Yes | No');
    expect(user).toContain("e5 [button/submit] Submit application");
    expect(user).toContain("Dana");
    expect(user).toContain("Frontend developer in Tel Aviv");
    const live = buildAgentPrompt(obs, { ...ctx, dryRun: false }, [{ step: 1, url: obs.url, thought: "filled name", actions: [{ type: "type", target: "e1", value: "Dana Cohen" }], status: "continue", applied: ["type"] }]);
    expect(live.system).not.toMatch(/DRY RUN/);
    expect(live.user).toMatch(/PREVIOUS STEPS:\nstep 1 .*filled name → type\(e1\)/);
  });

  it("parses decisions defensively (fenced JSON, unknown status, too many actions)", () => {
    const d = parseDecision('```json\n{"thought":"fill","actions":[{"type":"type","target":"e1","value":"Dana Cohen"},{"type":"upload","target":"e3"}],"status":"continue"}\n```');
    expect(d.actions).toHaveLength(2);
    expect(d.status).toBe("continue");
    const many = parseDecision(JSON.stringify({ thought: "x", status: "weird", actions: Array.from({ length: 12 }, () => ({ type: "scroll" })) }));
    expect(many.actions).toHaveLength(8);
    expect(many.status).toBe("continue");
    const stop = parseDecision('{"thought":"can\'t answer","actions":[],"status":"needs_user","reason":"Asks for expected salary"}');
    expect(stop).toMatchObject({ status: "needs_user", reason: "Asks for expected salary" });
    expect(() => parseDecision("not json")).toThrow();
  });

  it("recognises submit buttons and confirmation pages in both languages", () => {
    expect(isSubmitLabel("Submit application")).toBe(true);
    expect(isSubmitLabel("Apply now")).toBe(true);
    expect(isSubmitLabel("שלח מועמדות")).toBe(true);
    expect(isSubmitLabel("Next")).toBe(false);
    expect(isSubmitLabel("Upload resume")).toBe(false);
    expect("Thank you for applying to Acme!".match(CONFIRM_RE)?.[0]).toMatch(/Thank you/);
    expect("תודה, המועמדות נשלחה בהצלחה".match(CONFIRM_RE)).toBeTruthy();
    expect("Please complete the required fields".match(CONFIRM_RE)).toBeNull();
  });
});
