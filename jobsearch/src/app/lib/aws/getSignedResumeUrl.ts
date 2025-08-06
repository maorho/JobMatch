export const getSignedResumeUrl = async (key: string): Promise<string | null> => {
  try {
    const res = await fetch("/api/getResumeUrl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.url;
  } catch (err) {
    console.error("Error getting signed resume URL", err);
    return null;
  }
};
