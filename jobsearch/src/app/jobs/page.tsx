import type { Metadata } from "next";
import JobTable from "../components/JobTable";

export const metadata: Metadata = {
  title: "משרות הייטק בישראל — ישירות מדפי הקריירה של החברות",
  description: "כל המשרות הפתוחות ממאות דפי קריירה, מתעדכנות כל חצי שעה, עם סינון לפי שנות ניסיון, טכנולוגיות, עיר ומועד הפרסום.",
  alternates: { canonical: "/jobs" },
};

/** The job feed: the whole catalogue (search + filters), ranked by the résumé when signed in. */
export default function JobsPage() {
  return (
    <div className="flex flex-col min-h-screen w-full max-w-[1440px] mx-auto">
      <main className="flex-grow">
        <JobTable />
      </main>
    </div>
  );
}
