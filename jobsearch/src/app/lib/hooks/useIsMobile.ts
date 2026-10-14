import { useSyncExternalStore } from "react";

const query = (breakpoint: number) => `(max-width: ${breakpoint - 1}px)`;

/**
 * `true` below `breakpoint` px. `window` exists in the browser from the very
 * first client render (the one that hydrates server HTML), so reading
 * `matchMedia` in a `useState` initializer — the previous approach — returns
 * the real viewport on that render while the server always rendered `false`,
 * which is a hydration mismatch on any phone. `useSyncExternalStore` is built
 * for exactly this: its `getServerSnapshot` renders `false` during hydration
 * (matching the server), and the live `matchMedia` value is swapped in right
 * after, with no mismatch warning and no desktop-first flash.
 */
export function useIsMobile(breakpoint: number = 770) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query(breakpoint));
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query(breakpoint)).matches,
    () => false
  );
}
