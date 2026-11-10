import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../components/ui";
import { Bilingual, LangBox } from "../lib/i18n/Bilingual";

export const metadata: Metadata = {
  title: "מדיניות פרטיות | JobMatch",
  description: "איזה מידע JobMatch אוספת, למה, עם מי היא משתפת אותו, כמה זמן הוא נשמר ומה הזכויות שלך.",
};

/**
 * Privacy policy, written against what the product actually does (résumé
 * parsing and matching, AI interview coaching, LinkedIn-contact import,
 * messaging with recruiters, optional Gmail / WhatsApp / Telegram links,
 * auto-apply, the insider referral network). Every promise here is checked
 * against the code (2026-11-03 review): retention periods match the TTL
 * indexes in src/app/models, deletion matches api/settings/account, the Gmail
 * flow matches lib/email. Change the code and this page together.
 *
 * The Hebrew and English versions say the same thing, section by section; when
 * one changes, change the other (and the "last updated" date in both).
 */
export default function PrivacyPolicyPage() {
  return (
    <LangBox className="jm-page">
      <div className="max-w-3xl mx-auto">
        <PageHeader
          eyebrow={<Bilingual he="מדיניות פרטיות" en="Privacy policy" />}
          title={<Bilingual he="הפרטיות שלך ב-JobMatch" en="Your privacy at JobMatch" />}
          subtitle={<Bilingual he="עודכן לאחרונה: 3 בנובמבר 2026" en="Last updated: 3 November 2026" />}
        />

        <article className="jm-card p-6 sm:p-10 space-y-6 [&_h2]:jm-h2 [&_h2]:mt-8 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-navy [&_h3]:mt-4 [&_h3]:mb-1 [&_p]:text-ink-600 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1.5 [&_ul]:text-ink-600 [&_ul]:leading-relaxed [&_li]:marker:text-teal [&_a]:text-sky-600 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-sky [&_table]:w-full [&_table]:text-sm [&_th]:text-start [&_th]:font-semibold [&_th]:text-navy [&_th]:p-2 [&_td]:p-2 [&_td]:text-ink-600 [&_td]:align-top [&_tr]:border-b [&_tr]:border-line">
          <Bilingual
            he={
              <>
                <p className="text-base sm:text-lg">
                  JobMatch היא פלטפורמה לחיפוש עבודה בהייטק: היא מתאימה משרות לקורות החיים שלך, מכינה אותך לראיונות בעזרת בינה
                  מלאכותית, ועוזרת לך להגיע לאנשים הנכונים. כדי לעשות את זה אנחנו מעבדים מידע אישי, וחלק ממנו רגיש. המסמך הזה
                  מסביר בשפה פשוטה מה אנחנו אוספים, למה, עם מי זה משותף, כמה זמן זה נשמר ואיך אפשר לשלוט בזה. המדיניות כפופה
                  לחוק הגנת הפרטיות, התשמ&quot;א-1981 ולתקנותיו, ולמשתמשים מהאיחוד האירופי גם ל-GDPR.
                </p>

                <div>
                  <h2 className="first:mt-0">1. מי מפעיל את השירות</h2>
                  <p>
                    JobMatch היא פרויקט אישי של מאור חומרי, מפתח/ת עצמאי/ת, ולא של חברה או עסק. השירות ניתן בחינם, בלי תשלום
                    ובלי פרסומות, ואין בו מכירה או מסחר במידע. &quot;אנחנו&quot; במסמך הזה הוא המפעיל/ה. לכל שאלה או בקשה בנושא
                    פרטיות אפשר לפנות בכתובת <a href="mailto:maorhomri1@gmail.com">maorhomri1@gmail.com</a> או דרך עמוד{" "}
                    <Link href="/ContactUs">צור קשר</Link>.
                  </p>

                  <h2>2. איזה מידע אנחנו אוספים</h2>
                  <h3>מידע שאתה מוסר לנו</h3>
                  <ul>
                    <li>פרטי חשבון: שם מלא, כתובת מייל, טלפון, סיסמה (נשמרת מוצפנת באופן חד-כיווני), תפקיד נוכחי, תמונת פרופיל.</li>
                    <li>
                      קורות חיים: הקובץ שהעלית, הטקסט שחולץ ממנו, גרסה מובנית שנבנתה ממנו, ציון והערות שיפור, והעדפות חיפוש (תפקידים,
                      רמה, ערים, אופן עבודה).
                    </li>
                    <li>מה שאתה כותב בצ&apos;אט ResumeAI ובסימולציות הראיון, כולל קבצים שאתה מצרף, ותשובות לשאלות תרגול וקוד.</li>
                    <li>הודעות וקבצים שאתה שולח למגייסים דרך המערכת.</li>
                    <li>
                      אנשי קשר שייבאת מקובץ הייצוא של LinkedIn: שם, חברה, תפקיד, קישור לפרופיל, תאריך החיבור וכתובת מייל אם כלולה
                      בקובץ. ראה סעיף 5א.
                    </li>
                    <li>תוצאות ראיונות שאתה מדווח (מה שאלו, איך הלך) ושאלות ראיון שאתה משתף.</li>
                    <li>אם הצטרפת כממליץ/ה מבפנים: שם החברה, התפקיד, מייל העבודה (לאימות), כמה פניות אתה מוכן לקבל, והערה לפונים. ראה סעיף 5ב.</li>
                  </ul>
                  <h3>מידע שנוצר תוך כדי שימוש</h3>
                  <ul>
                    <li>ייצוגים מספריים (embeddings) של קורות החיים והמשרות, שמשמשים להתאמה. אי אפשר לשחזר מהם את הטקסט המקורי.</li>
                    <li>ציוני התאמה, הסברי התאמה, תוכניות הכנה לראיון, תמלילים ומשובים של ראיונות דמה, ציוני תרגול.</li>
                    <li>&quot;זיכרון המאמן&quot;: סיכום של החוזקות והנקודות לשיפור שלך לאורך הראיונות, כדי שההכנה תשתפר עם הזמן.</li>
                    <li>פעילות בחשבון: משרות ששמרת או דחית, הגשות מועמדות, התראות, וספירת שימוש יומית בפעולות שעולות כסף.</li>
                    <li>מידע טכני: כתובת IP וסוכן משתמש, לצורכי אבטחה והגבלת קצב בלבד. אין אצלנו כלי אנליטיקה של צד שלישי ואין פיקסלים פרסומיים.</li>
                  </ul>
                  <h3>מידע מחיבורים שאתה בוחר להפעיל</h3>
                  <ul>
                    <li>התחברות עם Google או Facebook: שם, מייל ותמונה מהספק. איננו מקבלים את הסיסמה שלך אצלם.</li>
                    <li>מעקב הגשות דרך Gmail (אופציונלי): ראה סעיף 4א.</li>
                    <li>WhatsApp או Telegram (אופציונלי): מזהה הצ&apos;אט שלך אצל הספק, כדי לשלוח לך התראות. &quot;STOP&quot; מנתק.</li>
                    <li>
                      הגשה אוטומטית (אופציונלי, כבויה כברירת מחדל): הסוכן ממלא טפסי מועמדות באתרי מעסיקים עם הפרטים וקורות החיים
                      שלך, רק כשהפעלת אותה, ולמשרות שעוברות את סף ההתאמה שקבעת או שבחרת במפורש. אנחנו שומרים את המשרה, הסטטוס, הערות
                      ההגשה ואת גרסת קורות החיים שנשלחה. איננו יוצרים חשבונות אצל מעסיקים ואיננו שומרים סיסמאות לאתרים שלהם. המידע
                      שנשלח בטופס עובר למעסיק ולמערכת הגיוס שלו, וחלה עליו מדיניות הפרטיות שלהם.
                    </li>
                  </ul>

                  <h2>3. למה אנחנו משתמשים במידע</h2>
                  <ul>
                    <li>להפעיל את השירות: התאמת משרות, בניית קורות חיים, הכנה לראיונות, תרגול, הודעות, התראות.</li>
                    <li>להתאים את החוויה אליך: הפיד, הסברי ההתאמה והמאמן מבוססים על קורות החיים והפעילות שלך.</li>
                    <li>אבטחה, מניעת שימוש לרעה, הגבלת קצב ותקינות המערכת.</li>
                    <li>שיפור השירות על בסיס נתונים מצטברים ואנונימיים (למשל, אילו שאלות נשאלות בראיונות בחברה מסוימת).</li>
                    <li>
                      אימון &quot;ציון הסיכוי לראיון&quot;: המודל לומד מתוצאות אמיתיות של מועמדויות (האם הגיעה תשובה או זימון) יחד עם
                      מאפייני ההתאמה, כולל סטטוסים שזוהו מ-Gmail אם חיברת אותו. המודל שומר רק משקלים מספריים מצטברים, לא פרטים
                      שלך. אפשר להוציא את התוצאות שלך מהאימון בכל רגע, ב<Link href="/Settings#privacy">הגדרות ← פרטיות</Link>.
                    </li>
                    <li>
                      הרחבת מאגר החברות: שמות החברות שמופיעות באנשי הקשר של המשתמשים (בלי שמות האנשים) נספרים יחד כדי לגלות חברות
                      חדשות שכדאי לסרוק בהן משרות.
                    </li>
                    <li>יצירת קשר איתך לגבי החשבון שלך. אין דיוור שיווקי בכלל, כי אין כאן מה למכור.</li>
                  </ul>
                  <p>
                    הבסיס המשפטי לעיבוד הוא ביצוע השירות שביקשת, הסכמתך (לחיבורים האופציונליים), והאינטרס הלגיטימי שלנו באבטחה
                    ובשיפור השירות.
                  </p>

                  <h2>4. בינה מלאכותית וספקי עיבוד</h2>
                  <p>
                    חלקים מרכזיים בשירות מבוססים על מודלי שפה. כדי לייצר התאמה, תוכנית הכנה, ראיון דמה או ניסוח, אנחנו שולחים
                    לספקי המודלים את הטקסט הרלוונטי: קורות החיים שלך, תיאור המשרה, והשיחה. הספקים כיום הם OpenAI ו-Anthropic. לפי
                    תנאי ה-API שלהם, מידע שנשלח דרך ה-API אינו משמש לאימון המודלים שלהם. בראיון קולי, הדיבור שלך מועבר לספק
                    לתמלול ולניתוח בזמן אמת ואינו נשמר אצלנו כקובץ שמע.
                  </p>
                  <p>
                    שאר הספקים שמחזיקים או מעבדים מידע בשבילנו: MongoDB Atlas (מסד הנתונים), Amazon Web Services (אחסון קבצים,
                    אזור שטוקהולם), Vercel (אירוח האפליקציה), Google Cloud (השרת שממלא טפסי מועמדות בהגשה אוטומטית, אזור בלגיה),
                    ספק שליחת המייל, ובהתאם לחיבורים שהפעלת גם Google, Meta ו-Telegram. חלק מהספקים נמצאים מחוץ לישראל, והעברת המידע אליהם נעשית לפי תקנות הגנת הפרטיות (העברת מידע
                    אל מחוץ לגבולות המדינה).
                  </p>

                  <h2>4א. חיבור Gmail</h2>
                  <p>
                    החיבור אופציונלי ונועד לדבר אחד: לעדכן את סטטוס המועמדויות שלך (התקבלה, זימון, דחייה) בלי שתצטרך לעשות את זה ידנית.
                  </p>
                  <ul>
                    <li>ההרשאה היא קריאה בלבד (<code>gmail.readonly</code>). איננו שולחים, מוחקים או משנים מיילים.</li>
                    <li>
                      אנחנו מחפשים רק הודעות מ-14 הימים האחרונים שמתאימות למילות חיפוש של מועמדות (למשל &quot;application&quot;,
                      &quot;interview&quot;), ומדלגים על קידומי מכירות ורשתות חברתיות.
                    </li>
                    <li>
                      לכל הודעה כזו נשלחים לספק המודלים השולח, הנושא, התאריך ועד 1,500 התווים הראשונים של הגוף, כדי לסווג אם מדובר
                      בעדכון למועמדות ומה הסטטוס. לפי תנאי ה-API של הספק, המידע אינו משמש לאימון המודלים שלו.
                    </li>
                    <li>אנחנו שומרים מכל הודעה רלוונטית רק את השולח, הנושא, התאריך והסטטוס שזוהה. גוף ההודעה לא נשמר.</li>
                    <li>אסימון הגישה נשמר מוצפן. ניתוק מההגדרות מוחק אותו, ואפשר גם לבטל את ההרשאה ישירות בחשבון Google.</li>
                  </ul>
                  <p dir="ltr" className="text-sm">
                    JobMatch&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
                    <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
                      Google API Services User Data Policy
                    </a>
                    , including the Limited Use requirements. Gmail data is used only to update the status of your own job applications,
                    is never used for advertising, is not sold, and is not read by people except with your explicit consent, for
                    security purposes, or as required by law.
                  </p>

                  <h2>5. עם מי המידע משותף</h2>
                  <ul>
                    <li>
                      מגייסים ומעסיקים: רק כשאתה בוחר. כשאתה מגיש מועמדות למשרה שפורסמה במערכת, המגייס רואה את קורות החיים
                      והפרטים שלך. כשאתה שולח הודעה או קובץ, הצד השני רואה אותם.
                    </li>
                    <li>אנשי קשר להפניה: ניסוח הפנייה נוצר בשבילך; אתה זה ששולח אותו, בערוץ שאתה בוחר.</li>
                    <li>שאלות ראיון שדיווחת עשויות להופיע לאחרים בלי שם ובלי פרטים מזהים.</li>
                    <li>ספקי שירות כמפורט בסעיף 4, הכפופים להתחייבויות סודיות ואבטחה.</li>
                    <li>רשויות, אם החוק מחייב. המידע שלך לא נמכר, לא מושכר ולא מועבר לצדדים שלישיים לצורכי שיווק.</li>
                  </ul>

                  <h2>5א. אנשי קשר שייבאת</h2>
                  <p>
                    אנשי הקשר הם מידע על אנשים אחרים, שלא נרשמו ל-JobMatch. לכן אנחנו משתמשים בהם רק בשבילך: כדי להראות לך מי אתה
                    מכיר בחברות שיש בהן משרות שמתאימות לך, ולנסח בשבילך פנייה. איננו פונים אליהם, איננו מציגים אותם למשתמשים אחרים
                    ואיננו מעשירים אותם במידע ממקורות אחרים. אתה אחראי לייבא רק אנשי קשר שמותר לך לשמור, ואפשר למחוק את כולם בכל רגע
                    מעמוד אנשי הקשר. אדם שמופיע אצלך ורוצה שנמחק אותו יכול לפנות אלינו ונמחק אותו.
                  </p>

                  <h2>5ב. רשת הממליצים מבפנים</h2>
                  <ul>
                    <li>
                      ממליץ/ה: מייל העבודה משמש רק לאימות שאתה עובד בחברה (קוד חד-פעמי) ואינו מוצג לאחרים. מועמדים רואים את שמך, החברה,
                      התפקיד וההערה שכתבת. אפשר להפסיק לקבל פניות בכל רגע מההגדרות, ולעזוב את הרשת לגמרי בפנייה אלינו או במחיקת החשבון.
                    </li>
                    <li>
                      מועמד/ת: כשאתה שולח בקשת הפניה, הממליץ שבחרת רואה את שמך, ההודעה שלך וקורות החיים שלך, וזה הכל. קורות החיים
                      נפתחים לו רק בקישור זמני, ורק כל עוד הבקשה לא נדחתה, בוטלה או פגה.
                    </li>
                  </ul>

                  <h2>6. עוגיות ואחסון בדפדפן</h2>
                  <p>
                    אנחנו משתמשים בעוגייה אחת הכרחית להתחברות (<code>token</code>), שתוקפה שבעה ימים ומתחדש בזמן שימוש. באחסון המקומי
                    של הדפדפן נשמרות העדפות כמו הגדרות הנגישות וטיוטות שלא נשלחו. אין עוגיות פרסום או מעקב של צד שלישי.
                  </p>

                  <h2>7. כמה זמן המידע נשמר</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>מידע</th>
                        <th>משך השמירה</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>חשבון, קורות חיים, היסטוריית ראיונות ותרגול</td>
                        <td>כל עוד החשבון פעיל. מחיקת חשבון מוחקת מיד</td>
                      </tr>
                      <tr>
                        <td>הודעות וקבצים בשיחות עם מגייסים</td>
                        <td>כל עוד השיחה קיימת אצל אחד הצדדים</td>
                      </tr>
                      <tr>
                        <td>אנשי קשר שייבאת</td>
                        <td>עד שתמחק אותם או את החשבון</td>
                      </tr>
                      <tr>
                        <td>אסימוני Gmail / מזהי WhatsApp ו-Telegram</td>
                        <td>עד הניתוק מההגדרות</td>
                      </tr>
                      <tr>
                        <td>פיד משרות מדורג</td>
                        <td>שעה, ואז נמחק אוטומטית</td>
                      </tr>
                      <tr>
                        <td>מטמון ציוני התאמה</td>
                        <td>14 יום, ואז נמחק אוטומטית</td>
                      </tr>
                      <tr>
                        <td>תשובות מוצעות לשאלות מועמדות</td>
                        <td>120 יום, ואז נמחקות אוטומטית</td>
                      </tr>
                      <tr>
                        <td>התראות במערכת</td>
                        <td>90 יום</td>
                      </tr>
                      <tr>
                        <td>רישום שימוש בבינה מלאכותית (כמה שימוש ועלות, לבקרת הוצאות)</td>
                        <td>90 יום. במחיקת חשבון הקישור אליך נמחק והסכומים נשארים בלי שם</td>
                      </tr>
                      <tr>
                        <td>רישומי הגבלת קצב (כתובת IP)</td>
                        <td>24 שעות</td>
                      </tr>
                      <tr>
                        <td>יומני שרת אצל ספק האירוח</td>
                        <td>לפי מדיניות הספק, כיום עד יום אחד</td>
                      </tr>
                    </tbody>
                  </table>

                  <h2>8. אבטחת מידע</h2>
                  <p>
                    התקשורת מוצפנת (HTTPS), סיסמאות נשמרות כ-hash בלבד, אסימוני גישה לשירותים חיצוניים נשמרים מוצפנים, קבצים
                    נשמרים בשם אקראי ונפתחים רק בקישור חתום וזמני, ולכל פעולה יש הגבלת קצב ומכסה יומית. הגישה למערכות ולמידע היא
                    של המפעיל בלבד, ורק כשזה נדרש לתפעול השירות או לטיפול בתקלה. אף מערכת אינה חסינה לחלוטין; אם יתגלה אירוע אבטחה שמשפיע עליך, נודיע לך ולרשות
                    להגנת הפרטיות כנדרש בחוק.
                  </p>

                  <h2>9. הזכויות שלך</h2>
                  <ul>
                    <li>עיון: לקבל עותק של המידע שלך, בפנייה במייל.</li>
                    <li>תיקון: לעדכן פרטים לא מדויקים, רובם ישירות מעמוד ההגדרות.</li>
                    <li>מחיקה: למחוק את החשבון וכל המידע שבו, מיד, מעמוד ההגדרות, או בפנייה אלינו.</li>
                    <li>אימון: להוציא את התוצאות שלך מאימון ציון הסיכוי, בהגדרות ← פרטיות.</li>
                    <li>ניתוק חיבורים: Gmail, WhatsApp, Telegram והגשה אוטומטית ניתנים לניתוק בכל רגע.</li>
                    <li>התנגדות ודיוור: לבקש להפסיק שימושים מסוימים או התראות.</li>
                    <li>תלונה: לפנות לרשות להגנת הפרטיות, ולמשתמשי האיחוד האירופי גם לרשות הפיקוח במדינתם.</li>
                  </ul>
                  <p>נענה לבקשות בתוך 30 יום. ייתכן שנבקש אימות זהות לפני מסירת מידע.</p>

                  <h2>10. ילדים</h2>
                  <p>השירות מיועד לבני 18 ומעלה. איננו אוספים ביודעין מידע על קטינים; אם נגלה כזה, נמחק אותו.</p>

                  <h2>11. שינויים במדיניות</h2>
                  <p>
                    כשנעדכן את המדיניות נשנה את התאריך בראש העמוד, ובשינויים מהותיים נודיע גם בהתראה במערכת. אם נרצה להשתמש
                    במידע שכבר נמצא אצלנו למטרה חדשה שלא מופיעה כאן, נבקש את הסכמתך לפני כן, ולא נסתמך על המשך השימוש בלבד.
                  </p>

                  <p className="pt-4">
                    ראה גם: <Link href="/TermsOfConditions">תנאי השימוש</Link> ו<Link href="/Accessibility">הצהרת הנגישות</Link>.
                  </p>
                </div>
              </>
            }
            en={
              <>
                <p className="text-base sm:text-lg">
                  JobMatch is a job-search platform for the tech industry: it matches jobs to your résumé, prepares you for interviews
                  with artificial intelligence, and helps you reach the right people. To do that we process personal information, some
                  of it sensitive. This document explains in plain language what we collect, why, who it is shared with, how long it is
                  kept and how you can control it. The policy is subject to the Israeli Protection of Privacy Law, 5741-1981 and its
                  regulations, and, for users in the European Union, also to the GDPR.
                </p>

                <div>
                  <h2 className="first:mt-0">1. Who operates the service</h2>
                  <p>
                    JobMatch is a personal project of Maor Homri, an independent developer, not of a company or a business. The service
                    is free, with no payment and no advertising, and there is no sale of or trade in information. &quot;We&quot; in
                    this document means the operator. For any privacy question or request, write to{" "}
                    <a href="mailto:maorhomri1@gmail.com">maorhomri1@gmail.com</a> or use the <Link href="/ContactUs">Contact</Link> page.
                  </p>

                  <h2>2. What information we collect</h2>
                  <h3>Information you give us</h3>
                  <ul>
                    <li>Account details: full name, email address, phone, password (stored as a one-way hash), current role, profile picture.</li>
                    <li>
                      Résumé: the file you uploaded, the text extracted from it, a structured version built from it, a score and
                      improvement notes, and your search preferences (roles, level, cities, work mode).
                    </li>
                    <li>What you write in the ResumeAI chat and in interview simulations, including files you attach, and your answers to practice and coding questions.</li>
                    <li>Messages and files you send to recruiters through the system.</li>
                    <li>
                      Contacts you imported from your LinkedIn export file: name, company, role, profile link, connection date and email
                      address if it is included in the file. See section 5a.
                    </li>
                    <li>Interview outcomes you report (what was asked, how it went) and interview questions you share.</li>
                    <li>
                      If you joined as an insider referrer: company name, role, work email (for verification), how many requests you are
                      willing to receive, and a note to applicants. See section 5b.
                    </li>
                  </ul>
                  <h3>Information created while you use the service</h3>
                  <ul>
                    <li>Numeric representations (embeddings) of résumés and jobs, used for matching. The original text cannot be reconstructed from them.</li>
                    <li>Match scores, match explanations, interview preparation plans, transcripts and feedback from mock interviews, practice scores.</li>
                    <li>&quot;Coach memory&quot;: a summary of your strengths and areas to improve across your interviews, so preparation gets better over time.</li>
                    <li>Account activity: jobs you saved or dismissed, applications, notifications, and a daily usage count for actions that cost money.</li>
                    <li>Technical information: IP address and user agent, for security and rate limiting only. We have no third-party analytics tools and no advertising pixels.</li>
                  </ul>
                  <h3>Information from connections you choose to enable</h3>
                  <ul>
                    <li>Sign-in with Google or Facebook: name, email and picture from the provider. We do not receive your password with them.</li>
                    <li>Application tracking via Gmail (optional): see section 4a.</li>
                    <li>WhatsApp or Telegram (optional): your chat ID with the provider, so we can send you notifications. &quot;STOP&quot; disconnects.</li>
                    <li>
                      Auto-apply (optional, off by default): the agent fills in application forms on employer sites with your details and
                      résumé, only when you have turned it on, and only for jobs that pass the match threshold you set or that you chose
                      explicitly. We keep the job, the status, the application notes and the résumé version that was sent. We do not
                      create accounts with employers and do not store passwords for their sites. The information sent in the form goes to
                      the employer and its recruiting system, and their privacy policy applies to it.
                    </li>
                  </ul>

                  <h2>3. Why we use the information</h2>
                  <ul>
                    <li>To run the service: job matching, résumé building, interview preparation, practice, messages, notifications.</li>
                    <li>To tailor the experience to you: the feed, the match explanations and the coach are based on your résumé and your activity.</li>
                    <li>Security, abuse prevention, rate limiting and keeping the system healthy.</li>
                    <li>Improving the service based on aggregated, anonymous data (for example, which questions are asked in interviews at a given company).</li>
                    <li>
                      Training the &quot;interview likelihood score&quot;: the model learns from real application outcomes (whether a
                      reply or an invitation came) together with the match features, including statuses detected from Gmail if you
                      connected it. The model keeps only aggregated numeric weights, not your details. You can exclude your outcomes from
                      training at any time, in <Link href="/Settings#privacy">Settings → Privacy</Link>.
                    </li>
                    <li>
                      Growing the company catalogue: the names of companies that appear in users&apos; contacts (without the people&apos;s
                      names) are counted together to discover new companies worth scanning for jobs.
                    </li>
                    <li>Contacting you about your account. There is no marketing email at all, because there is nothing to sell here.</li>
                  </ul>
                  <p>
                    The legal basis for processing is the performance of the service you asked for, your consent (for the optional
                    connections), and our legitimate interest in security and in improving the service.
                  </p>

                  <h2>4. Artificial intelligence and processors</h2>
                  <p>
                    Central parts of the service are based on language models. To produce a match, a preparation plan, a mock interview
                    or a piece of writing, we send the relevant text to the model providers: your résumé, the job description, and the
                    conversation. The providers today are OpenAI and Anthropic. Under their API terms, data sent through the API is not
                    used to train their models. In a voice interview, your speech is streamed to the provider for transcription and
                    analysis in real time and is not stored with us as an audio file.
                  </p>
                  <p>
                    The other providers that hold or process information for us: MongoDB Atlas (the database), Amazon Web Services (file
                    storage, Stockholm region), Vercel (application hosting), Google Cloud (the server that fills in application forms
                    for auto-apply, Belgium region), the email delivery provider, and, depending on the connections you enabled, also
                    Google, Meta and Telegram. Some of the providers are outside Israel, and information is transferred to them in
                    accordance with the Protection of Privacy Regulations (Transfer of Data Abroad).
                  </p>

                  <h2>4a. Gmail connection</h2>
                  <p>
                    The connection is optional and serves one purpose: updating the status of your applications (received, interview,
                    rejection) without you having to do it by hand.
                  </p>
                  <ul>
                    <li>The permission is read-only (<code>gmail.readonly</code>). We do not send, delete or modify emails.</li>
                    <li>
                      We look only at messages from the last 14 days that match application-related search terms (for example
                      &quot;application&quot;, &quot;interview&quot;), and skip promotions and social updates.
                    </li>
                    <li>
                      For each such message, the sender, subject, date and up to the first 1,500 characters of the body are sent to the
                      model provider, to classify whether it is an application update and what the status is. Under the provider&apos;s
                      API terms, the data is not used to train its models.
                    </li>
                    <li>From each relevant message we keep only the sender, subject, date and the detected status. The body of the message is not stored.</li>
                    <li>The access token is stored encrypted. Disconnecting from Settings deletes it, and you can also revoke the permission directly in your Google account.</li>
                  </ul>
                  <p className="text-sm">
                    JobMatch&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
                    <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
                      Google API Services User Data Policy
                    </a>
                    , including the Limited Use requirements. Gmail data is used only to update the status of your own job applications,
                    is never used for advertising, is not sold, and is not read by people except with your explicit consent, for
                    security purposes, or as required by law.
                  </p>

                  <h2>5. Who the information is shared with</h2>
                  <ul>
                    <li>
                      Recruiters and employers: only when you choose. When you apply to a job posted in the system, the recruiter sees
                      your résumé and details. When you send a message or a file, the other side sees them.
                    </li>
                    <li>Referral contacts: the outreach message is drafted for you; you are the one who sends it, in the channel you choose.</li>
                    <li>Interview questions you reported may be shown to others without your name or any identifying details.</li>
                    <li>Service providers as listed in section 4, bound by confidentiality and security commitments.</li>
                    <li>Authorities, if the law requires it. Your information is not sold, not rented and not passed to third parties for marketing.</li>
                  </ul>

                  <h2>5a. Contacts you imported</h2>
                  <p>
                    Contacts are information about other people, who have not signed up to JobMatch. So we use them only for you: to show
                    you who you know at companies that have jobs matching you, and to draft an outreach message for you. We do not contact
                    them, do not show them to other users and do not enrich them with information from other sources. You are
                    responsible for importing only contacts you are allowed to keep, and you can delete all of them at any time from the
                    Contacts page. A person who appears in your contacts and wants us to delete them can contact us and we will.
                  </p>

                  <h2>5b. The insider referral network</h2>
                  <ul>
                    <li>
                      Referrer: your work email is used only to verify that you work at the company (one-time code) and is not shown to
                      others. Candidates see your name, company, role and the note you wrote. You can stop receiving requests at any
                      time from Settings, and leave the network entirely by contacting us or by deleting your account.
                    </li>
                    <li>
                      Candidate: when you send a referral request, the referrer you chose sees your name, your message and your résumé,
                      and that is all. Your résumé opens for them only through a temporary link, and only as long as the request has not
                      been declined, cancelled or expired.
                    </li>
                  </ul>

                  <h2>6. Cookies and browser storage</h2>
                  <p>
                    We use a single essential cookie for signing in (<code>token</code>), valid for seven days and renewed while you use
                    the service. The browser&apos;s local storage holds preferences such as accessibility settings and unsent drafts.
                    There are no advertising or third-party tracking cookies.
                  </p>

                  <h2>7. How long information is kept</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Information</th>
                        <th>Retention</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Account, résumé, interview and practice history</td>
                        <td>As long as the account is active. Deleting the account deletes it immediately</td>
                      </tr>
                      <tr>
                        <td>Messages and files in conversations with recruiters</td>
                        <td>As long as the conversation exists for either side</td>
                      </tr>
                      <tr>
                        <td>Contacts you imported</td>
                        <td>Until you delete them or the account</td>
                      </tr>
                      <tr>
                        <td>Gmail tokens / WhatsApp and Telegram IDs</td>
                        <td>Until disconnected from Settings</td>
                      </tr>
                      <tr>
                        <td>Ranked job feed</td>
                        <td>One hour, then deleted automatically</td>
                      </tr>
                      <tr>
                        <td>Match score cache</td>
                        <td>14 days, then deleted automatically</td>
                      </tr>
                      <tr>
                        <td>Suggested answers to application questions</td>
                        <td>120 days, then deleted automatically</td>
                      </tr>
                      <tr>
                        <td>In-app notifications</td>
                        <td>90 days</td>
                      </tr>
                      <tr>
                        <td>AI usage log (how much usage and cost, for spend control)</td>
                        <td>90 days. On account deletion the link to you is removed and the amounts remain without a name</td>
                      </tr>
                      <tr>
                        <td>Rate-limit records (IP address)</td>
                        <td>24 hours</td>
                      </tr>
                      <tr>
                        <td>Server logs at the hosting provider</td>
                        <td>Per the provider&apos;s policy, currently up to one day</td>
                      </tr>
                    </tbody>
                  </table>

                  <h2>8. Information security</h2>
                  <p>
                    Traffic is encrypted (HTTPS), passwords are stored only as hashes, access tokens for external services are stored
                    encrypted, files are stored under random names and opened only through a signed, temporary link, and every action
                    has a rate limit and a daily quota. Access to the systems and the data is the operator&apos;s alone, and only when
                    needed to run the service or to handle a fault. No system is completely immune; if a security incident affecting you
                    is discovered, we will notify you and the Privacy Protection Authority as required by law.
                  </p>

                  <h2>9. Your rights</h2>
                  <ul>
                    <li>Access: receive a copy of your information, by email request.</li>
                    <li>Correction: update inaccurate details, most of them directly from the Settings page.</li>
                    <li>Deletion: delete the account and all the information in it, immediately, from the Settings page, or by contacting us.</li>
                    <li>Training: exclude your outcomes from training the likelihood score, in Settings → Privacy.</li>
                    <li>Disconnecting: Gmail, WhatsApp, Telegram and auto-apply can be disconnected at any time.</li>
                    <li>Objection and notifications: ask us to stop certain uses or notifications.</li>
                    <li>Complaint: contact the Privacy Protection Authority, and, for EU users, also the supervisory authority in your country.</li>
                  </ul>
                  <p>We respond to requests within 30 days. We may ask you to verify your identity before handing over information.</p>

                  <h2>10. Children</h2>
                  <p>The service is intended for people aged 18 and over. We do not knowingly collect information about minors; if we discover any, we will delete it.</p>

                  <h2>11. Changes to this policy</h2>
                  <p>
                    When we update the policy we will change the date at the top of the page, and for material changes we will also
                    notify you in-app. If we want to use information we already hold for a new purpose not listed here, we will ask for
                    your consent first, and will not rely on continued use alone.
                  </p>

                  <p className="pt-4">
                    See also: the <Link href="/TermsOfConditions">Terms of Use</Link> and the{" "}
                    <Link href="/Accessibility">Accessibility statement</Link>.
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
