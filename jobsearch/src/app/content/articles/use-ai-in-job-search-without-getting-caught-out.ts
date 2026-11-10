import type { Article } from "../articles";

const article: Article = {
  slug: "use-ai-in-job-search-without-getting-caught-out",
  date: "2026-10-07",
  readMinutes: 8,
  title: "להשתמש ב-AI בחיפוש עבודה, בלי להיתפס על זה",
  excerpt:
    "מגייסים מזהים קו״ח ומכתבים שנכתבו ב-AI אחרי כמה שורות. איפה הכלים באמת מאיצים אותך, מה אסור להאציל, prompt טוב מול גרוע, ואיך לבדוק כל פלט מול המודעה לפני שהוא יוצא מהמחשב.",
  tags: ["AI", "קורות חיים", "ראיונות", "אסטרטגיה"],
  sections: [
    {
      paragraphs: [
        "ב-2026 כמעט כל מועמד/ת ג'וניור משתמש/ת ב-ChatGPT או ב-Claude באיזשהו שלב של חיפוש העבודה, ומגייסים יודעים את זה. הבעיה היא לא הכלי אלא מה שהוא משאיר מאחוריו: ניסוחים שכולם כבר מכירים, מספרים שאף אחד לא יכול להגן עליהם בראיון, ורשימת טכנולוגיות שלא מופיעה באף פרויקט שלך. המאמר הזה לא אומר לך להפסיק. הוא אומר איפה AI באמת מאיץ אותך, איפה הוא מסכן אותך, איך נראה prompt שלא ממציא, ואיך לבדוק כל פלט מול המודעה לפני שהוא יוצא מהמחשב שלך.",
      ],
    },
    {
      heading: "מה מגייס/ת רואה תוך שלוש שניות",
      paragraphs: [
        "מגייס/ת בחברת טכנולוגיה קורא/ת עשרות קו״ח ביום. אחרי כמה מאות קבצים שיצאו מאותו model, הדפוסים קופצים לעין בלי שום כלי זיהוי:",
      ],
      bullets: [
        "ניסוח גנרי: 'Passionate, results-driven developer with a proven track record', 'leveraged cutting-edge technologies', 'dynamic team player'. אלה המשפטים שהמודל מייצר כברירת מחדל כשלא נותנים לו חומר, והם לא אומרים כלום על מה בנית.",
        "מספרים מומצאים: 'שיפרתי ביצועים ב-40%' בפרויקט סטודנטים שאין לו משתמשים. המגייס/ת לא יודע/ת אם המספר אמיתי, אבל המראיין/ת הטכני/ת ישאל/תשאל 'איך מדדת?' ושם זה נגמר.",
        "טכנולוגיות בלי גיבוי: ב-Skills כתוב Kubernetes, Kafka ו-Terraform, ובפרויקטים יש אפליקציית React ואתר Flask. הפער בין שתי הרשימות בולט יותר מכל ניסוח.",
        "מכתב מקדים שמשקף את המודעה: המודל מעתיק את דרישות המשרה בחזרה בגוף ראשון ('I am excited to contribute to your mission of building scalable fintech infrastructure'). מי שכתב/ה את המודעה מזהה את המראה.",
        "אחידות: עשרה מועמדים באותו יום עם אותו מבנה בדיוק, summary, שלוש נקודות, וסיום ב-'I am confident that'. זה לא פוסל, אבל זה מוחק כל הבדל בינך לשאר.",
      ],
    },
    {
      paragraphs: [
        "חשוב להבין: הסיכון הוא לא 'גלאי AI'. הסיכון הוא הראיון. כל שורה בקו״ח היא שאלה פוטנציאלית, ומי שמולך מתמודד/ת עם פלט של מודלים כל יום. [בסקר Stack Overflow 2025](https://survey.stackoverflow.co/2025/ai) 84% מהמפתחים משתמשים או מתכננים להשתמש בכלי AI, אבל רק 3.1% סומכים מאוד על דיוק הפלט ו-45.7% לא סומכים עליו. מראיין/ת שמוודא/ת כל יום קוד שמודל כתב יוודא גם את הקו״ח שלך.",
      ],
    },
    {
      heading: "במה AI באמת עוזר",
      bullets: [
        "התאמת קו״ח קיימים למשרה: סדר הסעיפים, מה להדגיש, מילות מפתח מהמודעה, ניסוח מדויק יותר. התנאי: המודל מקבל את הקו״ח המקוריים ואת המודעה, ולא כותב מאפס. ה-tailor ב-[ResumeAI](/ResumeAI) עובד בדיוק ככה: מדגיש מה שיש ומראה מה חסר, במקום למלא את החסר.",
        "סיכום חברה לפני ראיון: 'מה החברה מוכרת, למי, מה ה-stack לפי הבלוג ההנדסי שלה, מה קרה לה בשנה האחרונה'. עשר דקות במקום שעה. אחר כך פותחים את האתר של החברה ומאמתים, כי המודל מערבב חברות עם שמות דומים ומשלים חוסרים מהדמיון.",
        "שאלות לשאול בסוף הראיון: 'על סמך המודעה והסיכום, תן לי חמש שאלות שמראות שהבנתי מה הצוות עושה'. בוחרים שתיים ומנסחים מחדש במילים שלך.",
        "ראיונות דמה: 'אתה מראיין Backend ב-fintech, תשאל אותי שאלה אחת, תחכה לתשובה, ואז שאלת המשך. בסוף תן לי משוב על מה היה חלש'. ואז חוזרים על זה בקול, לא בכתב. שאלות אמיתיות שמועמדים דיווחו עליהן, לפי חברה, יש ב-[מאגר השאלות](/interview-questions), ותרגול קוד בזמן ב-[practice](/practice).",
        "יצירת שאלות תרגול: 'עשרים שאלות על React hooks, מקלות לקשות, בלי תשובות. אני אענה ואתה תדרג'. המודל טוב מאוד ביצירת שאלות וסביר בבדיקה, ובלבד שאת/ה כותב/ת את התשובות לבד.",
        "הסבר של מושג שאת/ה חצי יודע/ת: 'תסביר לי event loop כמו senior שמסביר לג'וניור, ואז תשאל אותי שלוש שאלות כדי לבדוק שהבנתי'.",
        "הגהה באנגלית: דקדוק, זמנים, ניסוח. לא תוכן. אם המודל הציע 'שיפור' שמוסיף עובדה, מוחקים אותו.",
      ],
    },
    {
      heading: "מה לא מאצילים אף פעם",
      bullets: [
        "עובדות, מספרים וטכנולוגיות: אם משהו לא מופיע בקו״ח המקוריים שלך ולא בזיכרון שלך על עבודה שעשית, הוא לא נכנס. 'ניסיון עם PostgreSQL' אחרי שבוע של tutorial הוא לא ניסיון, והמראיין/ת ישאל/תשאל על indexes.",
        "תשובות בראיון בזמן אמת: מסך שני, אוזנייה, אפליקציות 'לחישה'. מראיינים מזהים את ההשהיה, את תנועת העיניים, את קצב ה'קריאה', ובעיקר את התשובה שלא מתחברת לשאלת ההמשך. ומעבר לזיהוי: זה הפרה של כללי היושרה של החברה, ושל תנאי השימוש של הכלים עצמם. [מדיניות השימוש של Anthropic](https://www.anthropic.com/legal/aup), למשל, אוסרת להטעות אנשים לגבי מקור התוכן או לגרום להם לחשוב שהם מדברים עם אדם כשהם לא.",
        "'למה דווקא אנחנו': המודל לא יודע למה את/ה רוצה את המשרה הזו. הוא יכתוב פסקה שמתאימה לכל חברה, ובדיוק זו הבעיה.",
        "שליחה המונית: 200 מועמדויות גנריות שהמודל 'התאים' בלחיצה מפסידות ל-15 מועמדויות שעברת עליהן אחת-אחת. המגייס/ת רואה את ההבדל במשפט הראשון.",
        "קוד או מידע ממעסיק קודם: לא מדביקים קוד קנייני או מסמכים פנימיים ב-chatbot כדי ש'יתאר את הפרויקט שלי'. מתארים מהזיכרון, ברמה שהיית אומר/ת בראיון.",
      ],
    },
    {
      heading: "דוגמה: prompt גרוע מול prompt טוב",
      paragraphs: [
        "ניקח bullet אמיתי מקו״ח של בוגר/ת: 'בניתי REST API ב-Node.js לפרויקט גמר שמנהל ציונים של סטודנטים'. המודעה דורשת Node.js, PostgreSQL, בדיקות אוטומטיות ו-CI/CD.",
        "ה-prompt הגרוע: 'תכתוב לי bullet מרשים לקו״ח של Backend Developer שמתאים למודעה הזו: [המודעה]'. פלט טיפוסי: 'Architected and deployed a scalable Node.js microservices backend with PostgreSQL and CI/CD pipelines, serving 10K+ users with 99.9% uptime'. חוץ מ-Node.js, כל מילה כאן מומצאת: אין microservices, אין 10K משתמשים, אין מדידת uptime, ו-PostgreSQL הופיע כי המודעה ביקשה אותו. בראיון השאלה הראשונה תהיה 'איך חילקת ל-microservices?', ואין תשובה.",
        "ה-prompt הטוב: 'הנה bullet מהקו״ח שלי: [הטקסט]. הנה דרישות המשרה: [הדרישות]. נסח מחדש את ה-bullet כך שידגיש את מה שרלוונטי לדרישות. חוקים: אל תוסיף שום טכנולוגיה, מספר או תוצאה שלא מופיעים בטקסט שלי. אם חסר לך מידע כדי לכסות דרישה, שאל אותי במקום לנחש. סמן בסוגריים מרובעים כל מקום שבו אתה מניח משהו'.",
        "פלט טיפוסי: 'Built a Node.js (Express) REST API for a final-year project that manages student grades [which database? did you write automated tests? how was it deployed?]'. עכשיו את/ה עונה: PostgreSQL, 12 בדיקות אינטגרציה ב-Jest, deploy ידני ל-Render. ה-bullet הסופי: 'Built a Node.js/Express REST API over PostgreSQL for a final-year grade-management project; covered the endpoints with 12 Jest integration tests; deployed to Render'. דרישת ה-CI/CD נשארה לא מכוסה, וזה בסדר: עדיף פער גלוי מהמצאה שמתפוצצת בראיון. אפשר להוסיף שורה כנה ב-Skills: 'GitHub Actions: learning, set up a basic pipeline on a side project' רק אחרי שבאמת עשית את זה, וזה עניין של ערב אחד.",
        "למה זה עובד: ה-prompt הטוב הופך את המודל משחקן למראיין. זה בדיוק מה שהספקים עצמם ממליצים: [מדריך ה-prompt engineering של OpenAI](https://developers.openai.com/api/docs/guides/prompt-engineering) מדגיש לתת למודל טקסט ייחוס במקום להסתמך על מה שהוא 'יודע', ו[המדריך של Anthropic לצמצום הזיות](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) ממליץ לתת למודל רשות לומר 'אני לא יודע', להגביל אותו למסמכים שסיפקת, ולדרוש ציטוט תומך לכל טענה. הקו״ח שלך הם המסמך; מה שאין בו לא קיים.",
      ],
    },
    {
      heading: "איך מאמתים פלט מול המודעה",
      bullets: [
        "קובץ מקור אחד: קו״ח master שכתבת ביד, בלי AI, ובו רק מה שנכון. כל גרסה מותאמת נגזרת ממנו. אף פעם לא מעדכנים את ה-master על סמך פלט של מודל.",
        "בדיקת שמות עצם: עוברים על כל טכנולוגיה, כלי, מספר ופועל של קנה מידה ('scaled', 'optimized', 'led') בפלט ומחפשים אותו ב-master או בזיכרון קונקרטי. לא נמצא, נמחק. בלי יוצאים מן הכלל.",
        "מיפוי דרישות: רושמים את דרישות המודעה בעמודה (ב-JobMatch, ברוב המשרות שמציינות שנות ניסיון וטכנולוגיות במפורש, בערך 62-63% מהקטלוג, הן כבר מחולצות לשדות לכל משרה). מול כל דרישה ש'כיסית', שאלה אחת: אפשר לדבר על זה חמש דקות? אם לא, מורידים או מנסחים בכנות כ-learning.",
        "קריאה בקול: משפט שלא היית אומר/ת בראיון לא נכנס לקו״ח. זה הבוחן הכי טוב ל-'leveraged cutting-edge technologies'.",
        "עקביות בין מקורות: קו״ח, LinkedIn, README ב-GitHub ומכתב מקדים עם אותם תאריכים, אותם תפקידים ואותו stack. גם [עוזר הכתיבה של LinkedIn](https://www.linkedin.com/help/linkedin/answer/a1444194) מציע טקסט ל-Headline ול-About, ומאפשר לערוך לפני שמירה. לערוך. ולא לשמור הצעה שמוסיפה עובדה.",
        "לזכור מי קורא: מערכות ATS לא דוחות לבד. Greenhouse, למשל, מציינת ב-[FAQ למועמדים](https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates) שה-Talent Matching שלה הוא כלי מסייע ולא מקבל החלטות, ושמגייסים ומנהלים נשארים אחראים לכל החלטה. כותבים לאדם, לא לאלגוריתם.",
      ],
    },
    {
      heading: "חברות ביטחוניות: כנות היא לא עניין של סגנון",
      paragraphs: [
        "חלק גדול משוק העבודה הטכנולוגי בישראל הוא חברות ביטחוניות וסטארטאפים שעובדים איתן, ובהרבה מהתפקידים האלה נדרש סיווג ביטחוני. התהליך כולל שאלון אישי מפורט, לעיתים ראיון, ובדיקת רקע של גוף ממלכתי. מה שנבדק שם הוא קודם כול עקביות וכנות: תאריכים, תפקידים, השכלה, שירות צבאי, מקומות עבודה. קו״ח ש-AI 'שיפר' (תואר 'בתהליך' שהפך ל-B.Sc., תפקיד בצבא ששודרג, חברה ש'עבדת' בה כשהיית פרילנסר/ית לחודש) יוצרים סתירה בין הקו״ח לשאלון. ואז הבעיה היא לא פער במיומנות, שאפשר לסגור, אלא אמינות, שאי אפשר.",
        "שתי נקודות נוספות: רבות מהחברות האלה אוסרות שימוש בכלי AI חיצוניים על מערכות העבודה, ובראיון עשויים לשאול איך את/ה משתמש/ת ב-AI. תשובה כנה עם ה-workflow שבמאמר הזה (master ביד, מודל שמתאים ושואל, אימות של כל שם עצם) היא יתרון, לא חיסרון. ולעולם לא מדביקים ב-chatbot ציבורי שום דבר שמקורו בסביבה מסווגת או תחת NDA, גם לא 'רק כדי לנסח'.",
      ],
    },
    {
      heading: "מה לעשות השבוע",
      bullets: [
        "יום 1: כותבים קו״ח master ביד, בלי מודל. כל bullet הוא משהו שאפשר לדבר עליו חמש דקות. אם אין כזה, זה bullet אחד פחות, לא bullet מומצא.",
        "יום 2: בוחרים שלוש משרות מ-[/jobs?exp=0-2](/jobs?exp=0-2) ומריצים על כל אחת את ה-prompt הטוב מהדוגמה. אחרי כל פלט, בדיקת שמות עצם.",
        "יום 3: לכל חברה, סיכום AI של עשר דקות, אימות באתר החברה, ושלוש שאלות משלך לסוף הראיון.",
        "יום 4: עשרים שאלות תרגול על הטכנולוגיה המרכזית במודעה. עונים לבד, המודל מדרג. ואז שתי שאלות אמיתיות ממאגר השאלות של החברה, בקול.",
        "יום 5: ראיון דמה אחד של 30 דקות, בקול, עם שאלות המשך. משוב כתוב בסוף, ושלוש נקודות לשיפור.",
        "יום 6: מעבר עקביות: LinkedIn, GitHub, קו״ח ומכתב מקדים עם אותם תאריכים ואותו stack.",
        "יום 7: מוחקים מכל המסמכים כל משפט שלא היית מוכן/ה להגן עליו מול senior. מה שנשאר הוא מה ששולחים.",
      ],
    },
  ],
  references: [
    {
      title: "Stack Overflow Developer Survey 2025: AI",
      url: "https://survey.stackoverflow.co/2025/ai",
      note: "84% משתמשים או מתכננים להשתמש בכלי AI; רק 3.1% סומכים מאוד על דיוק הפלט, 45.7% לא סומכים.",
    },
    {
      title: "מדריך ה-prompt engineering של OpenAI",
      url: "https://developers.openai.com/api/docs/guides/prompt-engineering",
      note: "מתן טקסט ייחוס למודל והוראות מפורשות במקום הסתמכות על ידע כללי.",
    },
    {
      title: "Anthropic: צמצום הזיות (Reduce hallucinations)",
      url: "https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations",
      note: "רשות לומר 'אני לא יודע', הגבלה למסמכים שסופקו, ציטוט תומך לכל טענה.",
    },
    {
      title: "מדיניות השימוש של Anthropic",
      url: "https://www.anthropic.com/legal/aup",
      note: "איסור להטעות לגבי מקור תוכן או לגרום לאנשים לחשוב שהם מדברים עם אדם.",
    },
    {
      title: "Greenhouse: MyGreenhouse FAQ למועמדים",
      url: "https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates",
      note: "Talent Matching הוא AI מסייע, לא קבלת החלטות אוטומטית; אדם אחראי לכל החלטה.",
    },
    {
      title: "LinkedIn: עוזר הכתיבה מבוסס AI לפרופיל",
      url: "https://www.linkedin.com/help/linkedin/answer/a1444194",
      note: "הצעות ל-Headline ול-About שאפשר לערוך לפני שמירה.",
    },
  ],
  en: {
    title: "Use AI in Your Job Search Without Getting Caught Out",
    excerpt:
      "Recruiters spot AI-written résumés and cover letters within a few lines. Where the tools genuinely speed you up, what you must never delegate, a good prompt versus a bad one, and how to check every output against the posting before it leaves your machine.",
    tags: ["AI", "Résumé", "Interviews", "Strategy"],
    sections: [
      {
        paragraphs: [
          "In 2026 almost every junior candidate uses ChatGPT or Claude at some point in the job search, and recruiters know it. The problem is not the tool; it is what the tool leaves behind: phrasing everyone has read a hundred times, numbers nobody can defend in an interview, and a skills list that matches none of your projects. This article does not tell you to stop. It tells you where AI genuinely speeds you up, where it puts you at risk, what a prompt that does not invent things looks like, and how to verify every output against the posting before it leaves your machine.",
        ],
      },
      {
        heading: "What a recruiter sees in three seconds",
        paragraphs: [
          "A recruiter at a tech company reads dozens of résumés a day. After a few hundred files that came out of the same model, the patterns are obvious without any detection tool:",
        ],
        bullets: [
          "Generic phrasing: 'Passionate, results-driven developer with a proven track record', 'leveraged cutting-edge technologies', 'dynamic team player'. These are the sentences a model produces by default when you give it nothing to work with, and they say nothing about what you built.",
          "Invented metrics: 'Improved performance by 40%' on a student project with no users. The recruiter cannot tell whether the number is real, but the technical interviewer will ask 'how did you measure that?' and that is where it ends.",
          "Technologies with no backing: the skills section lists Kubernetes, Kafka and Terraform; the projects section has a React app and a Flask site. The gap between the two lists stands out more than any wording.",
          "A cover letter that mirrors the posting: the model copies the job requirements back in the first person ('I am excited to contribute to your mission of building scalable fintech infrastructure'). The person who wrote the posting recognises the reflection.",
          "Uniformity: ten candidates on the same day with exactly the same structure, a summary, three bullets, and a closing 'I am confident that'. It does not disqualify you, but it erases every difference between you and the rest.",
        ],
      },
      {
        paragraphs: [
          "The risk is not an 'AI detector'. The risk is the interview. Every line on your résumé is a potential question, and the person across the table deals with model output every day. In the [Stack Overflow 2025 Developer Survey](https://survey.stackoverflow.co/2025/ai), 84% of developers use or plan to use AI tools, yet only 3.1% highly trust the accuracy of the output and 45.7% distrust it. An interviewer who verifies model-written code every day will verify your résumé the same way.",
        ],
      },
      {
        heading: "What AI is genuinely good for",
        bullets: [
          "Tailoring an existing résumé to a posting: section order, what to emphasise, keywords from the posting, tighter wording. The condition: the model receives your original résumé and the posting, and does not write from scratch. The tailor in [ResumeAI](/ResumeAI) works exactly this way: it highlights what is there and shows what is missing, instead of filling the gap.",
          "Summarising a company before an interview: 'what does the company sell, to whom, what is the stack according to its engineering blog, what happened to it in the last year'. Ten minutes instead of an hour. Then open the company's site and verify, because models mix up companies with similar names and fill holes from imagination.",
          "Questions to ask at the end: 'based on the posting and the summary, give me five questions that show I understood what the team does'. Pick two and rewrite them in your own words.",
          "Mock interviews: 'you are a backend interviewer at a fintech, ask me one question, wait for my answer, then a follow-up. At the end, tell me what was weak'. Then do it again out loud, not in writing. Real questions reported by candidates, per company, are in the [question bank](/interview-questions), and timed coding practice in [practice](/practice).",
          "Generating practice questions: 'twenty questions on React hooks, easy to hard, no answers. I will answer and you will grade'. Models are very good at writing questions and decent at grading, as long as you write the answers yourself.",
          "Explaining a concept you half know: 'explain the event loop the way a senior would explain it to a junior, then ask me three questions to check I understood'.",
          "Proofreading English: grammar, tenses, phrasing. Not content. If the model proposes an 'improvement' that adds a fact, delete it.",
        ],
      },
      {
        heading: "What you never delegate",
        bullets: [
          "Facts, numbers and technologies: if something is not in your original résumé and not in your memory of work you actually did, it does not go in. 'Experience with PostgreSQL' after a week of tutorials is not experience, and the interviewer will ask about indexes.",
          "Interview answers in real time: a second screen, an earpiece, 'whisper' apps. Interviewers notice the delay, the eye movement, the reading cadence, and above all the answer that does not connect to the follow-up question. Beyond detection, it breaks the company's integrity rules and the usage terms of the tools themselves. [Anthropic's Usage Policy](https://www.anthropic.com/legal/aup), for example, prohibits misleading people about the origin of content or convincing them they are interacting with a human when they are not.",
          "'Why us': the model does not know why you want this job. It will write a paragraph that fits any company, which is precisely the problem.",
          "Mass sending: 200 generic applications the model 'tailored' in one click lose to 15 applications you went through one by one. The recruiter sees the difference in the first sentence.",
          "Code or data from a previous employer: do not paste proprietary code or internal documents into a chatbot so it can 'describe my project'. Describe it from memory, at the level you would say in an interview.",
        ],
      },
      {
        heading: "Worked example: a bad prompt versus a good one",
        paragraphs: [
          "Take a real bullet from a graduate's résumé: 'Built a REST API in Node.js for a final-year project that manages student grades'. The posting asks for Node.js, PostgreSQL, automated tests and CI/CD.",
          "The bad prompt: 'Write me an impressive résumé bullet for a Backend Developer that fits this posting: [posting]'. Typical output: 'Architected and deployed a scalable Node.js microservices backend with PostgreSQL and CI/CD pipelines, serving 10K+ users with 99.9% uptime'. Apart from Node.js, every word is invented: there are no microservices, no 10K users, no uptime measurement, and PostgreSQL appeared because the posting asked for it. The first interview question will be 'how did you split it into microservices?', and there is no answer.",
          "The good prompt: 'Here is a bullet from my résumé: [text]. Here are the job requirements: [requirements]. Rewrite the bullet to emphasise what is relevant to the requirements. Rules: do not add any technology, number or outcome that does not appear in my text. If you lack information to cover a requirement, ask me instead of guessing. Mark in square brackets every place where you are assuming something'.",
          "Typical output: 'Built a Node.js (Express) REST API for a final-year project that manages student grades [which database? did you write automated tests? how was it deployed?]'. Now you answer: PostgreSQL, 12 integration tests in Jest, manual deploy to Render. The final bullet: 'Built a Node.js/Express REST API over PostgreSQL for a final-year grade-management project; covered the endpoints with 12 Jest integration tests; deployed to Render'. The CI/CD requirement stays uncovered, and that is fine: a visible gap beats an invention that explodes in the interview. You can add an honest line under skills, 'GitHub Actions: learning, set up a basic pipeline on a side project', only after you have actually done it, which is one evening's work.",
          "Why it works: the good prompt turns the model from an actor into an interviewer. This is exactly what the vendors themselves recommend. [OpenAI's prompt engineering guide](https://developers.openai.com/api/docs/guides/prompt-engineering) stresses giving the model reference text rather than relying on what it 'knows', and [Anthropic's guide to reducing hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) recommends giving the model permission to say 'I don't know', restricting it to the documents you provided, and requiring a supporting quote for every claim. Your résumé is the document; what is not in it does not exist.",
        ],
      },
      {
        heading: "How to verify output against the posting",
        bullets: [
          "One source of truth: a master résumé you wrote by hand, with no AI, containing only what is true. Every tailored version derives from it. You never update the master based on model output.",
          "The noun check: go over every technology, tool, number and scale verb ('scaled', 'optimised', 'led') in the output and find it in the master or in a concrete memory. Not found, deleted. No exceptions.",
          "Requirement mapping: list the posting's requirements in a column (on JobMatch, for the roughly 62-63% of postings that state years of experience and technologies explicitly, they are already extracted into fields per posting). For every requirement you 'covered', one question: can you talk about it for five minutes? If not, remove it or phrase it honestly as learning.",
          "Read it aloud: a sentence you would not say in an interview does not go on the résumé. This is the best test for 'leveraged cutting-edge technologies'.",
          "Consistency across sources: résumé, LinkedIn, GitHub READMEs and cover letter with the same dates, the same titles and the same stack. [LinkedIn's own AI writing assistant](https://www.linkedin.com/help/linkedin/answer/a1444194) drafts a Headline and About section and lets you edit before saving. Edit. And never save a suggestion that adds a fact.",
          "Remember who reads it: ATS platforms do not reject on their own. Greenhouse, for one, states in its [candidate FAQ](https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates) that its Talent Matching is assistive AI, not automated decision-making, and that recruiters and hiring managers remain responsible for every decision. Write for the human, not the algorithm.",
        ],
      },
      {
        heading: "Defence and security-cleared companies: honesty is not a style choice",
        paragraphs: [
          "A large share of Israel's tech job market is defence companies and the startups that work with them, and many of those roles require a security clearance. The process includes a detailed personal questionnaire, sometimes an interview, and a background check by a state body. What gets examined there is first of all consistency and honesty: dates, roles, education, military service, employers. A résumé that AI 'improved' (a degree 'in progress' that became a B.Sc., an army role that got upgraded, a company you 'worked at' when you freelanced there for a month) creates a contradiction between the résumé and the questionnaire. At that point the problem is no longer a skills gap, which you can close, but credibility, which you cannot.",
          "Two more points. Many of these companies prohibit external AI tools on work systems, and the interview may ask how you use AI. An honest answer with the workflow in this article (a hand-written master, a model that tailors and asks, a noun check on everything) is an advantage, not a liability. And you never paste anything that originated in a classified or NDA environment into a public chatbot, not even 'just to rephrase it'.",
        ],
      },
      {
        heading: "What to do this week",
        bullets: [
          "Day 1: write a master résumé by hand, no model. Every bullet is something you can talk about for five minutes. If there is none, that is one bullet fewer, not one invented bullet.",
          "Day 2: pick three postings from [/jobs?exp=0-2](/jobs?exp=0-2) and run the good prompt from the example on each. After every output, the noun check.",
          "Day 3: for each company, a ten-minute AI summary, verification on the company's site, and three questions of your own for the end of the interview.",
          "Day 4: twenty practice questions on the posting's main technology. Answer alone, let the model grade. Then two real questions from the company's question bank, out loud.",
          "Day 5: one 30-minute mock interview, out loud, with follow-ups. Written feedback at the end and three things to improve.",
          "Day 6: a consistency pass: LinkedIn, GitHub, résumé and cover letter with the same dates and the same stack.",
          "Day 7: delete from every document any sentence you would not be ready to defend in front of a senior engineer. What remains is what you send.",
        ],
      },
    ],
    references: [
      {
        title: "Stack Overflow Developer Survey 2025: AI",
        url: "https://survey.stackoverflow.co/2025/ai",
        note: "84% use or plan to use AI tools; only 3.1% highly trust output accuracy, 45.7% distrust it.",
      },
      {
        title: "OpenAI prompt engineering guide",
        url: "https://developers.openai.com/api/docs/guides/prompt-engineering",
        note: "Giving the model reference text and explicit instructions instead of relying on general knowledge.",
      },
      {
        title: "Anthropic: Reduce hallucinations",
        url: "https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations",
        note: "Permission to say 'I don't know', restriction to provided documents, a supporting quote for every claim.",
      },
      {
        title: "Anthropic Usage Policy",
        url: "https://www.anthropic.com/legal/aup",
        note: "Prohibits misleading people about the origin of content or convincing them they are talking to a human.",
      },
      {
        title: "Greenhouse: MyGreenhouse FAQ for Candidates",
        url: "https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates",
        note: "Talent Matching is assistive AI, not automated decision-making; a person is responsible for every decision.",
      },
      {
        title: "LinkedIn: AI-powered writing assistant for your profile",
        url: "https://www.linkedin.com/help/linkedin/answer/a1444194",
        note: "Headline and About suggestions you can edit before saving.",
      },
    ],
  },
};

export default article;
