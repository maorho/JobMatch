"use client";

import Link from "next/link";
import React, { useState } from "react";
import useSWR from "swr";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import OutsideJobAdding from "./components/OutsideJobAdding";
import JobManagement from "./components/JobManagement";

const fetcher = async ([url, body]: [string, any]) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // אופציונלי: לקרוא את השגיאה מהשרת
    let errMsg = "Failed to fetch";
    try {
      const e = await res.json();
      if (e?.message) errMsg = e.message;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await res.json(); // ⬅️ לקרוא פעם אחת
  return data; // ⬅️ להחזיר את אותו אובייקט
};

const DashboardPage: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [showModal, setShowModal] = useState(false);

  const swrKey =
    user && !user.recruiter
      ? [
          "/api/jobsDashboard/Candidate/allCandidatePositions",
          { userId: user.id },
        ]
      : null;

  const {
    data: jobsSubmitted,
    error,
    isLoading,
  } = useSWR(swrKey, fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });

  if (loading || isLoading) return <p>Loading...</p>;

  if (!user) {
    return (
      <div className="text-center min-h-screen">
        <p className="text-red-500 text-lg">You are not logged in.</p>
        <Link href="/LoginPage" className="text-blue-600 underline">
          Go to Login
        </Link>
      </div>
    );
  }

  if (user.recruiter) {
    return (
      <div className="text-center min-h-screen">
        <p className="text-red-500 text-lg">You are a recruiter</p>
        <Link href="/RecruiterDashboard" className="text-blue-600 underline">
          Go to RecruiterDashboard
        </Link>
      </div>
    );
  }
  console.log(`jobsSubmitted:`, jobsSubmitted);
  return (
    <div className="p-6 min-h-screen">
      <h2 className="text-xl font-semibold mb-4">Welcome, {user.fullname}!</h2>

      {error && (
        <p className="text-red-500 text-sm mb-4">Something went wrong</p>
      )}

      {jobsSubmitted && <JobManagement jobs={jobsSubmitted} />}

      <button
        onClick={() => setShowModal(true)}
        className="ml-2 w-40 h-10 bg-blue-500 text-white rounded hover:bg-green-600"
      >
        Add Job Manually
      </button>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg w-[500px] max-w-full">
            <OutsideJobAdding />
            <button
              onClick={() => setShowModal(false)}
              className="mt-4 bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
