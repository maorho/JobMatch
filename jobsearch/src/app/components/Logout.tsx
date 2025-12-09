"use client";

import { useRouter } from "next/navigation";
import { mutate } from "swr";

export default function LogoutButton({ closeNav }: { closeNav?: () => void }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });

    // מחיקת קוקי
    document.cookie = "token=; Max-Age=0; path=/";

    // לעדכן SWR שהמשתמש התנתק
    await mutate("/api/auth/me", null, false);

    if (closeNav) closeNav();
    router.refresh();
    router.push("/");
  }

  return (
    <button
      className="text-lg font-semibold hover:text-blue-400"
      onClick={handleLogout}
    >
      Logout
    </button>
  );
}
