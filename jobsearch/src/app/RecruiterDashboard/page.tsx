"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { useRouter } from "next/navigation";
import JobrecruiterCard from "./components/JobrecruiterCard";
import AddNewPositionRecruiter from "./components/AddNewPositionRecruiter";

const RecruiterDashboardPage: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const router = useRouter();
  async function loadJobs() {
    setError("");
    setLoadingJobs(true); // התחלת טעינה

    try {
      const res = await fetch("/api/jobsDashboard/Company/allCompanyJobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: user.company }),
      });

      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();
      setJobs(data);
    } catch (err) {
      setError(`Something went wrong: ${err}`);
    } finally {
      setLoadingJobs(false); // סיום טעינה
    }
  }

  useEffect(() => {
    if (user?.recruiter) {
      loadJobs();
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

  if (!user.recruiter) {
    return (
      <div className="text-center min-h-screen">
        <p className="text-red-500 text-lg">You are not a recruiter.</p>
        <Link href="/Dashboard" className="text-blue-600 underline">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen">
      <h2 className="text-xl font-semibold mb-4">Welcome, {user.fullname}!</h2>
      <div>
        <button
          onClick={() => setShowModal(true)}
          className="mb-4 w-40 h-10 bg-blue-500 text-white rounded hover:bg-green-600"
        >
          Add New Position
        </button>
        {loadingJobs ? (
          <p className="text-center text-gray-500">Loading your jobs...</p>
        ) : jobs.length == 0 ? (
          <div>
            <h2>Your Board is Empty</h2>
          </div>
        ) : (
          <div className="p-6 min-h-screen">
            {jobs.map((element, ind) => {
              return (
                <JobrecruiterCard
                  key={ind}
                  job={element}
                  jobIndex={ind}
                  onSuccess={loadJobs}
                />
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg w-[500px] max-w-full">
            <AddNewPositionRecruiter
              onSuccess={() => {
                setShowModal(false);
                loadJobs();
              }}
            />
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

export default RecruiterDashboardPage;
