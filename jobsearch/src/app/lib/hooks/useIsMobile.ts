import { useSyncExternalStore } from "react";

const query = (breakpoint: number) => `(max-width: ${breakpoint - 1}px)`;

type Store = { subscribe: (onChange: () => void) => () => void; getSnapshot: () => boolean };

// One stable subscribe/getSnapshot pair per breakpoint: inline closures would
// be new on every render and make React re-subscribe each time.
const stores = new Map<number, Store>();

function storeFor(breakpoint: number): Store {
  let store = stores.get(breakpoint);
  if (!store) {
    const q = query(breakpoint);
    store = {
      subscribe: (onChange) => {
        const mq = window.matchMedia(q);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
      },
      getSnapshot: () => window.matchMedia(q).matches,
    };
    stores.set(breakpoint, store);
  }
  return store;
}

const getServerSnapshot = () => false;

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
  const { subscribe, getSnapshot } = storeFor(breakpoint);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
