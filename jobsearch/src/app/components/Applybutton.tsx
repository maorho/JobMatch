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
  const { user } = useCurrentUser(); // ✅ בראש הפונקציה
  console.log(user);
  const router = useRouter(); // ✅ בראש הפונקציה
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

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div>
        <label>Full Name:</label>
        <input
          type="text"
          value={fullname}
          className="block w-full border p-1 rounded"
          disabled
        />
      </div>
      <div>
        <label>Phone:</label>
        <input
          type="tel"
          value={phone}
          className="block w-full border p-1 rounded"
          disabled
        />
      </div>
      <div>
        <label>Email:</label>
        <input
          type="email"
          value={email}
          className="block w-full border p-1 rounded"
          disabled
        />
      </div>
      <div>
        <label>Resume:</label>
        <ResumeLink resumeKey={resumefile} />
      </div>
      {error && <p className="text-red-500">{error}</p>}
      <div className="flex justify-between mt-4">
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => setShowModal(false)}
          className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export default Applybutton;
