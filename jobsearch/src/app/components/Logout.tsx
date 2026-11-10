"use client";

import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { LogOut } from "lucide-react";
import { markSignedOut } from "../lib/hooks/useCurrentUser";
import { useT } from "../lib/i18n/LanguageProvider";

export default function LogoutButton({
  closeNav,
  className = "jm-btn jm-btn-secondary jm-btn-sm",
}: {
  closeNav?: () => void;
  className?: string;
}) {
  const { t } = useT();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });

    // Clear the cookie.
    document.cookie = "token=; Max-Age=0; path=/";

    // Tell SWR the user signed out (so a deliberate logout never shows "session expired").
    markSignedOut();
    await mutate("/api/auth/me", null, false);

    if (closeNav) closeNav();
    router.refresh();
    router.push("/");
  }

  return (
    <button className={className} onClick={handleLogout}>
      <LogOut className="h-4 w-4" />
      {t("widgets.logout")}
    </button>
  );
}
