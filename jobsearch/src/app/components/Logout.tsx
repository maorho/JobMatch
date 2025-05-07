"use client";

import { useRouter } from "next/navigation";
import { mutate } from "swr";

export default function LogoutButton({ closeNav }: { closeNav?: () => void }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    mutate("/api/auth/me", null, false);
    closeNav?.();
    router.push("/");
    router.refresh();
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
