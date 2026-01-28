import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import User, { IUser } from "@/app/models/User";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";

type ExtractedMemory = {
  skills?: string[];
  experience?: string[];
  preferredLanguage?: "he" | "en";
  preferredStyle?: string;
};

function detectLanguage(text: string): "he" | "en" {
  if (!text) return "he";
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  return hasHebrew ? "he" : "en";
}

// NLP קטן שמחלץ מידע מהטקסט של המשתמש
function extractMemoryFromText(text: string): ExtractedMemory {
  const memory: ExtractedMemory = {};
  const lower = text.toLowerCase();

  // שפה מועדפת
  if (lower.includes("english") || lower.includes("in english")) {
    memory.preferredLanguage = "en";
  }
  if (lower.includes("עברית") || lower.includes("בעברית")) {
    memory.preferredLanguage = "he";
  }

  // מיומנויות בסיסיות (אפשר להרחיב)
  const knownSkills = [
    "react",
    "node",
    "next",
    "typescript",
    "javascript",
    "python",
    "java",
    "sql",
    "mongodb",
    "mysql",
    "aws",
    "docker",
    "kubernetes",
    "express",
    "c++",
  ];

  memory.skills = knownSkills.filter((skill) =>
    lower.includes(skill.toLowerCase())
  );

  // ניסיון – משפטים אופייניים
  const experienceRegex =
    /(worked|experience|managed|built|developed|led|ניהלתי|אני עובד|אני עבדתי|יש לי ניסיון|עבדתי כ)[^.!?]{0,120}/gi;
  const matches = text.match(experienceRegex);
  memory.experience = matches || [];

  // סגנון קורות חיים
  if (lower.includes("ats")) {
    memory.preferredStyle = "ats";
  } else if (lower.includes("modern") || lower.includes("מודרני")) {
    memory.preferredStyle = "modern";
  } else if (lower.includes("elegant") || lower.includes("אלגנטי")) {
    memory.preferredStyle = "elegant";
  }

  return memory;
}

// עדכון זיכרון במסד
async function updateUserMemory(
  userId: string | null | undefined,
  mem: ExtractedMemory
) {
  if (!userId || !mem) return;

  const update: any = {};

  if (mem.skills && mem.skills.length) {
    update.$addToSet = update.$addToSet || {};
    update.$addToSet["memory.skills"] = { $each: mem.skills };
  }

  if (mem.experience && mem.experience.length) {
    update.$addToSet = update.$addToSet || {};
    update.$addToSet["memory.experience"] = { $each: mem.experience };
  }

  if (mem.preferredLanguage || mem.preferredStyle) {
    update.$set = update.$set || {};
    if (mem.preferredLanguage) {
      update.$set["memory.preferences.preferredLanguage"] =
        mem.preferredLanguage;
    }
    if (mem.preferredStyle) {
      update.$set["memory.preferences.preferredResumeStyle"] =
        mem.preferredStyle;
    }
  }

  if (Object.keys(update).length === 0) return;

  await User.findByIdAndUpdate(userId, update, { new: true }).lean();
}

// האם יש מידע מינימלי לבניית קו״ח?
function hasMinimalResumeInfo(user: IUser | null, mem: ExtractedMemory) {
  const skillsCount =
    (user?.memory?.skills?.length || 0) + (mem.skills?.length || 0);
  const expCount =
    (user?.memory?.experience?.length || 0) + (mem.experience?.length || 0);

  const hasHeadline =
    Boolean(user?.currentJob) ||
    /משרת|תפקיד|role|position|job/i.test(
      (mem.experience || []).join(" ")
    );

  return skillsCount >= 2 && expCount >= 1 && hasHeadline;
}

export async function POST(req: NextRequest) {
  try {
    const { messages} = await req.json();
    const userId = await getUserIdFromRequest(req)
    console.log('userid:',userId);
    connectToDatabase();

    const lastUserMessage =
      messages.filter((m: any) => m.role === "user").at(-1)?.content || "";

    const extractedMemory = lastUserMessage
      ? extractMemoryFromText(lastUserMessage)
      : {};

    if (userId) {
      await updateUserMemory(userId, extractedMemory);
    }

    const user: IUser | null = userId
      ? await User.findById(userId).lean()
      : null;

    const isAdmin = !!user?.admin;
    const hasResumeFile = !!user?.resume;

    const langFromMemory =
      (user?.memory?.preferences?.preferredLanguage as "he" | "en") ||
      extractedMemory.preferredLanguage;
    const lang =
      langFromMemory || detectLanguage(lastUserMessage || messages[0]?.content);
    console.log(`user`,user);
    const memorySummary = `
            Known user info:
            - Name: ${user?.fullname || "Unknown"}
            - Email: ${user?.email || "Unknown"}
            - Phone: ${user?.phone ||"unknown"}
            - Current job: ${user?.currentJob || "Unknown"}
            - Has stored resume file: ${hasResumeFile}
            - Is admin: ${isAdmin}
            - Skills in memory: ${(user?.memory?.skills || []).join(", ")}
            - Experience in memory: ${(user?.memory?.experience || []).join(" | ")}
            - Preferred language: ${
                user?.memory?.preferences?.preferredLanguage ||
                extractedMemory.preferredLanguage ||
                "he"
                }
            - Preferred resume style: ${
                user?.memory?.preferences?.preferredResumeStyle ||
                extractedMemory.preferredStyle ||
                "ats"
                }
                `.trim();

                const minimalInfoReady = hasMinimalResumeInfo(user, extractedMemory);

                const SYSTEM_PROMPT_HE = `
            אתה ResumeAI – יועץ קורות חיים חכם, אנושי, שמנהל שיחה טבעית.

            המטרה:
            1. לעזור לכל אדם – גם בלי רקע טכני, גם בלי קובץ קורות חיים, וגם בלי לדעת מה לכתוב.
            2. ללוות אותו צעד־אחר־צעד ולבנות לו קורות חיים חזקים באנגלית, מותאמים למערכות ATS.

            מידע ידוע:
            ${memorySummary}

            חוקי התנהגות:
            - תכתוב בעברית אם המשתמש מדבר עברית, ובאנגלית אם הוא מדבר אנגלית.
            - אל תשתמש בשפה טכנית (JSON, טוקנים, ATS tokens וכו') מול המשתמש.
            - אם אין למשתמש קורות חיים:
            * עבור למצב "ראיון": שאל שאלות פשוטות:
                - ספר לי קצת על עצמך
                - איפה עבדת בעבר / מה למדת
                - מה אתה יודע לעשות טוב
                - לאיזה סוג תפקיד אתה מכוון
                - אלו שפות אתה יודע
                - מה חשוב לך שיראו בקורות החיים
            - אם יש קובץ קורות חיים שמור:
            * שאל האם לשפר את הקובץ הקיים או לבנות אחד חדש מאפס
            * שאל אם זה למשרה ספציפית (תפקיד, לינק, דרישות) או לשימוש כללי
            - אל תבנה קורות חיים עד שיש מידע מינימלי על:
            * אם המשתמש לא מחובר בקש ממנו  שם מלא ,מייל,טלפון,לינקדאין (אם יש),גיטהאב
            * ניסיון / עיסוק
            * מיומנויות / טכנולוגיות / חוזקות/שפות
            * הכשרות או תארים כולל שם המוסד בו למד/ה
            * שפות
            * כיוון תעסוקתי (ג'וניור, מפתח, מנהל וכו')

            כשהמשתמש מבקש ממך במפורש לבנות קורות חיים, ואתה חושב שיש מספיק מידע (minimalInfoReady = ${minimalInfoReady}):
            1. סכם לו בקצרה מה הבנת על הפרופיל שלו (בעברית).
            2. בשורה האחרונה של ההודעה, בשורה נפרדת לגמרי, תכתוב רק:
            ###READY_TO_BUILD###

            אסור:
            - לא להזכיר למשתמש את המילה READY_TO_BUILD.
            - לא להחזיר JSON.
            - לא לבנות קורות חיים אם *אין מספיק מידע* – גם אם המשתמש כותב "פשוט תבנה".
            `.trim();

                const SYSTEM_PROMPT_EN = `
            You are ResumeAI – a warm, human-like resume assistant.

            Your goal:
            1. Help ANY user, even with zero tech background and no existing resume.
            2. Ask simple, conversational questions and build a strong, ATS-friendly resume in English.

            Known info:
            ${memorySummary}

            Behavior:
            - If the user speaks Hebrew, respond in Hebrew. If they switch to English, respond in English.
            - Do NOT expose any technical details (JSON, tokens, etc.) to the user.
            - If the user has no resume:
            * Start an interview-style flow with easy questions:
                - Tell me a bit about yourself.
                - Where have you worked or what have you studied?
                - What are you good at?
                - What roles are you targeting?
                - What would you like employers to notice first?
            - If the user has an existing stored resume:
            * Ask if they want to improve it or create a new resume from scratch.
            * Ask if it's for a specific role (job title, link, requirements) or a general resume.
            - Never "just build" a resume with almost no information. Always ask clarifying questions first.

            When the user clearly asks you to build a resume AND you believe there is enough information
            (minimalInfoReady = ${minimalInfoReady}):
            1. Briefly summarize what you understood about the user's profile.
            2. On a separate last line of your answer, append exactly:
            ###READY_TO_BUILD###

            Do NOT:
            - Mention the existence of the READY_TO_BUILD token.
            - Return JSON or machine-readable output.
            - Append the token if there is still not enough information, even if the user insists.
            `.trim();

    const systemText = lang === "he" ? SYSTEM_PROMPT_HE : SYSTEM_PROMPT_EN;

    const llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const formattedMessages = [
      new SystemMessage(systemText),
      ...messages.map((m: any) => {
        if (m.role === "user") return new HumanMessage(m.content);
        if (m.role === "assistant") return new AIMessage(m.content);
        if (m.role === "system") return new SystemMessage(m.content);
        return new HumanMessage(m.content);
      }),
    ];

    const result = await llm.invoke(formattedMessages);
    const reply =
      typeof result.content === "string"
        ? result.content
        : (result.content as any[])
            .map((p) => p?.text ?? "")
            .join("");

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("❌ resume-conversation error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
