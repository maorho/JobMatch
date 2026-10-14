import { useState, useEffect } from "react";

const query = (breakpoint: number) => `(max-width: ${breakpoint - 1}px)`;

/**
 * `true` below `breakpoint` px. The initial value comes from `matchMedia` on
 * the client, so a phone never paints the desktop variant first; on the
 * server (no window) it is `false`, which is also what the first client
 * render uses when hydrating server HTML. Pages that are client-only (most
 * dashboards) get the right value straight away.
 */
export function useIsMobile(breakpoint: number = 770) {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query(breakpoint)).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(query(breakpoint));
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
