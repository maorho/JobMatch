import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
} from "@langchain/core/messages";

const SYSTEM_PROMPT = `
אתה ResumeAI –  עוזר קו״ח חכם שמנהל שיחה טבעית בעברית.

מטרתך:
1. לשוחח בצורה אנושית, אמפתית וברורה.
2. ברגע שיש קובץ קורות חיים (יופיע בהודעת system: "RESUME_UPLOADED"):
   - לשאול אם המשתמש רוצה שיפור כללי או למשרה ספציפית.
   - אם למשרה ספציפית, לבקש:
     - שם התפקיד
     - לינק למשרה (אם יש)
     - דרישות או טכנולוגיות חשובות
   - לשאול אם יש דברים שהמשתמש רוצה להדגיש או להסתיר.

כשאתה מרגיש שיש מספיק מידע כדי לבנות קורות חיים משופרים,
או כשהמשתמש מבקש במפורש "תבנה", "תייצר", "תיצור לי קורות חיים" וכדומה:

1. תסכם לו בקצרה מה הבנת (בשפה טבעית, בעברית).
2. בסוף התשובה, בשורה נפרדת, תוסיף אך ורק את הטוקן:
   ###READY_TO_BUILD###

חשוב מאוד:
- אין להחזיר JSON.
- אין להחזיר פורמט טכני (לא YAML, לא קוד).
- אין להזכיר למשתמש את המילה READY_TO_BUILD או את הטוקן.
- אתה רק משוחח, שואל שאלות, ומחליט מתי הגיע הזמן לבנות את הקו"ח.
`;

type Role = "user" | "assistant" | "system";

interface ChatMessage {
  role: Role;
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: ChatMessage[] } = await req.json();

    const llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.4,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const formattedMessages = [
      new SystemMessage(SYSTEM_PROMPT),
      ...messages.map((m) => {
        if (m.role === "user") return new HumanMessage(m.content);
        if (m.role === "assistant") return new AIMessage(m.content);
        // הודעות system (כולל RESUME_UPLOADED) נכנסות כמו שהן
        return new SystemMessage(m.content);
      }),
    ];

    const result = await llm.invoke(formattedMessages);

    let text: string;
    if (typeof result.content === "string") {
      text = result.content;
    } else if (Array.isArray(result.content)) {
      text = result.content.map((p: any) => p?.text ?? "").join("");
    } else {
      text = "";
    }

    const readyToBuild = text.includes("###READY_TO_BUILD###");
    const cleanReply = text.replace("###READY_TO_BUILD###", "").trim();

    return NextResponse.json({
      reply: cleanReply,
      readyToBuild,
    });
  } catch (err: unknown) {
    console.error("❌ resume-conversation error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: (err as Error).message },
      { status: 500 }
    );
  }
}
