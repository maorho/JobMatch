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

  if (!resumeKey) return <span>No resume</span>;

  return url ? (
    <a
      href={url}
      className="text-blue-600 underline hover:text-blue-800"
      target="_blank"
      rel="noopener noreferrer"
    >
      View Resume
    </a>
  ) : (
    <span>Loading...</span>
  );
};

export default ResumeLink;
