import { ExternalJob } from "./JobTable";

// Parse one CSV line, honoring double-quoted fields that contain commas and
// escaped quotes (""). A naive split(",") corrupts every such row.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.replace(/\r/g, ""));
}

export default async function fetchSheetAsJson(): Promise<any[]> {
  const csvUrl = process.env.NEXT_PUBLIC_CSV_URL;
  if (!csvUrl) {
    // The sheet is an optional legacy source; without it the sync is simply a no-op.
    console.warn("⚠️ NEXT_PUBLIC_CSV_URL is not set — skipping the external-jobs sheet");
    return [];
  }
  const res = await fetch(csvUrl);
  if (!res.ok) {
    console.warn(`⚠️ external-jobs sheet returned ${res.status} — skipping`);
    return [];
  }
  const csvText = await res.text();
  const lines = csvText.trim().split("\n");

  // 🔍 מחפש את שורת הכותרת האמיתית – לדוג' אם יש "Title" ו-"Company"
  const headerIndex = lines.findIndex(line =>
    line.toLowerCase().includes("title") &&
    line.toLowerCase().includes("company")
  );

  if (headerIndex === -1) throw new Error("⚠️ לא נמצאה שורת כותרות בטבלה");

  const headers = parseCsvLine(lines[headerIndex]).map((h) => h.trim());

  const dataLines = lines.slice(headerIndex + 1);

  const json = dataLines.map((line) => {
    const values = parseCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = (values[i] ?? "").trim();
    });
    return obj;
  });

  return json;
}

export function normalizeExternalJobs(jobs: any[]): ExternalJob[] {
  function generateIdFromFields(job: any): string {
  const base = `${job.Title}-${job.Company}-${job["Posted time"]}`;
  return btoa(unescape(encodeURIComponent(base))).slice(0, 16); // קיצוץ לאורך סביר
}

  const CITY_MAP: Record<string, string> = {
    telavivyafo: "Tel Aviv - Yafo",
    telaviv: "Tel Aviv",
    haifa: "Haifa",
    petahtikva: "Petah Tikva",
    netanya: "Netanya",
    herzliya: "Herzliya",
    ramatgan: "Ramat Gan",
    raanana: "Ra'anana",
    jerusalem: "Jerusalem",
    rehovot: "Rehovot",
    kfarsaba: "Kfar Saba",
    kiryatono:"Kiryat-Ono",
    migdalhaemek:"Migdal-Haemek",
    beersheva: "Be'er Sheva",
    rishonlezion: "Rishon LeZion",
    ramathasharon: "Ramat HaSharon",
    caesarea: "Caesarea",
    hodhasharon: "Hod HaSharon",
    holon: "Holon",
    roshhaayin: "Rosh HaAyin",
    karmiel: "Karmiel",
    modiinmaccabimreut: "Modi'in-Maccabim-Re'ut",
    bneibrak: "Bnei Brak",
    ashdod: "Ashdod",
  };

  const IGNORED_TOKENS = [
    "israel", "center", "north", "south", "shfela", "hasharon", "centerdistrict", "northdistrict"
  ];

  return jobs
    .filter((job) => job && job.Title && job.Company && job.Location && job["Posted time"]) // הגנה בסיסית
    .map((job): ExternalJob => {
      // תאריך בטוח
      const postedRaw = new Date(job["Posted time"]);
      const id = isNaN(postedRaw.getTime())
        ? new Date()
        : postedRaw;

      // ניתוח מיקום
      const locationParts = job.Location
        .split(";")
        .map((s: string) => s.trim().toLowerCase().replace(/\s/g, ""))
        .filter(Boolean);

      const country = locationParts.includes("israel")
        ? "israel"
        : locationParts[locationParts.length - 1] || "";

      const rawCity = locationParts.find((token:string) => CITY_MAP[token] && !IGNORED_TOKENS.includes(token)) || "";
      const city = CITY_MAP[rawCity] || "";

      // מיוננים
      const skills = (job.Skills || "")
        .split(";")
        .map((s: string) => s.trim())
        .filter(Boolean);

      const seniority = (job.Seniority || "")
        .split(";")
        .map((s: string) => s.trim())
        .filter(Boolean);

      return {
        id: generateIdFromFields(job),
        job: job.Title.trim(),
        company: job.Company.trim(),
        city,
        country,
        seniority,
        url: job.URL?.trim() || "",
        skills,
        createdAt: new Date(),            // ✅ חייב להיות כאן
        description: job?.Description ?? "", // ✅ חייב להיות כאן
        source: "external",
      };
    });
}