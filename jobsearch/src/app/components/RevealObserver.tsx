"use client";
import { useEffect } from "react";

/**
 * Scroll reveal: any element with `jm-reveal` gets `is-visible` the first
 * time it enters the viewport (new elements are picked up as they mount).
 * Pure presentation; nothing depends on it.
 */
export default function RevealObserver() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    const watch = (root: ParentNode) => root.querySelectorAll?.(".jm-reveal:not(.is-visible)").forEach((el) => io.observe(el));
    watch(document);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n instanceof Element) {
        if (n.classList.contains("jm-reveal")) io.observe(n);
        watch(n);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
