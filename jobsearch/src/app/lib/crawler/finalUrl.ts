export type OpenJobResponse = {
  finalUrl: string | null;
  jobdescription: string | null; // נשמור את השם כמו שמגיע מהשרת כרגע
};

export const getFinalUrl = async (url: string): Promise<OpenJobResponse> => {
  const endpoint = `http://localhost:4000/api/open-job?url=${encodeURIComponent(url)}`;

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
