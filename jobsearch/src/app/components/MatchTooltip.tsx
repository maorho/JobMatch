"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useT } from "../lib/i18n/LanguageProvider";

/**
 * Why this score: a small navy tooltip over the match badge with the verdict
 * sentence and the have / missing terms. Hover or keyboard focus on a desktop;
 * a tap toggles it on touch screens (a second tap, a tap outside or Escape
 * closes it). Never navigates: clicks inside stay inside.
 */
export default function MatchTooltip({ why, matched, gaps, label, children }: { why?: string; matched: string[]; gaps: string[]; label: string; children: ReactNode }) {
  const { t, dir } = useT();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // opened by tap/click: stays until closed
  const ref = useRef<HTMLSpanElement | null>(null);
  const id = useId();
  const has = !!why || matched.length > 0 || gaps.length > 0;

  useEffect(() => {
    if (!pinned) return;
    const away = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key);
    };
  }, [pinned]);

  if (!has) return <>{children}</>;
  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => !pinned && setOpen(false)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // A tap pins it open; a second tap closes it.
        setPinned(!pinned);
        setOpen(!pinned);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setPinned(!pinned);
          setOpen(!pinned);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-describedby={open ? id : undefined}
      aria-expanded={open}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          dir={dir}
          className="absolute bottom-full start-0 mb-2.5 z-40 w-[min(20rem,calc(100vw-3rem))] rounded-xl bg-navy text-white shadow-card-hover px-3.5 py-3 text-[13px] leading-relaxed text-start cursor-default animate-rise"
        >
          {why && <span className="block font-medium">{why}</span>}
          {matched.length > 0 && (
            <span className="block mt-1.5">
              <span className="text-white/60">{t("card.have")}: </span>
              <span className="text-teal-200" dir="ltr">{matched.join(", ")}</span>
            </span>
          )}
          {gaps.length > 0 && (
            <span className="block mt-1">
              <span className="text-white/60">{t("card.missing")}: </span>
              <span className="text-amber-200" dir="ltr">{gaps.join(", ")}</span>
            </span>
          )}
          <span aria-hidden className="absolute top-full start-5 border-[7px] border-transparent border-t-navy" />
        </span>
      )}
    </span>
  );
}
