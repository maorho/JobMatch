"use client";

import { useEffect, useRef } from "react";

/** Site-wide background: slow-drifting colour fields and a faint dot grid (styles in globals.css, `.jm-aurora`). Decorative only; the drift pauses while the tab is hidden. */
export default function BackgroundAurora() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sync = () => {
      const el = ref.current;
      if (!el) return;
      if (document.hidden) el.setAttribute("data-paused", "");
      else el.removeAttribute("data-paused");
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return (
    <div ref={ref} className="jm-aurora" aria-hidden="true">
      <span className="a1" />
      <span className="a2" />
      <span className="a3" />
    </div>
  );
}
