"use client";

import { useEffect } from "react";
import useSWR from "swr";

/** `null` = not signed in (401/404); the fetcher never throws for those so SWR keeps `user` stable. */
const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
};

// Tab-wide (module) state: SWR's `/api/auth/me` entry is shared by every
// component, so "did this tab ever have a user" is shared too. A session that
// WAS valid and then comes back as 401 has expired (or was revoked) — unless
// the user signed out on purpose, which LogoutButton reports via markSignedOut().
let hadUser = false;
let signedOutOnPurpose = false;

/** Called by the logout button before it clears the SWR cache. */
export function markSignedOut() {
  hadUser = false;
  signedOutOnPurpose = true;
}

export function useCurrentUser() {
  const { data, error, isLoading, mutate } = useSWR("/api/auth/me", fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  useEffect(() => {
    if (data) {
      hadUser = true;
      signedOutOnPurpose = false;
    }
  }, [data]);
  const sessionExpired = data === null && !isLoading && hadUser && !signedOutOnPurpose;

  return {
    user: data,
    loading: isLoading,
    mutateUser: mutate,
    isError: error,
    /** True when a previously signed-in session is now rejected by the server (401), i.e. it expired. */
    sessionExpired,
  };
}
