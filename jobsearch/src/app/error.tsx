"use client";

import { useEffect } from "react";
import Link from "next/link";
import { EmptyState } from "./components/ui";

/** Route-segment error boundary (rendered inside the root layout, so the header stays). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("page error:", error);
  }, [error]);

  return (
    <div className="jm-page" dir="rtl">
      <EmptyState
        icon="⚠️"
        title="משהו השתבש"
        text={
          <>
            לא הצלחנו לטעון את העמוד. אפשר לנסות שוב, או לחזור לדף הבית.
            {error.digest && <span className="block jm-muted mt-2" dir="ltr">ref: {error.digest}</span>}
          </>
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={reset} className="jm-btn jm-btn-primary">נסה/י שוב</button>
            <Link href="/" className="jm-btn jm-btn-secondary">לדף הבית</Link>
          </div>
        }
      />
    </div>
  );
}
