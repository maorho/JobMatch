import { applyServerBase, applyServerToken } from "@/app/lib/apply/server";

export type OpenJobResponse = {
  finalUrl: string | null;
  jobdescription: string | null; // נשמור את השם כמו שמגיע מהשרת כרגע
};

export const getFinalUrl = async (url: string): Promise<OpenJobResponse> => {
  // Production needs PUPPETEER_SERVER_URL; without it the lookup is skipped (logged once).
  const base = applyServerBase();
  if (!base) return { finalUrl: null, jobdescription: null };
  const token = applyServerToken();
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
  const endpoint = `${base}/api/open-job?url=${encodeURIComponent(url)}${tokenParam}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000); // the server renders the page (25s goto + waits)
  try {
    const res = await fetch(endpoint, { cache: "no-store", signal: ctrl.signal });
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
  } finally {
    clearTimeout(timer);
  }
};
