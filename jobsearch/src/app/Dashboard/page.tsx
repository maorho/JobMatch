"use client";

import Link from "next/link";
import React, { useState } from "react";
import LogoutButton from "../components/Logout";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import OutsideJobAdding from "./components/OutsideJobAdding";
import { useRouter } from "next/navigation";
import JobManagement from "./components/JobManagement";
import { jobs } from "../components/jobs";

const DashboardPage: React.FC = () => {
  const { user, loading } = useCurrentUser();
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

  return (
    <div className="p-6 min-h-screen">
      <h2 className="text-xl font-semibold mb-4">Welcome, {user.fullname}!</h2>
      <div>
        <JobManagement jobs={jobs} />
        <button
          onClick={() => setShowModal(true)}
          className="ml-2 w-40 h-10 bg-blue-500 text-white rounded hover:bg-green-600"
        >
          Add Job Manually
        </button>
      </div>

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
