"use client";

import Link from "next/link";
import React, { useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { useRouter } from "next/navigation";

const RecruiterDashboardPage: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [jobs, setJobs] = useState([]);
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
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
        <button> Add New Position</button>
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg w-[500px] max-w-full">
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
