"use client";
import type { ElementType, ReactNode } from "react";
import { useT } from "./LanguageProvider";

/**
 * Long prose that is written twice rather than keyed (legal pages, about,
 * accessibility statement): renders the version for the current language.
 * Server components may use it too, passing server-rendered children.
 */
export function Bilingual({ he, en }: { he: ReactNode; en: ReactNode }) {
  const { lang } = useT();
  return <>{lang === "he" ? he : en}</>;
}

/** A container whose `dir` follows the interface language (for pages that are server components). */
export function LangBox({ as: Tag = "div", className, children }: { as?: ElementType; className?: string; children: ReactNode }) {
  const { dir, lang } = useT();
  return (
    <Tag dir={dir} lang={lang} className={className}>
      {children}
    </Tag>
  );
}
