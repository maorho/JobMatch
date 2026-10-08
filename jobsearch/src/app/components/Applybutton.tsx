"use client";

import React, { useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { useRouter } from "next/navigation";
import ResumeLink from "./ResumeLink";

interface ApplybuttonProps {
  job: any;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const Applybutton: React.FC<ApplybuttonProps> = ({ job, setShowModal }) => {
  const { user } = useCurrentUser();
  const router = useRouter();
  const [fullname, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [resumefile, setResumeFile] = useState("");
  const [error, setError] = useState("");

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
    try {
      const res = await fetch("/api/jobsDashboard/Candidate/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Submitted Resume",
          jobId: job._id,
          candidateId: user.id,
          recruiterid: job.publisher,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert(data.message || "Application sent!");
        setShowModal(false);
        router.push("/Dashboard");
      } else {
        setError(data.message || "Application failed");
      }
    } catch {
      setError("Something went wrong");
    }
  }

  const readOnlyInput = "jm-input disabled:bg-canvas disabled:text-ink-600 disabled:cursor-default";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="jm-label">Full Name:</label>
        <input type="text" value={fullname} className={readOnlyInput} disabled />
      </div>
      <div>
        <label className="jm-label">Phone:</label>
        <input type="tel" value={phone} className={readOnlyInput} disabled />
      </div>
      <div>
        <label className="jm-label">Email:</label>
        <input type="email" value={email} className={readOnlyInput} disabled />
      </div>
      <div>
        <label className="jm-label">Resume:</label>
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
          Cancel
        </button>
        <button type="submit" className="jm-btn jm-btn-primary">
          Apply
        </button>
      </div>
    </form>
  );
};

export default Applybutton;
