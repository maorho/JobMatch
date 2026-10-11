import type { Page } from "puppeteer";

/**
 * A computer-use style form agent for application pages the deterministic
 * filler doesn't know (Ashby, Workday, Comeet, SmartRecruiters, custom
 * forms, multi-step wizards). Each step: observe the page (interactive
 * elements with stable ids + visible text + a small screenshot), let the
 * model decide a few actions, execute them, repeat — until a confirmation
 * appears, the model gives up (something it can't answer honestly), or the
 * budget runs out. In `dryRun` it never presses a submit button.
 */
export type AgentElement = {
  id: string; // data-jm-id
  tag: string;
  type: string;
  label: string;
  value: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
};
export type Observation = { url: string; title: string; text: string; elements: AgentElement[]; screenshot?: string };
export type AgentAction =
  | { type: "click"; target: string }
  | { type: "type"; target: string; value: string }
  | { type: "select"; target: string; value: string }
  | { type: "check"; target: string; value?: string }
  | { type: "upload"; target: string }
  | { type: "press"; value: "Enter" | "Tab" | "Escape" }
  | { type: "scroll"; value?: "down" | "up" }
  | { type: "wait"; value?: number };
export type Decision = { thought: string; actions: AgentAction[]; status: "continue" | "submitted" | "needs_user"; reason?: string };
export type AgentContext = {
  profile: { firstName: string; lastName: string; email: string; phone: string; linkedin?: string; location?: string };
  resumeText: string;
  resumePath: string | null;
  jobTitle?: string;
  company?: string;
  coverNote?: string;
  dryRun: boolean;
};
export type AgentStep = { step: number; url: string; thought: string; actions: AgentAction[]; status: Decision["status"]; reason?: string; applied: string[] };
export type AgentResult = { status: "submitted" | "needs_user" | "failed" | "ready"; reason?: string; confirmation?: string; steps: AgentStep[]; filled: string[] };

// Latin words need \b; Hebrew has no \b semantics in JS regexes, so it gets its own branch.
export const SUBMIT_RE = /^(submit|apply|send( application)?|finish|complete)\b|^(שלח|הגש|שליחה|הגשה)/i;
export const NEXT_RE = /^(next|continue|proceed|save and continue)\b|^(המשך|הבא)/i;
export const CONFIRM_RE = /(thank you[^.\n]{0,120}|application (?:has been |was )?(?:submitted|received)[^.\n]{0,80}|we(?:'ve| have) received your application[^.\n]{0,80}|successfully (?:applied|submitted)[^.\n]{0,60}|תודה[^.\n]{0,80}|המועמדות (?:נשלחה|התקבלה)[^.\n]{0,80})/i;

/** Tag every interactive element with a stable id and describe it. */
export async function observe(page: Page, opts: { screenshot?: boolean } = {}): Promise<Observation> {
  const frames = page.frames();
  const parts: Observation[] = [];
  for (let fi = 0; fi < frames.length; fi++) {
    try {
      const part = await observeFrame(frames[fi], `f${fi}`);
      if (part.elements.length || fi === 0) parts.push(part);
    } catch {
      /* detached / blocked frame */
    }
  }
  const main = parts[0] || { url: page.url(), title: "", text: "", elements: [] };
  const obs: Observation = {
    url: main.url,
    title: main.title,
    text: parts.map((p) => p.text).join("\n").slice(0, 2500),
    elements: parts.flatMap((p) => p.elements).slice(0, 90),
  };
  if (opts.screenshot) {
    try {
      const buf = await page.screenshot({ type: "jpeg", quality: 45, fullPage: false });
      obs.screenshot = Buffer.from(buf).toString("base64");
    } catch {}
  }
  return obs;
}

/** Find the frame that owns an element id ("f2e7" → frame 2). */
export function frameOf(page: Page, id: string) {
  const m = /^f(\d+)e/.exec(id);
  const frames = page.frames();
  return (m && frames[Number(m[1])]) || page.mainFrame();
}

async function observeFrame(frame: import("puppeteer").Frame, prefix: string): Promise<Observation> {
  const obs: Observation = await frame.evaluate((prefix) => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    };
    const txt = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").replace(/[*✱]/g, "").trim();
    const labelFor = (el: Element): string => {
      const id = el.id;
      let t = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent) || el.getAttribute("aria-label") || "";
      if (!t) {
        const lb = el.getAttribute("aria-labelledby");
        if (lb) t = lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent || "").join(" ");
      }
      if (!t) t = el.closest("label")?.textContent || "";
      if (!t) {
        let node: Element | null = el.parentElement;
        for (let d = 0; node && d < 5 && !t; d++, node = node.parentElement) {
          const lab = node.querySelector(":scope > label, :scope > legend, :scope > .application-label, :scope > [class*='label' i], :scope > span, :scope > div > label");
          if (lab && !lab.contains(el) && txt(lab.textContent).length < 160) t = lab.textContent || "";
        }
      }
      if (!t) t = el.getAttribute("placeholder") || el.getAttribute("name") || el.getAttribute("title") || "";
      return txt(t).slice(0, 140);
    };
    let n = 0;
    const out: any[] = [];
    const seenRadio = new Set<string>();
    const els = Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea, button, a[href], [role='button'], [role='combobox'], [role='checkbox'], [role='radio'], [contenteditable='true']"));
    for (const el of els) {
      if (!vis(el)) continue;
      const tag = el.tagName.toLowerCase();
      const input = el as HTMLInputElement;
      const type = (input.type || el.getAttribute("role") || tag).toLowerCase();
      if (type === "hidden") continue;
      if (tag === "a" && !/apply|next|continue|submit|start|begin|interested|register|sign ?in|log ?in|create account|הגש|המשך|התחל|מעוניין|הרשמ|התחבר/i.test(el.textContent || "")) continue;
      if (type === "radio" || type === "checkbox") {
        const key = input.name || el.id || "";
        if (type === "radio" && key && seenRadio.has(key)) continue;
        if (type === "radio" && key) seenRadio.add(key);
      }
      const id = el.getAttribute("data-jm-id") || `${prefix}e${++n}`;
      el.setAttribute("data-jm-id", id);
      const item: any = { id, tag, type, label: "", value: "", required: input.required || el.getAttribute("aria-required") === "true" };
      if (tag === "button" || tag === "a" || type === "button" || type === "submit") {
        item.label = txt(el.textContent || input.value || el.getAttribute("aria-label")).slice(0, 80);
        if (!item.label) continue;
      } else {
        item.label = labelFor(el);
        item.placeholder = el.getAttribute("placeholder") || undefined;
        if (tag === "select") {
          const sel = el as HTMLSelectElement;
          item.options = Array.from(sel.options).map((o) => txt(o.textContent)).filter(Boolean).slice(0, 60);
          item.value = txt(sel.selectedOptions[0]?.textContent);
        } else if (type === "radio") {
          const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${(input.name || "").replace(/"/g, '\\"')}"]`));
          item.options = group.map((g) => txt((g.id && document.querySelector(`label[for="${CSS.escape(g.id)}"]`)?.textContent) || g.closest("label")?.textContent || g.value)).filter(Boolean);
          item.value = txt(group.find((g) => g.checked)?.value || "");
          const fs = group[0]?.closest("fieldset, [role='radiogroup'], .field, .application-question");
          const legend = fs ? txt(fs.querySelector("legend, label, .application-label")?.textContent) : "";
          if (legend) item.label = legend;
        } else if (type === "checkbox") {
          item.value = input.checked ? "checked" : "";
        } else if (type === "file") {
          item.value = input.files?.length ? `${input.files.length} file(s)` : "";
        } else if (el.getAttribute("contenteditable") === "true") {
          item.value = txt(el.textContent).slice(0, 80);
        } else {
          item.value = txt(input.value).slice(0, 80);
          // react-select & co keep the chosen value next to the input
          const control = el.closest('[class*="control"], [class*="Control"]');
          const chosen = control?.querySelector('[class*="single-value"], [class*="singleValue"]');
          if (chosen) item.value = txt(chosen.textContent);
        }
      }
      out.push(item);
      if (out.length >= 80) break;
    }
    const main = document.querySelector("main, form, [role='main']") || document.body;
    return { url: location.href, title: document.title, text: txt(main.textContent).slice(0, 2500), elements: out };
  }, prefix);
  return obs;
}

export function buildAgentPrompt(obs: Observation, ctx: AgentContext, history: AgentStep[]): { system: string; user: string } {
  const system = `You are filling a job application form on behalf of a candidate, step by step, like a careful human assistant.
You see the page's interactive elements (each with an id), the visible text and a screenshot. Decide the next few actions.

RULES
- Fill ONLY with facts from the CANDIDATE PROFILE / RÉSUMÉ below. Never invent experience, employers, job titles, degrees, years, salary, visa status, references or answers to questions the résumé doesn't cover. "Current company/title" = the most recent position in the résumé; if the résumé has none, leave it empty (or "needs_user" if required). Never type placeholders like "N/A", "Freelance" or "-".
- The decision to apply was already made by the candidate — do NOT judge whether they fit the role; your only job is the form.
- Work authorization / visa: answer only when the résumé states where the candidate lives (e.g. "based in Tel Aviv, Israel" → authorized in Israel: Yes, needs sponsorship: No). Otherwise it is a "needs_user" question.
- If a REQUIRED field needs information you don't have (salary expectations, work authorization, security clearance, ID numbers, essays about things not in the résumé, "how did you hear" is fine → "LinkedIn"), STOP with status "needs_user" and say exactly which question. Do not guess.
- Résumé upload: use action "upload" on the file input (the file is attached by the runner).
- Multi-step forms: fill the current step, then click Next/Continue. Only click Submit/Apply/Send when every required field on the final step is filled.
- ${ctx.dryRun ? "DRY RUN: do everything except the final submit. When the form is complete and only the submit button remains, return status \"submitted\" WITHOUT clicking it (the runner knows not to)." : "When the submission is confirmed (thank-you page), return status \"submitted\"."}
- Cookie banners / consent popups: dismiss them. If the site asks you to sign in or create an account (Workday, SmartRecruiters…), or shows a captcha, stop with "needs_user" — never try to log in or register.
- Prefer typing into fields by id; for selects use "select" with the exact option text; for radio groups use "check" with the option text; for comboboxes type then press Enter.
- Keep each step to at most 8 actions. If the page did not change after your actions, try something different or stop.
Return STRICT JSON: {"thought": string, "actions": [{"type":"click|type|select|check|upload|press|scroll|wait","target":"id","value":"..."}], "status": "continue|submitted|needs_user", "reason": string}.`;
  const hist = history.slice(-4).map((h) => `step ${h.step} @ ${h.url}: ${h.thought} → ${h.actions.map((a) => `${a.type}${"target" in a ? `(${a.target})` : ""}`).join(", ")}`).join("\n");
  const user = `CANDIDATE PROFILE: ${JSON.stringify(ctx.profile)}
APPLYING TO: ${ctx.jobTitle || "?"} at ${ctx.company || "?"}
RÉSUMÉ (summary): """${(ctx.resumeText || "").slice(0, 3000)}"""
${ctx.coverNote ? `COVER NOTE (use if a free-text message field exists): """${ctx.coverNote.slice(0, 800)}"""\n` : ""}
PAGE: ${obs.title} — ${obs.url}
VISIBLE TEXT: """${obs.text.slice(0, 1800)}"""
ELEMENTS:
${obs.elements.map((e) => `${e.id} [${e.tag}${e.type && e.type !== e.tag ? `/${e.type}` : ""}]${e.required ? " *" : ""} ${e.label}${e.placeholder ? ` (${e.placeholder})` : ""}${e.value ? ` = "${e.value}"` : ""}${e.options?.length ? ` options: ${e.options.slice(0, 25).join(" | ")}` : ""}`).join("\n")}
${hist ? `\nPREVIOUS STEPS:\n${hist}` : ""}`;
  return { system, user };
}

export function parseDecision(text: string): Decision {
  const t = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  const raw = JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
  const status = ["continue", "submitted", "needs_user"].includes(raw.status) ? raw.status : "continue";
  const actions = Array.isArray(raw.actions) ? raw.actions.filter((a: any) => a && typeof a.type === "string").slice(0, 8) : [];
  return { thought: String(raw.thought || "").slice(0, 400), actions, status, reason: raw.reason ? String(raw.reason).slice(0, 400) : undefined };
}

export const isSubmitLabel = (label: string) => SUBMIT_RE.test(label.trim());

/** Execute one action; returns a human-readable description or null when nothing happened. */
export async function act(page: Page, action: AgentAction, ctx: AgentContext, elements: AgentElement[]): Promise<string | null> {
  const el = "target" in action ? elements.find((e) => e.id === action.target) : undefined;
  const sel = el ? `[data-jm-id="${el.id}"]` : "";
  const frame = el ? frameOf(page, el.id) : page.mainFrame();
  switch (action.type) {
    case "click": {
      if (!el) return null;
      // Dry run blocks only the FINAL submit: a submit-labelled button on a page that
      // actually holds a form. "Apply" on a posting page just opens the form — allowed.
      const formFields = elements.filter((e) => ["input", "select", "textarea"].includes(e.tag) && e.type !== "file").length;
      if (ctx.dryRun && isSubmitLabel(el.label) && formFields >= 3) return `(dry run) would click "${el.label}"`;
      const h = await frame.$(sel);
      if (!h) return null;
      await h.click().catch(() => frame.evaluate((s) => (document.querySelector(s) as HTMLElement)?.click(), sel));
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 6000 }).catch(() => null);
      return `click "${el.label}"`;
    }
    case "type": {
      if (!el) return null;
      const h = await frame.$(sel);
      if (!h) return null;
      await h.click({ clickCount: 3 }).catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
      await h.type(String(action.value ?? ""), { delay: 8 });
      return `type "${String(action.value).slice(0, 40)}" → ${el.label}`;
    }
    case "select": {
      if (!el) return null;
      const ok = await frame.evaluate((s, val) => {
        const node = document.querySelector(s) as HTMLSelectElement | null;
        if (!node || node.tagName !== "SELECT") return false;
        const v = String(val).toLowerCase();
        const opt = Array.from(node.options).find((o) => (o.textContent || "").trim().toLowerCase() === v) || Array.from(node.options).find((o) => (o.textContent || "").toLowerCase().includes(v));
        if (!opt) return false;
        node.value = opt.value;
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }, sel, action.value);
      if (ok) return `select "${action.value}" → ${el.label}`;
      // combobox fallback: type + pick the first option
      const h = await frame.$(sel);
      if (!h) return null;
      await h.click();
      await h.type(String(action.value), { delay: 20 });
      await page.waitForSelector('[role="option"], [class*="__option"]', { timeout: 3000 }).catch(() => null);
      const picked = await frame.evaluate((val) => {
        const v = String(val).toLowerCase();
        const opts = Array.from(document.querySelectorAll<HTMLElement>('[role="option"], [class*="__option"]')).filter((o) => o.getClientRects().length);
        const best = opts.find((o) => (o.textContent || "").trim().toLowerCase() === v) || opts.find((o) => (o.textContent || "").toLowerCase().includes(v)) || opts[0];
        if (!best) return false;
        best.click();
        return true;
      }, action.value);
      if (!picked) await page.keyboard.press("Enter");
      return `combobox "${action.value}" → ${el.label}`;
    }
    case "check": {
      if (!el) return null;
      const ok = await frame.evaluate((s, val) => {
        const node = document.querySelector(s) as HTMLInputElement | null;
        if (!node) return false;
        if (node.type === "radio") {
          const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${(node.name || "").replace(/"/g, '\\"')}"]`));
          const v = String(val || "").toLowerCase();
          const match = group.find((g) => {
            const t = ((g.id && document.querySelector(`label[for="${CSS.escape(g.id)}"]`)?.textContent) || g.closest("label")?.textContent || g.value || "").trim().toLowerCase();
            return t === v || t.includes(v);
          }) || (group.length === 1 ? group[0] : undefined);
          if (!match) return false;
          match.click();
          return true;
        }
        if (!node.checked) node.click();
        return true;
      }, sel, action.value);
      return ok ? `check "${action.value || ""}" → ${el.label}` : null;
    }
    case "upload": {
      if (!el || !ctx.resumePath) return null;
      const h = (await frame.$(sel)) as any;
      if (!h) return null;
      await h.uploadFile(ctx.resumePath);
      await new Promise((r) => setTimeout(r, 2000));
      return `upload résumé → ${el.label}`;
    }
    case "press":
      await page.keyboard.press(action.value);
      return `press ${action.value}`;
    case "scroll":
      await page.evaluate((dir) => window.scrollBy(0, dir === "up" ? -700 : 700), action.value || "down");
      return `scroll ${action.value || "down"}`;
    case "wait":
      await new Promise((r) => setTimeout(r, Math.min(5000, Number(action.value) || 1500)));
      return "wait";
  }
  return null;
}

export type Llm = (system: string, user: string, screenshotB64?: string) => Promise<string>;

/** The loop. */
export async function runFormAgent(page: Page, ctx: AgentContext, llm: Llm, opts: { maxSteps?: number; budgetMs?: number; screenshots?: boolean } = {}): Promise<AgentResult> {
  const maxSteps = opts.maxSteps ?? 14;
  const deadline = Date.now() + (opts.budgetMs ?? 150_000);
  const steps: AgentStep[] = [];
  const filled: string[] = [];
  let lastSig = "";
  let stuck = 0;
  const recentActions: string[] = [];
  for (let i = 1; i <= maxSteps && Date.now() < deadline; i++) {
    const obs = await observe(page, { screenshot: opts.screenshots ?? true });
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 20000) || "");
    const confirm = bodyText.match(CONFIRM_RE);
    if (confirm && i > 1 && !ctx.dryRun) return { status: "submitted", confirmation: confirm[0].trim(), steps, filled };
    const sig = obs.url + "|" + obs.elements.map((e) => `${e.id}:${e.value}`).join(",");
    stuck = sig === lastSig ? stuck + 1 : 0;
    lastSig = sig;
    if (stuck >= 2) return { status: "needs_user", reason: "The page stopped responding to the agent's actions — finish it manually.", steps, filled };

    const { system, user } = buildAgentPrompt(obs, ctx, steps);
    let decision: Decision;
    try {
      decision = parseDecision(await llm(system, user, obs.screenshot));
    } catch (e: any) {
      return { status: "failed", reason: `agent decision failed: ${e?.message}`, steps, filled };
    }
    const applied: string[] = [];
    for (const a of decision.actions) {
      const done = await act(page, a, ctx, obs.elements).catch(() => null);
      if (done) applied.push(done);
    }
    // Going in circles (same clicks again and again) = a wall we can't pass (sign-in, modal…).
    const actionSig = applied.join("|");
    recentActions.push(actionSig);
    if (actionSig && recentActions.slice(-4).filter((x) => x === actionSig).length >= 2) {
      steps.push({ step: i, url: obs.url, thought: decision.thought, actions: decision.actions, status: decision.status, reason: decision.reason, applied });
      return { status: "needs_user", reason: "The site keeps bouncing back (sign-in or a blocked step) — open the link and continue from there.", steps, filled };
    }
    steps.push({ step: i, url: obs.url, thought: decision.thought, actions: decision.actions, status: decision.status, reason: decision.reason, applied });
    filled.push(...applied.filter((d) => /^(type|select|combobox|check|upload)/.test(d)));
    if (decision.status === "needs_user") return { status: "needs_user", reason: decision.reason || "The form needs you.", steps, filled };
    if (decision.status === "submitted") {
      if (ctx.dryRun) return { status: "ready", reason: decision.reason, steps, filled };
      await new Promise((r) => setTimeout(r, 2500));
      const after = await page.evaluate(() => document.body?.innerText?.slice(0, 20000) || "");
      const c = after.match(CONFIRM_RE);
      if (c) return { status: "submitted", confirmation: c[0].trim(), steps, filled };
      // The model may have declared victory one step early — give it one more look.
      continue;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return { status: "needs_user", reason: "Ran out of steps before the form was complete — finish it manually.", steps, filled };
}
