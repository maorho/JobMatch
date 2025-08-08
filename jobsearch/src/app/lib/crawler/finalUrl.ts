export const getFinalUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(`http://localhost:4000/api/open-job?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    return data.finalUrl || null;
  } catch (err) {
    console.error("❌ Failed to get finalUrl:", err);
    return null;
  }
};
