export type OpenJobResponse = {
  finalUrl: string | null;
  jobdescription: string | null; // נשמור את השם כמו שמגיע מהשרת כרגע
};

export const getFinalUrl = async (url: string): Promise<OpenJobResponse> => {
  // Configurable so it works in deployed environments, not just localhost.
  const base = process.env.PUPPETEER_SERVER_URL || "http://localhost:4000";
  const token = process.env.SCRAPER_TOKEN || process.env.CRON_SECRET || "";
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
  const endpoint = `${base}/api/open-job?url=${encodeURIComponent(url)}${tokenParam}`;

  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);

    const data = await res.json();
    // חשוב: אל תקרא שוב ל-res.json() אחרי זה — זה מה שגרם ל-"Body is unusable" בעבר
    console.log("res of 4000:", data);

    // תמיכה לאחור אם אי פעם השרת יחזיר רק מחרוזת
    if (typeof data === "string") {
      return { finalUrl: data || null, jobdescription: null };
    }

    return {
      finalUrl: data?.finalUrl ?? null,
      jobdescription: data?.jobdescription ?? null,
    };
  } catch (err) {
    console.error("❌ Failed to get finalUrl:", err);
    return { finalUrl: null, jobdescription: null };
  }
};
