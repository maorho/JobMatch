"use client";
import React, { useEffect, useState } from "react";
import { getSignedResumeUrl } from "../lib/aws/getSignedResumeUrl";

const ResumeLink: React.FC<{ resumeKey: string }> = ({ resumeKey }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (resumeKey) {
      getSignedResumeUrl(resumeKey).then(setUrl);
    }
  }, [resumeKey]);

  if (!resumeKey) return <span className="jm-muted">No resume</span>;

  return url ? (
    <a
      href={url}
      className="jm-btn jm-btn-secondary jm-btn-sm"
      target="_blank"
      rel="noopener noreferrer"
    >
      View Resume
    </a>
  ) : (
    <span className="jm-muted">Loading...</span>
  );
};

export default ResumeLink;
