"use client";

import Link from "next/link";
import React from "react";
import LogoutButton from "../components/Logout";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";

const DashboardPage: React.FC = () => {
  const { user, loading } = useCurrentUser();

  if (loading) return <p>Loading...</p>;

  if (!user) {
    return (
      <div className="text-center mt-10">
        <p className="text-red-500 text-lg">You are not logged in.</p>
        <Link href="/login" className="text-blue-600 underline">
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Welcome, {user.email}!</h2>
      <Link href="/UserSettings" className="text-blue-600 underline">
        Settings
      </Link>
      <div className="mt-4">
        <LogoutButton />
      </div>
    </div>
  );
};

export default DashboardPage;
