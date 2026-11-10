import type { Article } from "../articles";

const article: Article = {
  slug: "first-technical-interview",
  date: "2026-10-05",
  readMinutes: 8,
  title: "הראיון הטכני הראשון: מה באמת בודקים אצל ג'וניור",
  excerpt:
    "לא מצפים שתדע/י הכל. מצפים לראות איך את/ה חושב/ת כשלא יודעים. המשפך הישראלי שלב-שלב, בעיה אחת פתורה בקול רם, איך מתמודדים עם 'לא יודע/ת', משימות בית, ותוכנית הכנה של שבוע.",
  tags: ["ראיונות", "טכני", "ג'וניור", "משימת בית"],
  sections: [
    {
      paragraphs: [
        "אף אחד לא מצפה מג'וניור לדעת הכל. הראיון הטכני למשרה הראשונה הוא לא מבחן על כמה שיננת, אלא על איך את/ה חושב/ת כשאת/ה לא יודע/ת, איך את/ה מתקשר/ת תוך כדי עבודה, והאם מה שכתוב בקורות החיים באמת שלך. ברגע שמסתכלים על זה ככה, ההכנה משתנה: פחות לדחוס אלגוריתמים שלעולם לא ישאלו עליהם, יותר תרגול של חשיבה בקול רם על בעיות קטנות. במאמר הזה עוברים על המשפך הישראלי שלב אחרי שלב, פותרים בעיה אחת בדיוק כמו שמראיינים רוצים לשמוע אותה, ומסיימים בתוכנית של שבוע.",
      ],
    },
    {
      heading: "המשפך הישראלי, שלב אחרי שלב",
      paragraphs: [
        "רוב חברות ההייטק בישראל, מסטארטאפ של 30 איש ועד המשרד של Amazon בתל אביב, מריצות משפך דומה של ארבעה שלבים. השמות והסדר משתנים, אבל השאלה שכל שלב בא לענות עליה לא משתנה.",
      ],
      bullets: [
        "שיחת HR (15–30 דקות, טלפון או Zoom). בודקים: זמינות, ציפיות שכר, מיקום, עברית/אנגלית, האם הסיפור של קורות החיים מחזיק מים, ומוטיבציה בסיסית. זה מסנן, לא שיחה שאפשר לנצח בה, אבל אפשר להפסיד בה: תהיה/י קונקרטי/ת לגבי מתי את/ה יכול/ה להתחיל ומה את/ה מחפש/ת, ותשאל/י מה השלבים הבאים.",
        "ראיון טכני (45–90 דקות, מהנדס אחד או שניים). בודקים יסודות ודרך חשיבה. לג'וניור זה בדרך כלל: כמה שאלות על הפרויקטים שלך, בעיה או שתיים של קוד בעורך משותף או על לוח, וכמה שאלות ידע על ה-stack שבמשרה (מה קורה כשמקלידים URL בדפדפן, מה זה Promise, מה זה index בבסיס נתונים).",
        "משימת בית או live coding. יש חברות ששולחות משימה של 4–8 שעות (REST API קטן, קומפוננטה שמושכת נתונים ומסננת, כלי CLI); אחרות עושות במקום זה סשן live coding ארוך יותר. בודקים אם את/ה מסוגל/ת לסיים משהו מקצה לקצה, לבנות קוד עם מבנה, ולהסביר בחירות.",
        "ראיון אחרון. בדרך כלל ראש צוות או CTO, לפעמים ראיון זוגי עם system design קל ('איך היית בונה מקצר כתובות') ושאלות על תרבות. בודקים אם רוצים לעבוד איתך כל יום, ואם את/ה רוצה לעבוד איתם.",
      ],
    },
    {
      paragraphs: [
        "חברות גדולות מוסיפות phone screen טכני לפני היום המלא ומתקנננות את סגנון השאלות. בנק השאלות ב-[JobMatch](/interview-questions) אוסף שאלות שמועמדים דיווחו עליהן לפי חברה, למשל [Amazon](/interview-questions/amazon), כך שאפשר לראות איך הלולאה נראתה אצל אחרים. לוח זמנים: סטארטאפ יכול לסגור את כל המשפך בשבועיים; חברה גדולה, ארבעה עד שישה שבועות. אם עברו עשרה ימים בלי תשובה אחרי שלב, מייל קצר ומנומס של שורה אחת זה בסדר גמור.",
      ],
    },
    {
      heading: "מה השלב הטכני באמת מודד אצל ג'וניור",
      paragraphs: [
        "מי שמראיין ג'וניורים יודע שהוא לא מגייס מומחיות. הוא מחליט אם אחרי חצי שנה עם מנטור תהיה/י פרודוקטיבי/ת. ארבעה דברים הוא מסתכל עליהם:",
      ],
      bullets: [
        "יסודות שאפשר להשתמש בהם, לא לדקלם: מערכים, מחרוזות, hash maps, sets, רקורסיה, Big-O ברמה של 'זה O(n) וזה O(n²) והנה למה' ([דף העזר הזה](https://www.bigocheatsheet.com/) מספיק), בקשה ותשובה ב-HTTP ([הסקירה של MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview) היא שעה אחת טובה), ומה זה async בשפה שלך.",
        "דרך חשיבה: האם את/ה שואל/ת איך הקלט נראה לפני שמתחילים לכתוב, האם את/ה בודק/ת מקרי קצה בלי שיגידו לך, האם את/ה שם/ה לב לבאג של עצמך.",
        "כנות: 'לא נתקלתי בזה, אבל הייתי ניגש/ת ככה' מנצח תשובה בטוחה ושגויה בכל פעם. תשובה בטוחה ושגויה היא הסיבה הנפוצה ביותר שג'וניורים נופלים.",
        "בעלות על קורות החיים: כל שורה של פרויקט תיחקר. אם כתבת 'בניתי אפליקציית React עם authentication', תצפה/י ל'איפה שמרת את ה-token, ולמה דווקא שם?'",
      ],
    },
    {
      paragraphs: [
        "שימו לב למה שלא מודדים: מהירות. פתרון O(n) נקי שהגעת אליו אחרי 20 דקות עם שאלות טובות שווה יותר מפתרון של 5 דקות שאת/ה לא יכול/ה להסביר.",
      ],
    },
    {
      heading: "לחשוב בקול רם: ספירת תדירות מילים, כמו שצריך",
      paragraphs: [
        "הבעיה: 'בהינתן טקסט, תחזיר/י כמה פעמים כל מילה מופיעה'. לוקח חמש שורות לפתור אותה ו-20 דקות לפתור אותה טוב. ככה נראות 20 הדקות.",
        "לפני שורת קוד אחת, שאלות הבהרה. הן לא מראות חולשה; הן בדיוק מה שמחפשים:",
      ],
      bullets: [
        "'זה case-sensitive? The ו-the זו אותה מילה?' (בדרך כלל: לא, מורידים לאותיות קטנות)",
        "'מה זה מילה: כל מה שבין רווחים, או שאני מוריד/ה סימני פיסוק? hello, עם פסיק זה אותו דבר כמו hello?'",
        "'הטקסט יכול להיות ריק? יכולים להיות כמה רווחים או שורות חדשות בין מילים?'",
        "'כמה גדול הקלט: משפט, או קובץ שלא נכנס לזיכרון?'",
        "'מה להחזיר: map, רשימה ממוינת לפי ספירה, את ה-10 הנפוצות?'",
      ],
    },
    {
      paragraphs: [
        "אחר כך מצהירים על התוכנית לפני שכותבים: 'אני אפצל לפי רווחים, אנרמל כל token לאותיות קטנות ואוריד פיסוק מהקצוות שלו, ואספור ב-hash map: לכל token, counts[token] = (counts[token] או 0) + 1. זה מעבר אחד, O(n) בזמן לפי מספר התווים, ו-O(k) זיכרון נוסף כש-k הוא מספר המילים השונות.' ב-JavaScript משתמשים ב-[Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map), ב-Python [collections.Counter](https://docs.python.org/3/library/collections.html) עושה את זה בשורה אחת, אבל תגיד/י מה הוא עושה מתחת למכסה, כי זה מה שנבדק.",
        "כותבים את הקוד, ואז בודקים אותו בקול רם לפני שהמראיין יעשה את זה: מחרוזת ריקה מחזירה map ריק; 'a a a' מחזיר a: 3; 'Hello, hello!' מחזיר hello: 2 רק אם ההורדה של הפיסוק עובדת; it's כנראה צריך להישאר מילה אחת, אז מורידים פיסוק רק מהקצוות. ואז השאלה ההמשך שכדאי לצפות לה: 'עכשיו תחזיר/י את 10 הנפוצות ביותר'. תגיד/י את האופציות: למיין את כל k הרשומות (O(k log k)) או להחזיק heap בגודל 10 (O(k log 10)); למשפט, מיון זה בסדר; לקובץ לוג, היית מעבד/ת בזרם ומשתמש/ת ב-heap. התשובה הזאת, אופציות ועוד בחירה עם סיבה, היא מה ש'פוטנציאל לסיניור' נשמע כמו.",
      ],
    },
    {
      heading: "איך מתמודדים עם 'לא יודע/ת'",
      paragraphs: [
        "ישאלו אותך משהו שאת/ה לא יודע/ת. זה בטוח. הכישלון הוא לבלף; המהלך המנצח הוא תשובה בשלושה חלקים:",
      ],
      bullets: [
        "תגיד/י מה כן ידוע לך שגובל בזה: 'לא השתמשתי ב-indexes של בסיס נתונים בפרויקט, אבל אני יודע/ת שזה מבנה שמאפשר לחיפוש לא לסרוק כל שורה, כמו אינדקס בסוף ספר.'",
        "תנמק/י לכיוון תשובה: 'אז אני מנחש/ת שאינדקס על עמודה מאיץ קריאות שמסננות עליה, ומאט קצת כתיבות כי צריך לעדכן את האינדקס.'",
        "תבקש/י את הרמז: 'זה הכיוון, או שאני מפספס/ת משהו?' מראיינים נותנים רמזים בשמחה; הם רוצים לראות מה את/ה עושה עם אחד.",
      ],
    },
    {
      paragraphs: [
        "עוד שני כללים. אם שכחת syntax, תגיד/י ותכתוב/י pseudocode; אף אחד לא נכשל על סוגריים במקום הלא נכון. ואם הבנת שטעית לפני דקה, תתקן/י את עצמך בקול: זה שווה יותר נקודות מאשר לא לטעות אף פעם, כי זה מראה שאת/ה מקשיב/ה לקוד של עצמך.",
      ],
    },
    {
      heading: "משימת בית: היקף, README, טסטים",
      paragraphs: [
        "משימת בית נבדקת על שלושה דברים: האם זה עובד, האם הקוד קריא, והאם הסברת את ההחלטות. היא לא נבדקת על פיצ'רים מעבר למה שביקשו. over-engineering (להוסיף Docker, שלוש שכבות אבסטרקציה, מערכת קונפיגורציה) היא הדרך הנפוצה ביותר לאבד נקודות: לבודק יש בערך 20 דקות לכל הגשה.",
      ],
      bullets: [
        "היקף: תבנה/י בדיוק מה שהמשימה אומרת, ב-stack שהמשרה מציינת. אם משהו לא ברור, תבחר/י את הפירוש הפשוט ותכתוב/י אותו. תגביל/י זמן: אם אמרו 4 שעות, תשלח/י אחרי 6, לא אחרי 20.",
        "מבנה: נקודת כניסה אחת ברורה, פונקציות קטנות, שמות עם משמעות, בלי קוד מת, בלי סודות ב-git. תעשה/י commit תוך כדי; היסטוריה של 8 commits עם הודעות מספרת סיפור ש-commit אחד בשם final לא מספר.",
        "README: שלושה חלקים, 150–300 מילים. איך מריצים (פקודות שעובדות על מכונה נקייה); מה בניתי ואיזה החלטות קיבלתי (ולמה); מה הייתי עושה עם עוד זמן (פערים ידועים, בכנות). תכתוב/י אותו ב-[Markdown שמתרנדר ב-GitHub](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax).",
        "טסטים: 3–6 טסטים שמכסים את המסלול הראשי ואת מקרי הקצה ששאלת עליהם: קלט ריק, קלט לא תקין, תרחיש אמיתי אחד. [Vitest](https://vitest.dev/guide/) ל-JS/TS, [pytest](https://docs.pytest.org/en/stable/) ל-Python. באג שתפסת בזכות טסט שווה אזכור ב-README.",
        "לפני שליחה: תעשה/י clone לתיקייה חדשה ותריץ/י את הפקודות מה-README מילה במילה. חצי מהמשימות שנכשלות נכשלות כאן.",
      ],
    },
    {
      heading: "שאלות לשאול את המראיין",
      paragraphs: [
        "חמש הדקות האחרונות הן שלך. השאלות מספרות להם מה חשוב לך, והתשובות מספרות לך אם לקחת את המשרה. תשאל/י שתיים או שלוש:",
      ],
      bullets: [
        "'איך נראה החודש הראשון של ג'וניור אצלכם? עם מי אני עובד/ת בצמוד?'",
        "'איך קוד מגיע לפרודקשן: code review, CI, כל כמה זמן עושים deploy?'",
        "'מה הדבר האחד שהצוות הכי מתקשה איתו עכשיו?'",
        "'איך מחליטים שג'וניור מוכן/ה ליותר אחריות?'",
        "'מה השלבים הבאים ומתי לצפות לתשובה?'",
      ],
    },
    {
      paragraphs: [
        "תימנע/י משכר בשלב הטכני (זה התפקיד של HR), ומשאלות שהתשובה עליהן נמצאת באתר החברה. ושאלה שמראה שקראת את המשרה ('ראיתי שאתם מחפשים ניסיון ב-Kafka, לאיזה חלק של המערכת זה?') שווה יותר מכל השאר.",
      ],
    },
    {
      heading: "תוכנית הכנה של שבוע",
      paragraphs: [
        "נניח שיש לך ראיון בעוד שבעה ימים ושעתיים-שלוש ביום. לפזר, לא לדחוס:",
      ],
      bullets: [
        "יום 1: תקרא/י שוב את המשרה ותרשום/י כל טכנולוגיה וכל מושג שמופיעים בה. זו רשימת הלימוד שלך. תעבור/י על [בנק השאלות](/interview-questions) של החברה (או חברות דומות) ותכתוב/י את חמשת סוגי השאלות שחוזרים.",
        "יום 2: יסודות. מערכים, מחרוזות, hash maps, sets, רקורסיה, Big-O. שעה קריאה, שעה של שלוש בעיות קטנות בקול רם עם טיימר ב-[תרגול](/practice).",
        "יום 3: ה-stack. תבנה/י משהו זעיר מאפס בלי מדריך בטכנולוגיה הראשית של המשרה: API של to-do, קומפוננטה שמושכת רשימה ומסננת אותה. אם לא הולך, זה הפער שלך, ועכשיו את/ה יודע/ת מה ללמוד.",
        "יום 4: עוד בעיות, אותו פורמט: טיימר, בקול רם, שאלות הבהרה קודם. ל-[roadmap.sh](https://roadmap.sh/) יש רשימת מושגים לפי תפקיד, תעבור/י עליה ותסמן/י מה חור.",
        "יום 5: הפרויקטים שלך. לכל אחד, סיפור של שתי דקות: הבעיה, מה בנית, החלטה אחת קשה, מה היית משנה. תתאמן/י על 'למה הספרייה הזאת', 'איפה ה-state', 'מה נשבר בפי 10 משתמשים'.",
        "יום 6: ראיון מדומה. תבקש/י מחבר/ה להקריא שאלה מהבנק, או תשתמש/י בסימולטור הראיונות, ותקבל/י משוב על הקצב ועל כמה את/ה מדבר/ת תוך כדי. תכין/י את השאלות שלך למראיין.",
        "יום 7: קל. תקרא/י שוב את הרשימות, תישן/י, תסדר/י סביבה (עורך, מצלמה, חדר שקט) ותבדוק/י את לינק הווידאו. ביום עצמו: 'אפשר רגע לחשוב?' זו תמיד שאלה לגיטימית, ותכתוב/י את הקלט והפלט לפני הקוד.",
      ],
    },
    {
      heading: "מה לעשות השבוע",
      bullets: [
        "תבחר/י שלוש משרות שאת/ה באמת רוצה מתוך [המשרות לג'וניורים](/jobs?exp=0-2), ותקרא/י את הדרישות של כל אחת כרשימת לימוד.",
        "תפתור/י בעיה אחת ביום בקול רם עם טיימר; תכתוב/י את שאלות ההבהרה לפני הקוד.",
        "תכתוב/י את סיפור שתי הדקות של כל פרויקט בקורות החיים ותגיד/י אותו בקול למישהו.",
        "תכין/י את תשובת שלושת החלקים ל'לא יודע/ת' על שני הנושאים שהכי מפחידים אותך.",
        "תקים/י repo תבנית למשימות בית: שלד README, test runner, .gitignore, כדי שהמשימה הבאה תתחיל מדקה אפס.",
        "תרשום/י חמש שאלות למראיין, ותשתמש/י בשתיים.",
      ],
    },
  ],
  references: [
    { title: "Big-O Cheat Sheet", url: "https://www.bigocheatsheet.com/", note: "סיבוכיות זמן ומקום של מבני הנתונים והאלגוריתמים הנפוצים, בעמוד אחד." },
    { title: "MDN: סקירה של HTTP", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview", note: "בקשה, תשובה, headers ו-status codes; מה שצריך לדעת לשאלת 'מה קורה כשמקלידים URL'." },
    { title: "MDN: Map ב-JavaScript", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map", note: "התיעוד הרשמי של Map, מבנה הנתונים לספירה בדוגמת תדירות המילים." },
    { title: "Python: collections.Counter", url: "https://docs.python.org/3/library/collections.html", note: "ספירת תדירות בשורה אחת, ומה שקורה מתחת." },
    { title: "GitHub: תחביר Markdown בסיסי", url: "https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax", note: "כותרות, רשימות וקטעי קוד ל-README שמתרנדר נכון." },
    { title: "Vitest: מדריך התחלה", url: "https://vitest.dev/guide/", note: "הקמת טסטים לפרויקט JS/TS בדקות." },
    { title: "pytest", url: "https://docs.pytest.org/en/stable/", note: "מסגרת הטסטים הסטנדרטית ל-Python." },
    { title: "roadmap.sh", url: "https://roadmap.sh/", note: "מפות ידע לפי תפקיד (backend, frontend, DevOps) לאיתור חורים." },
    { title: "Tech Interview Handbook", url: "https://github.com/yangshun/tech-interview-handbook", note: "חומרי הכנה חינמיים לראיונות טכניים: בעיות, התנהגותי, קורות חיים." },
  ],
  en: {
    title: "Your First Technical Interview: What Is Really Being Tested in a Junior",
    excerpt:
      "Nobody expects you to know everything. They expect to see how you think when you don't. The Israeli funnel stage by stage, one problem solved out loud, how to handle 'I don't know', home assignments, and a one-week prep plan.",
    tags: ["Interviews", "Technical", "Junior", "Home assignment"],
    sections: [
      {
        paragraphs: [
          "Nobody expects a junior to know everything. The technical interview for a first job is not a test of how much you have memorised; it tests how you think when you do not know, how you communicate while you work, and whether the things on your résumé are really yours. Seen that way, preparation changes: less cramming of algorithms nobody will ask about, more reasoning out loud on small problems. This guide walks the Israeli funnel stage by stage, solves one problem the way interviewers want to hear it, and ends with a seven-day plan.",
        ],
      },
      {
        heading: "The Israeli funnel, stage by stage",
        paragraphs: [
          "Most Israeli tech companies, from a 30-person startup to Amazon's Tel Aviv office, run a similar four-stage funnel. Names and order vary; the question each stage answers does not.",
        ],
        bullets: [
          "HR or recruiter call (15–30 minutes). Checks availability, salary expectations, location, Hebrew and English, whether your résumé story holds together, and motivation. It is a filter you cannot win but can lose: be concrete about when you can start and what you want, and ask what the next stages are.",
          "Technical interview (45–90 minutes, one or two engineers). Checks fundamentals and reasoning: a few questions about your projects, one or two small coding problems in a shared editor, and knowledge questions about the posting's stack (what happens when you type a URL into the browser, what a Promise is, what a database index is).",
          "Home assignment or live coding. Some companies send a 4–8 hour task (a small REST API, a component that fetches and filters data, a CLI tool); others run a longer live-coding session. Checks whether you can finish something end to end, structure code, and explain your choices.",
          "Final round. A team lead or CTO, sometimes with light system design ('how would you build a URL shortener') and culture questions. Checks whether they want to work with you every day, and whether you want to work with them.",
        ],
      },
      {
        paragraphs: [
          "Large companies add a technical phone screen and standardise their question styles. The question bank on [JobMatch](/interview-questions) collects questions candidates reported per company, for example [Amazon](/interview-questions/amazon), so you can see what the loop looked like for others. A startup can close the whole funnel in two weeks; a large company takes four to six. Ten days of silence after a stage justifies a polite one-line email.",
        ],
      },
      {
        heading: "What the technical stage really measures in a junior",
        paragraphs: [
          "Whoever interviews juniors is not hiring expertise. They are deciding whether, after six months with a mentor, you will be productive. Four things they look at:",
        ],
        bullets: [
          "Fundamentals you can use, not recite: arrays, strings, hash maps, sets, recursion, Big-O at the level of 'this is O(n), that is O(n²), and here is why' ([this cheat sheet](https://www.bigocheatsheet.com/) is enough), HTTP request and response ([the MDN overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview) is one good hour), and what async means in your language.",
          "Reasoning: do you ask what the input looks like before typing, check edge cases without being told, notice your own bug.",
          "Honesty: 'I haven't run into that, but here is how I would approach it' beats a confident wrong answer every time, and a confident wrong answer is the most common reason juniors fail.",
          "Ownership of your résumé: every project line will be probed. If you wrote 'built a React app with authentication', expect 'where did you store the token, and why there?'",
        ],
      },
      {
        paragraphs: [
          "Notice what is not measured: speed. A clean O(n) solution reached in 20 minutes with good questions beats a 5-minute solution you cannot explain.",
        ],
      },
      {
        heading: "Thinking out loud: word frequencies, done properly",
        paragraphs: [
          "The problem: 'Given a text, return how many times each word appears.' Five lines to solve, 20 minutes to solve well. Here is how the 20 minutes go.",
          "Before a single line of code, clarifying questions. They do not show weakness; they are exactly what is being looked for:",
        ],
        bullets: [
          "'Is it case-sensitive? Are The and the the same word?' (usually: no, fold to lowercase)",
          "'What counts as a word: anything between spaces, or do I strip punctuation? Is hello with a trailing comma the same as hello?'",
          "'Can the text be empty? Can there be several spaces or newlines between words?'",
          "'How large is the input: a sentence, or a file that does not fit in memory?'",
          "'What should I return: a map, a list sorted by count, the top 10?'",
        ],
      },
      {
        paragraphs: [
          "Then state the plan before writing: 'I will split on whitespace, lowercase each token and strip punctuation from its edges, and count in a hash map: for each token, counts[token] = (counts[token] or 0) + 1. One pass, O(n) time in the number of characters, O(k) extra space where k is the number of distinct words.' In JavaScript use a [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map); in Python [collections.Counter](https://docs.python.org/3/library/collections.html) does it in one line, but say what it does underneath, because that is what is being tested.",
          "Write the code, then test it out loud before the interviewer does: an empty string returns an empty map; 'a a a' returns a: 3; 'Hello, hello!' returns hello: 2 only if your stripping works; it's should stay one word, so strip only at the edges. Then expect the follow-up: 'now return the 10 most frequent'. Name the options: sort all k entries (O(k log k)) or keep a heap of size 10 (O(k log 10)); for a sentence, sorting is fine; for a log file, stream the input and use the heap. Options plus a choice with a reason: that is what 'senior potential' sounds like.",
        ],
      },
      {
        heading: "Handling 'I don't know'",
        paragraphs: [
          "You will be asked something you do not know. The failure mode is bluffing; the winning move is a three-part answer:",
        ],
        bullets: [
          "Say what you do know that borders it: 'I haven't used database indexes in a project, but I know they are a structure that lets a lookup avoid scanning every row, like the index at the back of a book.'",
          "Reason toward an answer: 'So I would guess an index on a column speeds up reads that filter on it and slows writes slightly, because the index has to be updated.'",
          "Ask for the hint: 'Is that the direction, or am I missing something?' Interviewers hint gladly; they want to see what you do with one.",
        ],
      },
      {
        paragraphs: [
          "Two more rules. If you have forgotten syntax, say so and write pseudocode; nobody fails for a misplaced bracket. If you realise you were wrong a minute ago, correct yourself out loud: it scores higher than never being wrong, because it shows you listen to your own code.",
        ],
      },
      {
        heading: "Home assignments: scope, README, tests",
        paragraphs: [
          "A home assignment is graded on three things: does it work, is the code readable, did you explain your decisions. It is not graded on features beyond what was asked. Over-engineering (Docker, three layers of abstraction, a configuration system) is the most common way to lose points: the reviewer has about 20 minutes per submission.",
        ],
        bullets: [
          "Scope: build exactly what the task says, in the stack the posting lists. If something is ambiguous, pick the simpler interpretation and write it down. Time-box: if they say 4 hours, ship at 6, not at 20.",
          "Structure: one clear entry point, small functions, meaningful names, no dead code, no secrets in git. Commit as you go; 8 commits with messages tell a story that one commit called final does not.",
          "README: three sections, 150–300 words. How to run (commands that work on a clean machine); what I built and why; what I would do with more time (known gaps, honestly). Write it in [Markdown that renders on GitHub](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax).",
          "Tests: 3–6 tests covering the main path and the edge cases you asked about: empty input, invalid input, one real scenario. [Vitest](https://vitest.dev/guide/) for JS/TS, [pytest](https://docs.pytest.org/en/stable/) for Python. A bug a test caught is worth a line in the README.",
          "Before sending: clone into a fresh folder and run the README commands word for word. Half of the assignments that fail, fail here.",
        ],
      },
      {
        heading: "Questions to ask the interviewer",
        paragraphs: [
          "The last five minutes are yours. Your questions tell them what you care about; the answers tell you whether to take the job. Ask two or three:",
        ],
        bullets: [
          "'What does a junior's first month look like here? Who do I pair with?'",
          "'How does code get to production: code review, CI, how often do you deploy?'",
          "'What is the one thing the team struggles with most right now?'",
          "'How do you decide a junior is ready for more responsibility?'",
          "'What are the next stages, and when should I expect to hear back?'",
        ],
      },
      {
        paragraphs: [
          "Skip salary at the technical stage (that is HR's job) and anything answered on the company's website. A question that shows you read the posting ('you are looking for Kafka experience, which part of the system is that for?') is worth more than all the others.",
        ],
      },
      {
        heading: "A one-week preparation plan",
        paragraphs: [
          "Assume an interview in seven days and two to three hours a day. Spread it out, do not binge:",
        ],
        bullets: [
          "Day 1: Read the posting again and write down every technology and concept in it; that is your syllabus. Go through the [question bank](/interview-questions) for that company (or similar ones) and note the five question types that repeat.",
          "Day 2: Fundamentals. Arrays, strings, hash maps, sets, recursion, Big-O. One hour of reading, one hour of three small problems out loud with a timer at [practice](/practice).",
          "Day 3: The stack. Build something tiny from scratch, without a tutorial, in the posting's main technology: a to-do API, a component that fetches and filters a list. If you cannot, that is your gap, and now you know what to study.",
          "Day 4: More problems, same format: timer, out loud, clarifying questions first. [roadmap.sh](https://roadmap.sh/) has a concept list per role; mark the holes.",
          "Day 5: Your projects. For each, a two-minute story: the problem, what you built, one hard decision, what you would change. Rehearse 'why this library', 'where does the state live', 'what breaks at 10x users'.",
          "Day 6: Mock interview. Have a friend read a question from the bank, or use the interview simulator, and get feedback on pacing and on how much you talk while you work. Prepare your questions for the interviewer.",
          "Day 7: Light. Re-read your notes, sleep, set up editor, camera and a quiet room, test the video link. On the day: 'can I take a moment to think?' is always legitimate, and write the input and output before the code.",
        ],
      },
      {
        heading: "What to do this week",
        bullets: [
          "Pick three postings you actually want from the [junior feed](/jobs?exp=0-2) and read each one's requirements as a study list.",
          "Solve one problem a day out loud with a timer; write the clarifying questions before the code.",
          "Write the two-minute story for every project on your résumé and say it aloud to someone.",
          "Prepare the three-part 'I don't know' answer for the two topics you fear most.",
          "Set up a template repo for home assignments: README skeleton, test runner, .gitignore, so the next assignment starts at minute zero.",
          "Write down five questions for the interviewer, and use two.",
        ],
      },
    ],
    references: [
      { title: "Big-O Cheat Sheet", url: "https://www.bigocheatsheet.com/", note: "Time and space complexity of the common data structures and algorithms, on one page." },
      { title: "MDN: An overview of HTTP", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview", note: "Request, response, headers and status codes; what you need for the 'what happens when you type a URL' question." },
      { title: "MDN: Map in JavaScript", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map", note: "The official docs for Map, the counting structure in the word-frequency example." },
      { title: "Python: collections.Counter", url: "https://docs.python.org/3/library/collections.html", note: "Frequency counting in one line, and what happens underneath." },
      { title: "GitHub: Basic writing and formatting syntax", url: "https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax", note: "Headings, lists and code blocks for a README that renders correctly." },
      { title: "Vitest: Getting Started", url: "https://vitest.dev/guide/", note: "Set up tests for a JS/TS project in minutes." },
      { title: "pytest", url: "https://docs.pytest.org/en/stable/", note: "The standard testing framework for Python." },
      { title: "roadmap.sh", url: "https://roadmap.sh/", note: "Knowledge maps per role (backend, frontend, DevOps) for finding gaps." },
      { title: "Tech Interview Handbook", url: "https://github.com/yangshun/tech-interview-handbook", note: "Free technical-interview prep material: problems, behavioural questions, résumé." },
    ],
  },
};

export default article;
