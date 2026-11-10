"use client";

import React, { useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ResumeLink from "./ResumeLink";
import { useT } from "../lib/i18n/LanguageProvider";

interface ApplybuttonProps {
  job: any;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const Applybutton: React.FC<ApplybuttonProps> = ({ job, setShowModal }) => {
  const { t, dir } = useT();
  const { user } = useCurrentUser();
  const router = useRouter();
  const [fullname, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [resumefile, setResumeFile] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (user) {
      setFullName(user.fullname || "");
      setEmail(user.email || "");
      setPhone(user.phone || "");
      setResumeFile(user.resumeUrl || "");
    }
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobsDashboard/Candidate/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Submitted Resume",
          jobId: job._id,
          candidateId: user?.id ?? user?._id,
          recruiterid: job.publisher,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        // Inline confirmation (no alert()); the user picks where to go next.
        setSent(data.message || t("widgets.apply.sent"));
      } else {
        setError(data.message || t("widgets.apply.failed"));
      }
    } catch {
      setError(t("common.somethingWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  const readOnlyInput = "jm-input disabled:bg-canvas disabled:text-ink-600 disabled:cursor-default";

  if (sent) {
    return (
      <div className="space-y-4" dir={dir}>
        <p className="jm-alert jm-alert-ok" role="status">✓ {sent}</p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={() => setShowModal(false)} className="jm-btn jm-btn-secondary">
            {t("widgets.apply.close")}
          </button>
          <Link href="/Dashboard" onClick={() => { setShowModal(false); router.push("/Dashboard"); }} className="jm-btn jm-btn-primary">
            {t("widgets.apply.goDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" dir={dir}>
      <div>
        <label className="jm-label">{t("widgets.apply.fullName")}</label>
        <input type="text" value={fullname} className={readOnlyInput} disabled />
      </div>
      <div>
        <label className="jm-label">{t("widgets.apply.phone")}</label>
        <input type="tel" value={phone} className={readOnlyInput} disabled dir="ltr" />
      </div>
      <div>
        <label className="jm-label">{t("widgets.apply.email")}</label>
        <input type="email" value={email} className={readOnlyInput} disabled dir="ltr" />
      </div>
      <div>
        <label className="jm-label">{t("widgets.apply.resume")}</label>
        <div className="rounded-control border border-line bg-canvas px-4 py-3">
          <ResumeLink resumeKey={resumefile} />
        </div>
      </div>
      {error && (
        <p className="jm-alert jm-alert-err" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
        <button type="button" onClick={() => setShowModal(false)} className="jm-btn jm-btn-secondary">
          {t("widgets.apply.cancel")}
        </button>
        <button type="submit" disabled={submitting} className="jm-btn jm-btn-primary">
          {submitting ? t("widgets.apply.sending") : t("widgets.apply.apply")}
        </button>
      </div>
    </form>
  );
};

export default Applybutton;
