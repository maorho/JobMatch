"use client";

import useSWR from "swr";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
};

export function useCurrentUser() {
  const { data, error, isLoading, mutate } = useSWR("/api/auth/me", fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  return {
    user: data,
    loading: isLoading,
    mutateUser: mutate,
    isError: error,
  };
}
