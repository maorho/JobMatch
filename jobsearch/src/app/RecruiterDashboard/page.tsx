"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { useRouter } from "next/navigation";
import JobrecruiterCard from "./components/JobrecruiterCard";
import AddNewPositionRecruiter from "./components/AddNewPositionRecruiter";
import Image from "next/image";

const RecruiterHeroImage = () => (
  <div className="relative w-full h-[526px] mt-4 lg:mt-5">
    <Image
      src="/recruiter_hero.jpg"
      alt="recruiter image"
      fill
      className="object-cover rounded-[20px] lg:rounded-[60px]"
      priority
    />
  </div>
);
const RecruiterDashboardPage: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [jobLength, setjobLength] = useState(0);
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
      setjobLength(data.length);
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
    <div className="p-6 items-center justify-items-center min-h-screen">
      <div
        id="recruiter hero section"
        className="relative w-full pb-25 lg:mb-32 flex flex-col"
      >
        <div className="absolute inset-0 flex flex-col text-white items-center justify-center text-center px-4 z-10">
          <label className="text-3xl lg:text-7xl font-semibold mb-4">
            Welcome, {user.fullname}! 👋
          </label>
          <button
            onClick={() => setShowModal(true)}
            className="font-outfit text-[18px] mt-12 py-[10px] px-10 bg-[#11AEFF] rounded-[8px] lg:rounded-[14px] hover:bg-green-600"
          >
            Add New Job +
          </button>
        </div>

        <RecruiterHeroImage />
      </div>

      <div className="max-w-full">
        {loadingJobs ? (
          <p className="text-center text-gray-500">Loading your jobs...</p>
        ) : jobs.length == 0 ? (
          <div>
            <h2>Your Board is Empty</h2>
          </div>
        ) : (
          <div>
            <div className="pb-16">
              <label className="font-medium font-outfit text-[#222222] text-[20px] lg:text-[45px]">
                You Have {jobLength} Active Job Posts
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7 pb-25 lg:pb-30">
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
