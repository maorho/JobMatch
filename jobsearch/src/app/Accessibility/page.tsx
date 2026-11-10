import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../components/ui";
import { Bilingual, LangBox } from "../lib/i18n/Bilingual";

export const metadata: Metadata = {
  title: "הצהרת נגישות | JobMatch",
  description: "מה נעשה כדי ש-JobMatch תהיה נגישה, איך משתמשים בתפריט הנגישות, ולמי פונים אם נתקלתם בבעיה.",
};

/**
 * The accessibility statement Israeli regulation asks for (תקנות שוויון זכויות לאנשים עם מוגבלות, 2013).
 * Hebrew and English say the same thing; when one changes, change the other (and the date in both).
 */
export default function AccessibilityPage() {
  return (
    <LangBox className="jm-page">
      <div className="max-w-3xl mx-auto">
        <PageHeader
          eyebrow={<Bilingual he="נגישות" en="Accessibility" />}
          title={<Bilingual he="הצהרת נגישות" en="Accessibility statement" />}
          subtitle={<Bilingual he="עודכן לאחרונה: 2 בנובמבר 2026" en="Last updated: 2 November 2026" />}
        />

        <article className="jm-card p-6 sm:p-10 space-y-6 [&_h2]:jm-h2 [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-ink-600 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1.5 [&_ul]:text-ink-600 [&_ul]:leading-relaxed [&_li]:marker:text-teal [&_a]:text-sky-600 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-sky">
          <Bilingual
            he={
              <>
                <p className="text-base sm:text-lg">
                  JobMatch היא פרויקט אישי, חינמי וללא מטרת רווח, ולכן חובות הנגישות שבתקנות שוויון זכויות לאנשים עם מוגבלות
                  (התאמות נגישות לשירות), התשע&quot;ג-2013 אינן חלות עליה כעל עסק. ובכל זאת, אני רוצה שהאתר יהיה שימושי לכל אדם,
                  כולל אנשים עם מוגבלות, ולכן הוא נבנה לפי הנחיות הנגישות WCAG 2.1 ברמה AA, שעליהן מבוסס התקן הישראלי ת&quot;י
                  5568.
                </p>

                <div>
                  <h2 className="first:mt-0">מה נעשה באתר</h2>
                  <ul>
                    <li>ניווט מלא במקלדת: כל כפתור, קישור ושדה ניתנים להגעה עם Tab, להפעלה עם Enter או רווח, וחלונות נסגרים עם Escape.</li>
                    <li>סימון פוקוס ברור על האלמנט הפעיל, ו&quot;דלג לתוכן&quot; בתחילת כל עמוד.</li>
                    <li>מבנה סמנטי: כותרות היררכיות, אזורי ניווט ותוכן מסומנים, טבלאות עם כותרות, וטפסים עם תוויות.</li>
                    <li>תיאורי טקסט לתמונות ולאייקונים, וטקסט חלופי ללוגואים של חברות.</li>
                    <li>יחס ניגודיות של 4.5:1 לפחות בטקסט רגיל, ואפשרות לניגודיות גבוהה דרך תפריט הנגישות.</li>
                    <li>תמיכה בהגדלת טקסט עד 200% ובזום של הדפדפן בלי אובדן תוכן, ותצוגה מותאמת למסכי טלפון.</li>
                    <li>כיבוד הגדרת &quot;הפחתת תנועה&quot; של מערכת ההפעלה, ואפשרות לעצור אנימציות דרך התפריט.</li>
                    <li>הודעות שגיאה והצלחה מוכרזות לקוראי מסך, ותהליכים ארוכים (כמו בניית תוכנית הכנה) מדווחים על התקדמותם.</li>
                    <li>הראיון הקולי זמין גם כראיון בכתב, עם אותו תוכן ואותו משוב.</li>
                  </ul>

                  <h2>תפריט הנגישות</h2>
                  <p>
                    בפינה התחתונה של כל עמוד יש כפתור נגישות. הוא פותח תפריט שמאפשר להגדיל ולהקטין את הטקסט, להפעיל ניגודיות גבוהה
                    או תצוגה בגווני אפור, להדגיש קישורים, לעבור לגופן קריא יותר עם ריווח מוגדל, להגדיל את הסמן ולעצור אנימציות.
                    ההעדפות נשמרות בדפדפן שלך בלבד, וכפתור &quot;איפוס&quot; מחזיר את ברירת המחדל. אפשר להגיע לכפתור גם במקלדת.
                  </p>

                  <h2>מה עדיין לא מושלם</h2>
                  <ul>
                    <li>תוכן שמגיע ממקורות חיצוניים, כמו תיאורי משרות מאתרי מעסיקים, לא תמיד מגיע עם מבנה נגיש, ואנחנו מנקים אותו ככל האפשר.</li>
                    <li>קבצי PDF שמשתמשים מעלים או שולחים זה לזה הם באחריות שולחיהם.</li>
                    <li>הקלדת קוד בתרגול נעשית בשדה טקסט פשוט; אין עדיין עורך קוד עם תמיכה מלאה בקורא מסך.</li>
                  </ul>
                  <p>אני ממשיך לשפר, ובדיקות נגישות הן חלק מכל שינוי עיצובי.</p>

                  <h2>נתקלתם בבעיה? דברו איתנו</h2>
                  <p>
                    אם משהו באתר אינו נגיש לכם, אשמח לדעת ולתקן. אפשר לכתוב ל-<a href="mailto:maorhomri1@gmail.com">maorhomri1@gmail.com</a> או דרך
                    עמוד <Link href="/ContactUs">צור קשר</Link>. אשתדל להשיב בתוך 7 ימי עבודה.
                  </p>

                  <p className="pt-4">
                    ראה גם: <Link href="/PrivacyPolicy">מדיניות הפרטיות</Link> ו<Link href="/TermsOfConditions">תנאי השימוש</Link>.
                  </p>
                </div>
              </>
            }
            en={
              <>
                <p className="text-base sm:text-lg">
                  JobMatch is a personal, free, non-profit project, so the accessibility duties in the Equal Rights for Persons with
                  Disabilities (Service Accessibility Adjustments) Regulations, 5773-2013 do not apply to it as they would to a
                  business. Even so, I want the site to be usable by everyone, including people with disabilities, so it is built to
                  the WCAG 2.1 guidelines at level AA, on which the Israeli standard SI 5568 is based.
                </p>

                <div>
                  <h2 className="first:mt-0">What has been done on the site</h2>
                  <ul>
                    <li>Full keyboard navigation: every button, link and field can be reached with Tab, activated with Enter or Space, and dialogs close with Escape.</li>
                    <li>A clear focus indicator on the active element, and a &quot;skip to content&quot; link at the start of every page.</li>
                    <li>Semantic structure: hierarchical headings, labelled navigation and content regions, tables with headers, and forms with labels.</li>
                    <li>Text descriptions for images and icons, and alternative text for company logos.</li>
                    <li>A contrast ratio of at least 4.5:1 for regular text, and a high-contrast option in the accessibility menu.</li>
                    <li>Text enlargement up to 200% and browser zoom without loss of content, and a layout adapted to phone screens.</li>
                    <li>Respect for the operating system&apos;s &quot;reduce motion&quot; setting, and an option to stop animations from the menu.</li>
                    <li>Error and success messages are announced to screen readers, and long processes (such as building a preparation plan) report their progress.</li>
                    <li>The voice interview is also available as a written interview, with the same content and the same feedback.</li>
                  </ul>

                  <h2>The accessibility menu</h2>
                  <p>
                    In the bottom corner of every page there is an accessibility button. It opens a menu that lets you enlarge and
                    shrink the text, turn on high contrast or a greyscale display, highlight links, switch to a more readable font with
                    wider spacing, enlarge the cursor and stop animations. The preferences are saved in your browser only, and a
                    &quot;Reset&quot; button restores the defaults. The button can also be reached with the keyboard.
                  </p>

                  <h2>What is still not perfect</h2>
                  <ul>
                    <li>Content that comes from external sources, such as job descriptions from employer sites, does not always arrive with an accessible structure, and we clean it up as far as possible.</li>
                    <li>PDF files that users upload or send to each other are the responsibility of their senders.</li>
                    <li>Code in practice is typed into a plain text field; there is no code editor yet with full screen-reader support.</li>
                  </ul>
                  <p>I keep improving, and accessibility checks are part of every design change.</p>

                  <h2>Ran into a problem? Talk to us</h2>
                  <p>
                    If something on the site is not accessible to you, I would be glad to know and fix it. Write to{" "}
                    <a href="mailto:maorhomri1@gmail.com">maorhomri1@gmail.com</a> or use the <Link href="/ContactUs">Contact</Link> page.
                    I will try to reply within 7 working days.
                  </p>

                  <p className="pt-4">
                    See also: the <Link href="/PrivacyPolicy">Privacy Policy</Link> and the <Link href="/TermsOfConditions">Terms of Use</Link>.
                  </p>
                </div>
              </>
            }
          />
        </article>
      </div>
    </LangBox>
  );
}
