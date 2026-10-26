"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: replaces the root layout, so it must render its own
 * <html>/<body>. Styles are inlined (globals.css is not guaranteed here) using
 * the jm palette.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("global error:", error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, background: "#f6f9fb", color: "#232323", fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", border: "1px solid #e6ebf0", borderRadius: 24, padding: 40, maxWidth: 480, width: "100%", textAlign: "center", boxShadow: "0 8px 24px -12px rgb(16 43 57 / 0.14)" }}>
            <div style={{ fontSize: 32 }}>⚠️</div>
            <h1 style={{ color: "#102b39", fontSize: 22, fontWeight: 600, margin: "12px 0 8px" }}>משהו השתבש</h1>
            <p style={{ color: "#4b5563", lineHeight: 1.6, margin: 0 }}>האפליקציה נתקלה בשגיאה בלתי צפויה. אפשר לנסות שוב או לחזור לדף הבית.</p>
            {error.digest && <p style={{ color: "#8a94a0", fontSize: 12, marginTop: 8 }} dir="ltr">ref: {error.digest}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
              <button type="button" onClick={reset} style={{ background: "#24a8a2", color: "#fff", border: 0, borderRadius: 14, padding: "12px 20px", font: "inherit", fontWeight: 500, cursor: "pointer" }}>
                נסה/י שוב
              </button>
              <a href="/" style={{ background: "#fff", color: "#102b39", border: "1px solid #e6ebf0", borderRadius: 14, padding: "12px 20px", textDecoration: "none", fontWeight: 500 }}>
                לדף הבית
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
