"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import OutsideJobAdding from "./components/OutsideJobAdding";
import JobManagement from "./components/JobManagement";

const DashboardPage: React.FC = () => {
  const { user, loading } = useCurrentUser();

  const [showModal, setShowModal] = useState(false);
  const [jobsSubmitted, setJobsSubmitted] = useState([]);
  const [error, setError] = useState("");

  async function fetchJobsSubmitted() {
    console.log(user);
    try {
      const res = await fetch(
        "/api/jobsDashboard/Candidate/allCandidatePositions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }), // שליחה בשם ברור
        }
      );

      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();
      console.log(data);
      setJobsSubmitted(data);
    } catch (err) {
      setError("Something went wrong");
    }
  }

  // קריאה ל־fetch ברגע ש-user נטען
  useEffect(() => {
    if (user && !user.recruiter) {
      fetchJobsSubmitted();
    }
  }, [user]);

  if (loading) return <p>Loading...</p>;

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

  return (
    <div className="p-6 min-h-screen">
      <h2 className="text-xl font-semibold mb-4">Welcome, {user.fullname}!</h2>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <JobManagement jobs={jobsSubmitted} />

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
