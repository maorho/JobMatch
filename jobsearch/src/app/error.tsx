"use client";

import { useEffect } from "react";
import Link from "next/link";
import { EmptyState } from "./components/ui";
import { useT } from "./lib/i18n/LanguageProvider";

/** Route-segment error boundary (rendered inside the root layout, so the header stays). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, dir } = useT();
  useEffect(() => {
    console.error("page error:", error);
  }, [error]);

  return (
    <div className="jm-page" dir={dir}>
      <EmptyState
        icon="⚠️"
        title={t("common.somethingWrong")}
        text={
          <>
            {t("pages.error.text")}
            {error.digest && <span className="block jm-muted mt-2" dir="ltr">ref: {error.digest}</span>}
          </>
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={reset} className="jm-btn jm-btn-primary">{t("pages.error.retry")}</button>
            <Link href="/" className="jm-btn jm-btn-secondary">{t("pages.error.home")}</Link>
          </div>
        }
      />
    </div>
  );
}
