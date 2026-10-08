"use client";

import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { LogOut } from "lucide-react";

export default function LogoutButton({
  closeNav,
  className = "jm-btn jm-btn-secondary jm-btn-sm",
}: {
  closeNav?: () => void;
  className?: string;
}) {
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
    <button className={className} onClick={handleLogout}>
      <LogOut className="h-4 w-4" />
      Logout
    </button>
  );
}
