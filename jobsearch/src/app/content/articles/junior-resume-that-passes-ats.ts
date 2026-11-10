import type { Article } from "../articles";

const article: Article = {
  slug: "junior-resume-that-passes-ats",
  date: "2026-10-01",
  readMinutes: 8,
  title: "קורות חיים לג'וניור שעוברים את ה-ATS (ואת המגייס)",
  excerpt:
    "רוב קורות החיים של ג'וניורים נפסלים לפני שבן-אדם קרא אותם: הקובץ לא נקרא נכון, המבנה מחביא את הדבר היחיד שמעניין, והבולטים מתארים משימות במקום תוצאות. כך בונים גרסה שה-ATS מפענח נכון ומגייס רוצה לקרוא, עם דוגמה לפני/אחרי.",
  tags: ["קורות חיים", "ATS", "ג'וניור", "פרויקטים"],
  sections: [
    {
      paragraphs: [
        "כמעט כל משרת הייטק בישראל עוברת דרך מערכת ATS: Comeet, Greenhouse, Lever, Ashby, Workday. הקובץ שאת/ה מעלה לא נוחת אצל מגייס; הוא נוחת אצל תוכנה שמנסה לחלץ ממנו שם, אימייל, מעסיקים, תארים ומיומנויות, ולמלא מהם פרופיל. רק אחרי זה מגייס פותח את הפרופיל, ובדרך כלל נותן לו 10–20 שניות. בשביל ג'וניור זה מצב כפול: גם הקובץ צריך להיקרא נכון, וגם מה שנקרא צריך להגיד משהו, כשאין ניסיון תעסוקתי שיגיד אותו בשבילך. המאמר הזה מפרק את שני הצדדים: איך הפרסור עובד בפועל, איזה מבנה עובד לג'וניור, איך כותבים פרויקט שנשמע כמו עבודה, ואיך משקפים מילות מפתח בלי לשקר.",
      ],
    },
    {
      heading: "איך הפרסור באמת עובד",
      paragraphs: [
        "ATS לא מסתכל על הקובץ, הוא קורא את שכבת הטקסט שלו. הוא עובר על הטקסט משמאל לימין ומלמעלה למטה (או בכיוון ההפוך בעברית), מזהה כותרות מוכרות כמו Experience, Education, Skills, Projects, ומשייך את מה שמתחת לכל כותרת לשדה המתאים בפרופיל. כל מה שמשבש את הסדר הזה מייצר פרופיל חלקי או ריק. [מרכז העזרה של Greenhouse](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse) מונה במפורש מה מפיל את הפרסור: קובץ שהועלה כתמונה ולא כמסמך, עמודות, טבלאות, פרטי קשר ב-header או ב-footer או בתיבת טקסט, גרפיקה ו-word art, וגם קובץ מעל 2.5MB. זה לא סוד מקצועי, זה פשוט מה שמנוע חילוץ טקסט מסוגל לעשות.",
        "המשמעות המעשית: עמודה אחת. פונט סטנדרטי (Arial, Calibri, Georgia). כותרות סקשן בשמות המקובלים באנגלית, לא יצירתיות כמו 'מה בניתי' או 'הארגז כלים שלי'. שם, טלפון, אימייל, LinkedIn ו-GitHub בגוף המסמך, בשורות הראשונות, לא ב-header. PDF שנוצר מ-Word או מ-Google Docs, לא סריקה ולא ייצוא מ-Canva כתמונה. בדיקה של 10 שניות: פתח/י את ה-PDF, בחר/י הכל, העתק/י והדבק/י לקובץ טקסט פשוט. אם הסדר הגיוני ואין רווחים בין אותיות, גם ה-ATS יקרא את זה. אם יצאה סלט, המגייס יראה סלט.",
        "ובשאלה שחוזרת כל פעם, עברית או אנגלית: [Greenhouse מפרסם רשימת שפות](https://support.greenhouse.io/hc/en-us/articles/205019689-Resume-parsing-with-non-English-languages) שבהן הפרסור נתמך במלואו, ועברית נמצאת בה. אבל רוב המשרות הטכנולוגיות בישראל מנוסחות באנגלית, מילות המפתח במערכת הן באנגלית, והמגייס סורק באנגלית. הכלל: שפה אחת לקובץ, ובדרך כלל אנגלית. שני הקבצים בשתי שפות באותו PDF הם הדרך הבטוחה ביותר לפרופיל שבור.",
      ],
    },
    {
      heading: "המבנה שעובד לג'וניור",
      paragraphs: [
        "התבנית הקלאסית של קורות חיים נבנתה סביב ניסיון תעסוקתי. לג'וניור אין אותו, אז התבנית מדגישה בדיוק את החור. הסדר הנכון הופך את זה: הדבר הכי חזק שלך עולה למעלה, וההשכלה יורדת למטה, כי התואר שלך דומה לתואר של עוד 400 מועמדים לאותה משרה.",
      ],
      bullets: [
        "שורת כותרת: שם, עיר, טלפון, אימייל, LinkedIn, GitHub. בלי כתובת מלאה, בלי תמונה, בלי תאריך לידה.",
        "Summary של 2–3 שורות, ממוקד לתפקיד: מי את/ה, איזו טכנולוגיה, מה בנית, מה מחפש/ת. 'Backend developer (Node.js, PostgreSQL) with two production-grade side projects and a B.Sc. in Computer Science; looking for a first backend role in Tel Aviv.' לא 'Objective' כללי על 'צמיחה בחברה דינמית'.",
        "Skills: 8–12 פריטים מקובצים (Languages / Frameworks / Tools), רק מה שתוכל/י לענות עליו בראיון. רשימה של 40 טכנולוגיות שראית פעם מורידה את האמינות של כל השאר.",
        "Projects: 2–3 פרויקטים, כל אחד 2–3 בולטים עם תוצאה מדידה (הסעיף הבא). קישור ל-repo ול-demo חי אם יש.",
        "Experience: גם אם זה לא פיתוח. שירות צבאי, תפקיד תמיכה, סטודנט מתרגל: בולט אחד-שניים על אחריות ותוצאה. חור של שנתיים בלי הסבר מפחיד יותר מעבודה לא טכנית.",
        "Education: תואר, מוסד, שנת סיום, ממוצע רק אם 85 ומעלה, ו-2–3 קורסים רלוונטיים לתפקיד. עמוד אחד, נקודה.",
      ],
    },
    {
      heading: "פרויקט שנשמע כמו עבודה",
      paragraphs: [
        "הטעות הנפוצה ביותר בקו\"ח של ג'וניור היא פרויקט שמתואר כמו תרגיל: 'אתר למכירת מוצרים עם React ו-Node'. זה אומר למגייס שעשית קורס. פרויקט טוב מתואר כמו שמתארים עבודה: מה הבעיה, מה בנית, מה קרה אחר כך. הנוסחה שמגייסי Google מלמדים ב[סרטון הטיפים הרשמי שלהם](https://www.youtube.com/watch?v=BYUy1yvjHxE) היא 'Accomplished X, as measured by Y, by doing Z', ו[המדריך של שירותי הקריירה בהרווארד](https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/) אומר את אותו הדבר במילים אחרות: פועל, הישג ולא תחום אחריות, מספר.",
        "לג'וניור יש מספרים, רק צריך לחפש אותם: כמה משתמשים אמיתיים (גם 30 חברים מהכיתה), כמה requests ביום, מכמה שניות לכמה ירד זמן טעינה, כמה אחוז כיסוי בדיקות, כמה שעות ידניות חסך הסקריפט למישהו, כמה כוכבים או forks, כמה PRs התקבלו בפרויקט open source. אם אין עדיין מספר, זה סימן שהפרויקט עוד לא נגמר: תעלה/י אותו לאוויר, תביא/י 20 משתמשים, תמדוד/י משהו. גם ה-README חשוב, כי מגייס טכני יפתח את ה-repo: [GitHub ממליץ](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) שה-README יגיד מה הפרויקט עושה, למה הוא שימושי ואיך מתחילים. צילום מסך אחד ו-3 שורות התקנה שעובדות שוות יותר מכל תיאור בקו\"ח.",
      ],
    },
    {
      heading: "מילות מפתח, בלי לרמות",
      paragraphs: [
        "חלק מה-ATS-ים, וכל מגייס, מחפשים בפרופיל שלך את המילים שמופיעות במשרה. לפי נתוני JobMatch מנובמבר 2026, 62–63% מהמשרות בקטלוג מציינות במפורש שנות ניסיון וטכנולוגיות, כלומר ברוב המקרים הרשימה שאת/ה צריך/ה להתאים אליה כתובה שחור על גבי לבן. התהליך: העתק/י את תיאור המשרה, סמן/י כל טכנולוגיה, כל מיומנות וכל שם של תהליך (CI/CD, code review, unit tests, REST, Agile). מה שבאמת יש לך, תכתוב/י בניסוח המדויק של המשרה. אם כתוב 'React' תכתוב/י React ולא 'ספריות JS מודרניות'. אם כתוב 'PostgreSQL' ואתה עבדת עם Postgres, תכתוב/י את השם המלא, כי מנוע חיפוש לא תמיד יודע שזה אותו דבר.",
        "מה שאין לך, לא ממציאים. לא בגלל מוסר בלבד, אלא כי זה מתגלה בשאלה השלישית של הראיון הטכני, ואז נשרפת גם האמינות של מה שכן נכון. יש אזור ביניים הוגן: 'Familiar with Docker (used in project X)' זה בסדר אם באמת ארזת את הפרויקט בקונטיינר. 'Experienced in Kubernetes' אחרי tutorial אחד זה לא. הכלי [התאמת קורות חיים למשרה ב-ResumeAI](/ResumeAI) עושה בדיוק את ההבחנה הזאת: מדגיש מה מהניסיון שלך רלוונטי למשרה הספציפית ומציג את הפערים כרשימה ללמוד, במקום לכתוב אותם לתוך הקובץ.",
        "טיפ אחרון: שם הקובץ נקרא גם הוא. 'Resume.pdf' זה אחד מאלף; 'Dana-Levi-Backend-Developer.pdf' מופיע נכון ברשימת הקבצים של המגייס ובחיפוש במייל.",
      ],
    },
    {
      heading: "טעויות שחוזרות",
      bullets: [
        "תבנית בשתי עמודות עם סרגל צבעוני בצד: יפה על המסך, מתפרקת בפרסור. הסקשן Skills בעמודה הצדדית בדרך כלל נעלם לגמרי.",
        "אייקונים במקום מילים (סמל טלפון, סמל של GitHub): ה-ATS קורא תו ריק ולא יודע מה המספר מייצג. תכתוב/י 'Phone', 'GitHub'.",
        "מדדי מיומנות גרפיים (5 כוכבים ב-JavaScript, פס 80% ב-Python): לא נקראים, ובעין אנושית נראים ילדותיים. מה בכלל אומר 80% ב-Python?",
        "'Objective' כללי: 'מחפש/ת אתגר בחברה מובילה'. המגייס יודע מה את/ה מחפש/ת; הוא רוצה לדעת מה את/ה יודע/ת לעשות.",
        "כפל שפות או כפל תפקידים באותו קובץ. גרסה אחת ל-backend, גרסה אחת ל-frontend, גרסה אחת ל-data. ההבדל ביניהן הוא ה-Summary, סדר הסקילס וסדר הפרויקטים.",
        "ממוצע 78 בולט בכותרת. אם הממוצע לא עוזר, לא מציינים אותו; אף אחד לא נפסל על חוסר ממוצע בקו\"ח.",
        "קובץ Word. חלק מהמערכות מעבדות docx, אבל הפריסה משתנה בין מכונות. PDF עם שכבת טקסט, תמיד.",
        "שני עמודים לג'וניור. העמוד השני כמעט אף פעם לא נקרא, והוא בדרך כלל בנוי מהמילוי שהורדנו בסעיפים הקודמים.",
      ],
    },
    {
      heading: "לפני ואחרי: בולט אחד של פרויקט",
      paragraphs: [
        "ניקח בולט שמופיע, בווריאציות, בכמעט כל קו\"ח של ג'וניור, ונעבור עליו שלושה סבבים.",
      ],
      bullets: [
        "לפני: 'Built a task management web app using React and Node.js with MongoDB database.' מה הבעיה? זה תיאור של stack, לא של עבודה. אין בעיה, אין משתמש, אין תוצאה. ההבדל בינו לבין תרגיל בקורס הוא אפס.",
        "סבב 1, להוסיף למי ולמה: 'Built a task management web app for a 6-person student team to replace a shared spreadsheet; React front end, Node.js REST API, MongoDB.' עכשיו יש משתמש אמיתי ובעיה שנפתרה.",
        "סבב 2, להוסיף מדידה: 'Built a task management web app used daily by a 6-person student team for one semester, replacing a shared spreadsheet; React, Node.js REST API, MongoDB; 40+ Jest tests, deployed on Render with GitHub Actions CI.' עכשיו יש שימוש אמיתי, בדיקות ו-CI, שלוש מילות מפתח שמופיעות ברוב המשרות ל-backend.",
        "אחרי, לפצל לשניים כי בולט אחד עושה יותר מדי: 'Built a task management web app (React, Node.js REST API, MongoDB) used daily by a 6-person student team for one semester, replacing a shared spreadsheet.' ואז: 'Cut API response time for the task list from ~900ms to ~120ms by adding a compound MongoDB index and paginating results; covered the API with 40+ Jest tests and GitHub Actions CI.' הבולט השני הוא הסיפור שישאלו עליו בראיון, וזה בדיוק מה שרוצים: שאלה על משהו שבאמת עשית.",
      ],
    },
    {
      heading: "מה לעשות השבוע",
      bullets: [
        "יום 1: בדיקת פרסור. פתח/י את ה-PDF הנוכחי, בחר-הכל, העתק לקובץ טקסט. אם הסדר שבור או ש-Skills נעלם, תעבור/י לתבנית עמודה אחת בלי header ו-footer.",
        "יום 2: סדר סקשנים חדש: Summary, Skills, Projects, Experience, Education. תמחק/י כל אייקון, כל פס מיומנות, כל Objective כללי.",
        "יום 3: שלושה פרויקטים, כל אחד שני בולטים בנוסחת X-by-Y-doing-Z. אם לפרויקט אין מספר, תעלה/י אותו לאוויר ותביא/י 10 משתמשים עד סוף השבוע.",
        "יום 4: בחר/י 5 משרות מ-[/jobs?exp=0-2](/jobs?exp=0-2), תסמן/י את הטכנולוגיות שחוזרות בכולן, ותוודא/י שכל מה שבאמת יש לך מופיע בניסוח שלהן. מה שחסר נכנס לרשימת לימוד, לא לקו\"ח.",
        "יום 5: README לכל repo שמקושר מהקו\"ח: מה זה, צילום מסך, איך מריצים. בדוק/י שהקישורים בקובץ באמת פותחים משהו.",
        "יום 6: קרא/י את הקובץ בקול. כל בולט שמתחיל ב-'Responsible for' או 'Worked on' מתחיל מחדש עם פועל ותוצאה.",
        "יום 7: שלח/י את הקובץ לשני מפתחים שאת/ה סומך/ת עליהם ותבקש/י תשובה לשאלה אחת: 'מה הייתם שואלים אותי בראיון על הקובץ הזה?' אם אין להם שאלה, הקובץ עוד לא מספיק ספציפי.",
      ],
    },
  ],
  references: [
    {
      title: "Greenhouse: מתי פרסור קורות חיים נכשל",
      url: "https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse",
      note: "רשימת הגורמים הרשמית: תמונות, עמודות, טבלאות, פרטי קשר ב-header, קובץ מעל 2.5MB.",
    },
    {
      title: "Greenhouse: פרסור קורות חיים בשפות שאינן אנגלית",
      url: "https://support.greenhouse.io/hc/en-us/articles/205019689-Resume-parsing-with-non-English-languages",
      note: "רשימת השפות הנתמכות במלואן, עברית ביניהן.",
    },
    {
      title: "Google Careers: Create Your Resume for Google",
      url: "https://www.youtube.com/watch?v=BYUy1yvjHxE",
      note: "סרטון הטיפים הרשמי של מגייסי Google, כולל נוסחת X-by-Y-doing-Z לבולטים.",
    },
    {
      title: "Harvard Career Services: מדריך לקורות חיים חזקים",
      url: "https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/",
      note: "פעלים, הישגים במקום תחומי אחריות, כימות.",
    },
    {
      title: "GitHub Docs: על קובצי README",
      url: "https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes",
      note: "מה README צריך לענות עליו: מה הפרויקט עושה, למה הוא שימושי, איך מתחילים.",
    },
    {
      title: "Stack Overflow Developer Survey 2025",
      url: "https://survey.stackoverflow.co/2025/",
      note: "אילו שפות וכלים נפוצים בפועל, לבחירת מה ללמוד ומה להדגיש ב-Skills.",
    },
    {
      title: "roadmap.sh",
      url: "https://roadmap.sh/",
      note: "מפות דרכים לפי תפקיד (frontend, backend, DevOps) למילוי הפערים שמצאת מול המשרות.",
    },
  ],
  en: {
    title: "A junior's résumé that passes the ATS (and the recruiter)",
    excerpt:
      "Most junior résumés are rejected before a human reads them: the file parses badly, the layout buries the only interesting part, and the bullets describe tasks instead of outcomes. Here is how to build a version the ATS extracts correctly and a recruiter wants to read, with a before/after example.",
    tags: ["résumé", "ATS", "junior", "projects"],
    sections: [
      {
        paragraphs: [
          "Almost every tech job in Israel goes through an applicant tracking system: Comeet, Greenhouse, Lever, Ashby, Workday. The file you upload does not land on a recruiter's desk; it lands in software that tries to extract a name, an email, employers, degrees and skills, and build a profile out of them. Only then does a recruiter open that profile, usually for 10 to 20 seconds. For a junior that is a double problem: the file has to parse correctly, and what gets parsed has to say something, without a work history to say it for you. This article takes both halves apart: how parsing actually works, which structure works when you have no experience, how to write a project so it reads like a job, and how to mirror keywords without lying.",
        ],
      },
      {
        heading: "How parsing actually works",
        paragraphs: [
          "An ATS does not look at your résumé; it reads its text layer. It walks the text top to bottom, recognises familiar section headings such as Experience, Education, Skills and Projects, and maps whatever sits under each heading into the matching profile field. Anything that breaks that order produces a partial or empty profile. [Greenhouse's help centre](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse) spells out what makes a parse fail: a résumé uploaded as an image rather than a document, columns, tables, contact details in a header, footer or text box, graphics and word art, and files over 2.5MB. None of this is a trade secret; it is simply what a text extractor can and cannot do.",
          "In practice: one column. A standard font (Arial, Calibri, Georgia). Section headings with the conventional English names, not creative ones like 'What I have built' or 'My toolbox'. Name, phone, email, LinkedIn and GitHub in the body of the document, in the first lines, never in the header. A PDF exported from Word or Google Docs, not a scan and not a Canva export that is really a picture. The ten-second test: open the PDF, select all, copy, paste into a plain text editor. If the order makes sense and there are no spaces between letters, the ATS will read it too. If you get word salad, so does the recruiter.",
          "On the recurring question of Hebrew versus English: [Greenhouse publishes the list of languages](https://support.greenhouse.io/hc/en-us/articles/205019689-Resume-parsing-with-non-English-languages) it parses fully, and Hebrew is on it. But most tech postings in Israel are written in English, the keywords in the system are English, and the recruiter scans in English. One language per file, and usually English. Two languages in the same PDF is the surest route to a broken profile.",
        ],
      },
      {
        heading: "A structure that works for a junior",
        paragraphs: [
          "The classic résumé template was built around a work history. A junior does not have one, so the template highlights exactly the hole. The right order flips that: your strongest material goes to the top, and education goes to the bottom, because your degree looks like the degree of 400 other applicants to the same role.",
        ],
        bullets: [
          "Header line: name, city, phone, email, LinkedIn, GitHub. No full address, no photo, no date of birth.",
          "A 2 to 3 line Summary aimed at the role: who you are, which stack, what you built, what you want. 'Backend developer (Node.js, PostgreSQL) with two production-grade side projects and a B.Sc. in Computer Science; looking for a first backend role in Tel Aviv.' Not a generic Objective about growing in a dynamic company.",
          "Skills: 8 to 12 items grouped (Languages / Frameworks / Tools), only what you can answer questions about in an interview. A list of 40 technologies you once saw lowers the credibility of everything else.",
          "Projects: 2 to 3 projects, each with 2 to 3 bullets ending in a measurable result (next section). Link to the repo and to a live demo if there is one.",
          "Experience: even if it was not development. Military service, a support role, teaching assistant: one or two bullets on responsibility and outcome. A two-year gap with no explanation scares more than non-technical work.",
          "Education: degree, institution, graduation year, GPA only if 85 or above, and 2 to 3 courses relevant to the role. One page, full stop.",
        ],
      },
      {
        heading: "A project that reads like a job",
        paragraphs: [
          "The most common mistake in a junior résumé is a project described like an exercise: 'An e-commerce site with React and Node'. That tells a recruiter you took a course. A good project is described the way you would describe a job: what the problem was, what you built, what happened afterwards. The formula Google's recruiters teach in [their official résumé tips video](https://www.youtube.com/watch?v=BYUy1yvjHxE) is 'Accomplished X, as measured by Y, by doing Z', and [Harvard's career services guide](https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/) says the same thing in other words: an action verb, an accomplishment rather than a duty, a number.",
          "Juniors do have numbers; you just have to look for them. How many real users (even 30 classmates). Requests per day. Load time before and after. Test coverage. Hours of manual work a script saved someone. Stars or forks. Pull requests merged into an open-source project. If there is no number yet, the project is not finished: deploy it, get 20 users, measure something. The README matters too, because a technical recruiter will open the repo: [GitHub's guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) is that a README should say what the project does, why it is useful and how to get started. One screenshot and three install lines that actually work are worth more than any description on the résumé.",
        ],
      },
      {
        heading: "Keywords, honestly mirrored",
        paragraphs: [
          "Some ATS products, and every recruiter, search your profile for the words that appear in the posting. In JobMatch data from November 2026, 62 to 63 percent of postings in the catalogue state years of experience and technologies explicitly, so in most cases the list you need to match is written in plain sight. The process: copy the job description, mark every technology, every skill and every process name (CI/CD, code review, unit tests, REST, Agile). Whatever you genuinely have, write in the posting's exact wording. If it says 'React', write React, not 'modern JS libraries'. If it says 'PostgreSQL' and you worked with Postgres, write the full name, because a search engine does not always know they are the same thing.",
          "Whatever you do not have, you do not invent. Not only on principle, but because it surfaces on the third question of the technical interview, and then the credibility of everything true burns with it. There is a fair middle ground: 'Familiar with Docker (used in project X)' is fine if you really containerised the project. 'Experienced in Kubernetes' after one tutorial is not. The [tailor-to-job tool in ResumeAI](/ResumeAI) makes exactly that distinction: it highlights which parts of your experience match the specific posting and shows the gaps as a list to learn, instead of writing them into the file.",
          "One last detail: the file name gets read too. 'Resume.pdf' is one of a thousand; 'Dana-Levi-Backend-Developer.pdf' shows up correctly in the recruiter's file list and in an email search.",
        ],
      },
      {
        heading: "Mistakes that keep coming back",
        bullets: [
          "A two-column template with a coloured sidebar: looks good on screen, falls apart in parsing. The Skills section in the sidebar usually disappears entirely.",
          "Icons instead of words (a phone symbol, a GitHub logo): the ATS reads an empty glyph and does not know what the number means. Write 'Phone', 'GitHub'.",
          "Graphical skill meters (5 stars in JavaScript, an 80 percent bar in Python): unreadable by software, and to a human eye they look childish. What does 80 percent in Python even mean?",
          "A generic Objective: 'Seeking a challenging role at a leading company'. The recruiter knows what you want; they want to know what you can do.",
          "Two languages or two target roles in one file. One version for backend, one for frontend, one for data. The difference between them is the Summary, the order of the skills and the order of the projects.",
          "A GPA of 78 in bold in the header. If the GPA does not help, leave it out; nobody is rejected for a missing GPA.",
          "A Word file. Some systems handle docx, but the layout shifts between machines. A PDF with a text layer, always.",
          "Two pages for a junior. The second page is almost never read, and it is usually made of the filler the earlier sections told you to cut.",
        ],
      },
      {
        heading: "Before and after: one project bullet",
        paragraphs: [
          "Take a bullet that appears, in some variation, on almost every junior résumé, and run it through three passes.",
        ],
        bullets: [
          "Before: 'Built a task management web app using React and Node.js with MongoDB database.' What is wrong? It describes a stack, not work. No problem, no user, no outcome. The difference between this and a course exercise is zero.",
          "Pass 1, add who and why: 'Built a task management web app for a 6-person student team to replace a shared spreadsheet; React front end, Node.js REST API, MongoDB.' Now there is a real user and a problem that got solved.",
          "Pass 2, add a measurement: 'Built a task management web app used daily by a 6-person student team for one semester, replacing a shared spreadsheet; React, Node.js REST API, MongoDB; 40+ Jest tests, deployed on Render with GitHub Actions CI.' Now there is real usage, tests and CI, three keywords that appear in most backend postings.",
          "After, split in two because one bullet is doing too much: 'Built a task management web app (React, Node.js REST API, MongoDB) used daily by a 6-person student team for one semester, replacing a shared spreadsheet.' Then: 'Cut API response time for the task list from ~900ms to ~120ms by adding a compound MongoDB index and paginating results; covered the API with 40+ Jest tests and GitHub Actions CI.' The second bullet is the story you will be asked about in the interview, and that is exactly what you want: a question about something you actually did.",
        ],
      },
      {
        heading: "What to do this week",
        bullets: [
          "Day 1: the parse test. Open your current PDF, select all, paste into a text file. If the order is broken or Skills has vanished, move to a one-column template with no header or footer.",
          "Day 2: new section order: Summary, Skills, Projects, Experience, Education. Delete every icon, every skill bar, every generic Objective.",
          "Day 3: three projects, two bullets each in the X-by-Y-doing-Z formula. If a project has no number, deploy it and get 10 users by the end of the week.",
          "Day 4: pick 5 postings from [/jobs?exp=0-2](/jobs?exp=0-2), mark the technologies that repeat across all of them, and make sure everything you genuinely have appears in their wording. What is missing goes on a learning list, not on the résumé.",
          "Day 5: a README for every repo linked from the résumé: what it is, a screenshot, how to run it. Check that every link in the file actually opens something.",
          "Day 6: read the file out loud. Every bullet that starts with 'Responsible for' or 'Worked on' gets rewritten with a verb and an outcome.",
          "Day 7: send the file to two developers you trust and ask one question: 'What would you ask me in an interview about this file?' If they have no question, the file is not specific enough yet.",
        ],
      },
    ],
    references: [
      {
        title: "Greenhouse: Unsuccessful resume parse",
        url: "https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse",
        note: "The vendor's own list of what breaks parsing: images, columns, tables, contact details in headers, files over 2.5MB.",
      },
      {
        title: "Greenhouse: Resume parsing with non-English languages",
        url: "https://support.greenhouse.io/hc/en-us/articles/205019689-Resume-parsing-with-non-English-languages",
        note: "The list of fully supported languages, Hebrew included.",
      },
      {
        title: "Google Careers: Create Your Resume for Google",
        url: "https://www.youtube.com/watch?v=BYUy1yvjHxE",
        note: "Google recruiters' official tips video, including the X-by-Y-doing-Z bullet formula.",
      },
      {
        title: "Harvard Career Services: Create a strong resume",
        url: "https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/",
        note: "Action verbs, accomplishments over duties, quantify and qualify.",
      },
      {
        title: "GitHub Docs: About READMEs",
        url: "https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes",
        note: "What a README should answer: what the project does, why it is useful, how to get started.",
      },
      {
        title: "Stack Overflow Developer Survey 2025",
        url: "https://survey.stackoverflow.co/2025/",
        note: "Which languages and tools are actually in use, for choosing what to learn and what to lead with in Skills.",
      },
      {
        title: "roadmap.sh",
        url: "https://roadmap.sh/",
        note: "Role-based roadmaps (frontend, backend, DevOps) for closing the gaps you found against real postings.",
      },
    ],
  },
};

export default article;
