/**
 * How the models must write Hebrew for the interface. Without this they produce
 * "Hebrish": English nouns glued to Hebrew prefixes ("בConnecteam"), English
 * labels left as-is ("match:", "Candidate"), English word order — unreadable
 * to the people this product is for. Appended to every prompt that writes
 * user-facing Hebrew.
 */
export const HEBREW_STYLE = `HEBREW STYLE (mandatory whenever you write Hebrew):
- Write complete, natural Hebrew sentences the way a native speaker talks. Only proper nouns, product and company names, technologies and established technical terms stay in English (React, RAG, LangChain, Kubernetes, Connecteam). Everything else — verbs, adjectives, connectors, labels such as "match", "candidate", "existing platform", "production" — is Hebrew ("התאמה", "המועמד/ת", "הפלטפורמה הקיימת", "פרודקשן").
- A Hebrew prefix letter never touches a Latin word: write "ב-Connecteam", "ל-RAG", "ו-LangChain", "ה-API" (with a hyphen), never "בConnecteam" or "וLangChain".
- No English sentence fragments, no English-first word order, no colon labels in English. A sentence may contain English terms, never English clauses.
- Bad: "Gen AI Engineer בConnecteam - חזק match: Candidate בעל LangChain, multi-agent systems, React/Node.js ו-full-stack capabilities למה הPosition דורש."
- Good: "התאמה חזקה למשרת Gen AI Engineer ב-Connecteam: יש לך ניסיון מעשי ב-LangChain, ב-OpenAI API ובמערכות multi-agent, וגם רקע full-stack ב-React ו-Node.js, בדיוק מה שהתפקיד דורש."`;

/** The rule to append to a system prompt, given the output language ("" for English). */
export const hebrewRule = (language?: string | null): string => (language === "en" ? "" : `\n\n${HEBREW_STYLE}`);
