"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANG, DICT, LANGS, format, type Key, type Lang } from "./dict";

type Ctx = { lang: Lang; dir: "rtl" | "ltr"; setLang: (l: Lang) => void; t: (key: Key, vars?: Record<string, string | number>) => string };
const LanguageContext = createContext<Ctx | null>(null);

export const LANG_STORAGE_KEY = "jm:lang";
export const LANG_COOKIE = "jm_lang";

/** What the inline <head> script decided before paint (it stamps <html lang>), else the stored choice, else Hebrew. */
function initialLang(): Lang {
  if (typeof document === "undefined") return DEFAULT_LANG;
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && (LANGS as string[]).includes(stored)) return stored as Lang;
  } catch {}
  // data-lang is set only by the head script (from the cookie); the plain lang attribute is the server default.
  const fromScript = document.documentElement.getAttribute("data-lang");
  if (fromScript && (LANGS as string[]).includes(fromScript)) return fromScript as Lang;
  return DEFAULT_LANG;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Server and first client render agree on the default; the stored choice is applied right after mount
  // (the head script has already set <html lang>, so there is no visible flash of direction).
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  useEffect(() => {
    setLangState(initialLang());
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, l);
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("data-lang", lang);
  }, [lang]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      dir: lang === "he" ? "rtl" : "ltr",
      setLang,
      t: (key, vars) => format(DICT[lang][key] ?? DICT.he[key] ?? key, vars),
    }),
    [lang, setLang]
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** The current language and the translator. Works without a provider too (Hebrew), so stray components never crash. */
export function useT(): Ctx {
  const ctx = useContext(LanguageContext);
  return (
    ctx ?? {
      lang: DEFAULT_LANG,
      dir: "rtl",
      setLang: () => {},
      t: (key, vars) => format(DICT[DEFAULT_LANG][key] ?? key, vars),
    }
  );
}

/** The header's HE/EN switch. */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useT();
  const next: Lang = lang === "he" ? "en" : "he";
  return (
    <button type="button" onClick={() => setLang(next)} aria-label={t("nav.languageAria")} title={t("nav.languageAria")} className={className} lang={next}>
      {t("nav.language")}
    </button>
  );
}
