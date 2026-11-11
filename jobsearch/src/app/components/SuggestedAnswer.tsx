"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; answer: string; tips: string[]; placeholders: number; cached: boolean }
  | { kind: "noResume" }
  | { kind: "error"; message: string };

/**
 * Under one company interview question: a button that drafts an answer from the
 * signed-in person's résumé. Nothing is fetched until they ask; cached answers
 * come back instantly. Placeholders in brackets mark what the résumé didn't say.
 */
export default function SuggestedAnswer({ company, question, stage, topic }: { company: string; question: string; stage?: string; topic?: string }) {
  const { t, dir } = useT();
  const [state, setState] = useState<State>({ kind: "idle" });

  const load = async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/interview/questions/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company, question, stage, topic }) });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d?.error === "NO_RESUME") return setState({ kind: "noResume" });
      if (!res.ok) return setState({ kind: "error", message: d?.message || d?.error || t("widgets.sa.failed") });
      setState({ kind: "done", answer: d.answer, tips: d.tips || [], placeholders: d.placeholders || 0, cached: !!d.cached });
    } catch {
      setState({ kind: "error", message: t("widgets.sa.failed") });
    }
  };

  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <button type="button" onClick={load} disabled={state.kind === "loading"} className="jm-btn jm-btn-ghost jm-btn-sm mt-1.5 -ms-2 text-teal" aria-busy={state.kind === "loading"}>
        <Sparkles className="h-3.5 w-3.5" />
        {state.kind === "loading" ? t("widgets.sa.preparing") : t("widgets.sa.button")}
      </button>
    );
  }
  if (state.kind === "noResume") {
    return (
      <p className="mt-2 text-sm text-ink-600" dir={dir}>
        {t("widgets.sa.noResume1")}{" "}
        <Link href="/ResumeAI" className="text-teal underline">
          {t("widgets.sa.noResumeLink")}
        </Link>{" "}
        {t("widgets.sa.noResume2")}
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p className="mt-2 text-sm text-red-700" role="alert" dir={dir}>
        {state.message}{" "}
        <button type="button" onClick={load} className="underline">
          {t("widgets.sa.retry")}
        </button>
      </p>
    );
  }
  return (
    <div className="mt-2 rounded-control border border-teal/25 bg-teal-50/60 p-3.5 text-sm leading-relaxed" dir={dir}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-teal mb-1.5">
        <Sparkles className="h-3.5 w-3.5" /> {t("widgets.sa.title")}
      </div>
      <p className="text-ink whitespace-pre-line" dir={dir}>
        {state.answer}
      </p>
      {state.placeholders > 0 && (
        <p className="mt-2 text-xs text-ink-600">
          {t("widgets.sa.placeholders")}
        </p>
      )}
      {state.tips.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-ink-600 list-disc list-inside px-1">
          {state.tips.map((tip, i) => (
            <li key={i} dir={dir}>
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
