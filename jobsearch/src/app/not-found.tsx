import Link from "next/link";
import type { Metadata } from "next";
import { EmptyState } from "./components/ui";
import { Bilingual, LangBox } from "./lib/i18n/Bilingual";

export const metadata: Metadata = { title: "העמוד לא נמצא", robots: { index: false } };

export default function NotFound() {
  return (
    <LangBox className="jm-page">
      <EmptyState
        icon="🧭"
        title={<Bilingual he="העמוד לא נמצא" en="Page not found" />}
        text={<Bilingual he="הקישור שהגעת ממנו לא קיים יותר, או שהמשרה הוסרה מהמאגר." en="The link you followed no longer exists, or the posting was removed from the catalogue." />}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/jobs" className="jm-btn jm-btn-primary"><Bilingual he="לכל המשרות" en="All jobs" /></Link>
            <Link href="/Articels" className="jm-btn jm-btn-secondary"><Bilingual he="מאמרים ומדריכים" en="Articles and guides" /></Link>
          </div>
        }
      />
    </LangBox>
  );
}
