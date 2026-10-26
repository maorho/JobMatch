import Link from "next/link";
import type { Metadata } from "next";
import { EmptyState } from "./components/ui";

export const metadata: Metadata = { title: "העמוד לא נמצא", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="jm-page" dir="rtl">
      <EmptyState
        icon="🧭"
        title="העמוד לא נמצא"
        text="הקישור שהגעת ממנו לא קיים יותר, או שהמשרה הוסרה מהמאגר."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/" className="jm-btn jm-btn-primary">לכל המשרות</Link>
            <Link href="/Articels" className="jm-btn jm-btn-secondary">מאמרים ומדריכים</Link>
          </div>
        }
      />
    </div>
  );
}
