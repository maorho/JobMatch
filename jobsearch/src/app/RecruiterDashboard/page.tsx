"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import JobrecruiterCard from "./components/JobrecruiterCard";
import AddNewPositionRecruiter from "./components/AddNewPositionRecruiter";
import { RecruiterHeroImage } from "../components/HeroImages";



const RecruiterDashboardPage: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [jobLength, setjobLength] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);
  async function loadJobs() {
    setError("");
    setLoadingJobs(true); // התחלת טעינה
    console.log("user:",user);
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
        <Link href="/Login" className="text-blue-600 underline">
          Go to Login
        </Link>
      </div>
    );
  }

  if (!user.recruiter && !user.admin) {
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
          
          {user.approved && (
            <button
            onClick={() => setShowModal(true)}
            className="font-outfit text-[18px] mt-12 py-[10px] px-10 bg-[#11AEFF] rounded-[8px] lg:rounded-[14px] hover:bg-[#24A8A2]"
          >
            Add New Job +
          </button>
          )}
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
          user.approved?(
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
          ):(
            <div className="text-center min-h-screen">
              <p className="text-red-500 text-lg">Your recruiter account is not approved yet. Please wait for admin approval.</p>
            </div>
          )
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-[#000000]/70 bg-opacity-50 z-50">
          <div className="bg-white max-h-[90vh] p-6 rounded-[16px] lg:rounded-4xl  w-[400px] lg:w-[650px] max-w-full flex flex-col">
            <AddNewPositionRecruiter
              onSuccess={() => {
                setShowModal(false);
                loadJobs();
              }}
              setShowModal={setShowModal}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default RecruiterDashboardPage;