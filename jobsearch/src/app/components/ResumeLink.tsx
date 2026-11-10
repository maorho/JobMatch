"use client";
import React, { useEffect, useState } from "react";
import { getSignedResumeUrl } from "../lib/aws/getSignedResumeUrl";
import { useT } from "../lib/i18n/LanguageProvider";

const ResumeLink: React.FC<{ resumeKey: string }> = ({ resumeKey }) => {
  const { t } = useT();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (resumeKey) {
      getSignedResumeUrl(resumeKey).then(setUrl);
    }
  }, [resumeKey]);

  if (!resumeKey) return <span className="jm-muted">{t("widgets.resume.none")}</span>;

  return url ? (
    <a
      href={url}
      className="jm-btn jm-btn-secondary jm-btn-sm"
      target="_blank"
      rel="noopener noreferrer"
    >
      {t("widgets.resume.view")}
    </a>
  ) : (
    <span className="jm-muted">{t("common.loading")}</span>
  );
};

export default ResumeLink;
