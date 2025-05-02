"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <button
      className="w-40 h-10 bg-blue-500 text-white rounded hover:bg-green-600"
      onClick={handleLogout}
    >
      Logout
    </button>
  );
}
