/** UI strings for the resume area. Keys are prefixed "resume."; `en` must have exactly the keys of `he`. */
export const he = {
  // Page
  "resume.pageTitle": "ResumeAI – בניית ושיפור קורות חיים",
  "resume.pageSubtitle": "אתה יכול לנהל שיחה חופשית, להעלות קובץ קורות חיים קיים, או לבנות קורות חיים מאפס.",
  "resume.greeting":
    "היי, אני ResumeAI 🤖\nאני אעזור לך לבנות או לשפר קורות חיים – גם אם אין לך קובץ מוכן.\nתוכל לספר לי קצת על עצמך, או לצרף לשיחה קובץ: קורות חיים קיימים, תיאור משרה, או כל מסמך רלוונטי (PDF, Word או טקסט).",

  // Upload card
  "resume.uploadCta": "📄 העלה קו״ח",
  "resume.score": "⭐ Resume Score: {score}/100",
  "resume.download": "📄 הורד קורות חיים משופרים (ATS Ready)",
  "resume.savedForMatching": "🎯 קורות החיים שלך נשמרו — הפיד שלך עכשיו מותאם אישית אליהם.",
  "resume.seeMatchingJobs": "ראה משרות שמתאימות לקורות החיים שלך",

  // Chat card
  "resume.dropToAttach": "שחרר כדי לצרף לשיחה",
  "resume.attachmentChars": "{n} תווים",
  "resume.attachmentTruncated": " (קוצר)",
  "resume.attachmentIsResume": "· קו״ח",
  "resume.readingFiles": "קורא את הקבצים…",
  "resume.thinking": "המערכת חושבת…",
  "resume.removeFile": "הסר {name}",
  "resume.attachTitle": "צרף קובץ (PDF, Word, טקסט)",
  "resume.attachAria": "צרף קובץ",
  "resume.placeholderWithFiles": "הוסף הודעה לקבצים (לא חובה)…",
  "resume.placeholder": "כתוב כאן שאלה או תיאור (למשל: 'אני מחפש משרת ג'וניור בפיתוח')...",
  "resume.send": "שלח",

  // File validation (client side)
  "resume.fileTypeError": "{name}: רק PDF, Word (docx) או טקסט",
  "resume.fileTooLarge": "{name}: גדול מ-8MB",
  "resume.tooManyFiles": "עד {n} קבצים להודעה",
  "resume.whyTooLarge": "גדול מדי",
  "resume.whyUnsupported": "סוג קובץ לא נתמך",
  "resume.whyEmpty": "לא נמצא בו טקסט (סרוק כתמונה?)",
  "resume.whyUnreadable": "לא הצלחתי לקרוא אותו",
  "resume.attachFailed": "⚠️ לא הצלחתי לצרף: {list}",
  "resume.filesUnreadable": "⚠️ לא הצלחתי לקרוא את הקבצים. נסה קובץ אחר או שלח בלי קבצים.",
  "resume.attachedFile": "[קובץ מצורף: {name}]",

  // Status messages the client itself posts into the chat
  "resume.quotaReached": "⚠️ הגעת למכסה היומית של השיחה. נמשיך מחר.",
  "resume.genericError": "⚠️ אירעה שגיאה. נסה שוב בעוד רגע.",
  "resume.networkError": "⚠️ שגיאה בתקשורת עם השרת. נסה שוב.",
  "resume.building": "מעולה! אני בונה עכשיו עבורך קורות חיים משופרים באנגלית…",
  "resume.buildFailed": "⚠️ לא הצלחתי לבנות קורות חיים. נסה שוב מאוחר יותר.",
  "resume.pdfFailed": "⚠️ הייתה בעיה ביצירת קובץ ה-PDF.",
  "resume.buildDone": "📄 סיימתי לבנות את קורות החיים המשופרים שלך! אפשר להוריד אותם בלחיצה על הכפתור למטה.",
  "resume.buildError": "⚠️ אירעה שגיאה בתהליך הבנייה. נסה שוב.",
  "resume.uploadReadFailed": "⚠️ שגיאה בקריאת קובץ ה-PDF. נסה קובץ אחר.",
  "resume.uploadReceived": "📄 קיבלתי את קובץ הקורות חיים. משפר אותם עבורך עכשיו…",
  "resume.improveFailed": "⚠️ לא הצלחתי לשפר את קובץ הקו״ח. נסה שוב בעוד רגע.",
  "resume.uploadDone": "✨ סיימתי לשפר את קורות החיים שהעלית! אפשר להוריד אותם עכשיו בלחיצה על הכפתור למטה.",
  "resume.uploadError": "⚠️ שגיאה בעיבוד הקובץ. נסה שוב.",
} as const;

export const en: Record<keyof typeof he, string> = {
  // Page
  "resume.pageTitle": "ResumeAI – build and improve your résumé",
  "resume.pageSubtitle": "Chat freely, upload an existing résumé, or build one from scratch.",
  "resume.greeting":
    "Hi, I'm ResumeAI 🤖\nI'll help you build or improve your résumé – even if you don't have a file yet.\nTell me a bit about yourself, or attach a file to the chat: an existing résumé, a job description, or any relevant document (PDF, Word or text).",

  // Upload card
  "resume.uploadCta": "📄 Upload résumé",
  "resume.score": "⭐ Résumé score: {score}/100",
  "resume.download": "📄 Download improved résumé (ATS ready)",
  "resume.savedForMatching": "🎯 Your résumé is saved — your feed is now personalised to it.",
  "resume.seeMatchingJobs": "See jobs that match your résumé",

  // Chat card
  "resume.dropToAttach": "Drop to attach to the chat",
  "resume.attachmentChars": "{n} characters",
  "resume.attachmentTruncated": " (truncated)",
  "resume.attachmentIsResume": "· résumé",
  "resume.readingFiles": "Reading files…",
  "resume.thinking": "Thinking…",
  "resume.removeFile": "Remove {name}",
  "resume.attachTitle": "Attach a file (PDF, Word, text)",
  "resume.attachAria": "Attach a file",
  "resume.placeholderWithFiles": "Add a message to the files (optional)…",
  "resume.placeholder": "Ask a question or describe yourself (e.g. 'I'm looking for a junior developer role')...",
  "resume.send": "Send",

  // File validation (client side)
  "resume.fileTypeError": "{name}: only PDF, Word (docx) or text",
  "resume.fileTooLarge": "{name}: larger than 8MB",
  "resume.tooManyFiles": "Up to {n} files per message",
  "resume.whyTooLarge": "too large",
  "resume.whyUnsupported": "unsupported file type",
  "resume.whyEmpty": "no text found (scanned as an image?)",
  "resume.whyUnreadable": "couldn't read it",
  "resume.attachFailed": "⚠️ Couldn't attach: {list}",
  "resume.filesUnreadable": "⚠️ I couldn't read the files. Try another file or send without attachments.",
  "resume.attachedFile": "[Attached file: {name}]",

  // Status messages the client itself posts into the chat
  "resume.quotaReached": "⚠️ You've reached today's chat limit. Let's continue tomorrow.",
  "resume.genericError": "⚠️ Something went wrong. Please try again in a moment.",
  "resume.networkError": "⚠️ Couldn't reach the server. Please try again.",
  "resume.building": "Great! I'm building your improved résumé in English now…",
  "resume.buildFailed": "⚠️ I couldn't build the résumé. Please try again later.",
  "resume.pdfFailed": "⚠️ There was a problem creating the PDF.",
  "resume.buildDone": "📄 Your improved résumé is ready! Download it with the button below.",
  "resume.buildError": "⚠️ Something went wrong while building. Please try again.",
  "resume.uploadReadFailed": "⚠️ I couldn't read that PDF. Try another file.",
  "resume.uploadReceived": "📄 Got your résumé. Improving it now…",
  "resume.improveFailed": "⚠️ I couldn't improve the résumé. Please try again in a moment.",
  "resume.uploadDone": "✨ Your uploaded résumé has been improved! Download it with the button below.",
  "resume.uploadError": "⚠️ Something went wrong processing the file. Please try again.",
};
