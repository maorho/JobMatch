"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useModalBehavior } from "./Dialog";
import { useT } from "../lib/i18n/LanguageProvider";

/**
 * The accessibility widget Israeli sites carry (ת"י 5568 / WCAG 2.1 AA):
 * text size, high contrast, grayscale, highlighted links, a readable font
 * with wider spacing, a big cursor, and no animations. Settings are classes
 * on <html> (see globals.css, "a11y-*") and persist in localStorage only —
 * nothing leaves the browser.
 */
type Prefs = { font: 0 | 1 | 2 | 3; contrast: boolean; grayscale: boolean; links: boolean; readable: boolean; cursor: boolean; motion: boolean };
const DEFAULTS: Prefs = { font: 0, contrast: false, grayscale: false, links: false, readable: false, cursor: false, motion: false };
const KEY = "jm:a11y";

const read = (): Prefs => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

/** Apply as classes on the root so every page, including ones that render before React, picks them up. */
function apply(p: Prefs) {
  const el = document.documentElement;
  el.classList.remove("a11y-font-1", "a11y-font-2", "a11y-font-3");
  if (p.font) el.classList.add(`a11y-font-${p.font}`);
  el.classList.toggle("a11y-contrast", p.contrast);
  el.classList.toggle("a11y-grayscale", p.grayscale);
  el.classList.toggle("a11y-links", p.links);
  el.classList.toggle("a11y-readable", p.readable);
  el.classList.toggle("a11y-cursor", p.cursor);
  el.classList.toggle("a11y-no-motion", p.motion);
}

const A11yGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none" />
    <path d="M4 9.5c2.7.7 5.3 1 8 1s5.3-.3 8-1" />
    <path d="M12 10.5v4.5l-3 6" />
    <path d="M12 15l3 6" />
  </svg>
);

export default function AccessibilityMenu() {
  const { t, dir } = useT();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Load the saved preferences once on the client; the server renders the defaults.
  useEffect(() => {
    const p = read();
    setPrefs(p);
    apply(p);
  }, []);

  useModalBehavior(open, () => setOpen(false), panelRef);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    apply(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  const reset = () => {
    setPrefs(DEFAULTS);
    apply(DEFAULTS);
    try {
      localStorage.removeItem(KEY);
    } catch {}
  };
  const active = prefs.font > 0 || prefs.contrast || prefs.grayscale || prefs.links || prefs.readable || prefs.cursor || prefs.motion;

  // A render helper, not a component: a component defined inside render would remount on every change.
  const toggle = (k: keyof Omit<Prefs, "font">, label: string) => (
    <button
      key={k}
      type="button"
      role="switch"
      aria-checked={prefs[k]}
      onClick={() => update({ [k]: !prefs[k] } as Partial<Prefs>)}
      className={`flex items-center justify-between gap-3 rounded-control border px-3 py-2 text-sm text-start transition-colors ${prefs[k] ? "border-teal bg-teal-50 text-navy font-medium" : "border-line text-ink hover:bg-canvas"}`}
    >
      <span>{label}</span>
      <span aria-hidden className={`h-5 w-9 rounded-full relative transition-colors ${prefs[k] ? "bg-teal" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${prefs[k] ? "start-[18px]" : "start-0.5"}`} />
      </span>
    </button>
  );

  return (
    <div className="fixed bottom-4 right-4 z-[60] print:hidden" dir={dir}>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="a11y-title"
          className="absolute bottom-16 right-0 w-[min(20rem,calc(100vw-2rem))] rounded-card bg-surface border border-line shadow-card-hover p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 id="a11y-title" className="font-semibold text-navy">{t("widgets.a11y.title")}</h2>
            <button type="button" onClick={() => { setOpen(false); buttonRef.current?.focus(); }} className="jm-btn jm-btn-ghost jm-btn-icon h-8 w-8" aria-label={t("widgets.a11y.close")}>×</button>
          </div>

          <div>
            <div className="text-xs font-semibold text-ink-600 mb-1.5">{t("widgets.a11y.textSize")}</div>
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t("widgets.a11y.textSize")}>
              {([0, 1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={prefs.font === n}
                  onClick={() => update({ font: n })}
                  className={`rounded-control border py-1.5 text-sm transition-colors ${prefs.font === n ? "border-teal bg-teal-50 text-navy font-semibold" : "border-line text-ink hover:bg-canvas"}`}
                >
                  {n === 0 ? t("widgets.a11y.normal") : `${100 + n * 15}%`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            {toggle("contrast", t("widgets.a11y.contrast"))}
            {toggle("grayscale", t("widgets.a11y.grayscale"))}
            {toggle("links", t("widgets.a11y.links"))}
            {toggle("readable", t("widgets.a11y.readable"))}
            {toggle("cursor", t("widgets.a11y.cursor"))}
            {toggle("motion", t("widgets.a11y.motion"))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={reset} disabled={!active} className="jm-btn jm-btn-secondary jm-btn-sm">{t("widgets.a11y.reset")}</button>
            <Link href="/Accessibility" className="text-xs text-sky-600 underline underline-offset-2" onClick={() => setOpen(false)}>{t("footer.accessibility")}</Link>
          </div>
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("widgets.a11y.title")}
        title={t("widgets.a11y.short")}
        className={`h-12 w-12 rounded-full shadow-card-hover flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${active ? "bg-teal text-white" : "bg-navy text-white hover:bg-navy-700"}`}
      >
        <A11yGlyph />
      </button>
    </div>
  );
}
