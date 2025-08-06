
import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";

const llm = new ChatOpenAI({
  temperature: 0.3,
  modelName: "gpt-4o",
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: { role: string; content: string }[] } =
      await req.json();

    let rawResumeText = "";

    // חילוץ תוכן קובץ אם קיים
    const filteredMessages = messages.filter((msg) => {
      if (msg.role === "system" && msg.content.startsWith("raw_resume_text::")) {
        rawResumeText = msg.content.replace("raw_resume_text::", "").trim();
        return false; // לא נשלח לצ'אט
      }
      return true;
    });

    const shortHistory = filteredMessages.slice(-10);

    // מייצר פרומפט שמבקש JSON בלבד
const jsonPrompt = `
You are a professional resume writer. Based on the following resume and job context, return an improved version in structured JSON format like this:

[
  {
    "heading": "Contact",
    "items": [
      {
        "title": "Personal Info",
        "lines": ["Name: John Doe", "Email: john@example.com", "GitHub: github.com/johndoe"]
      }
    ]
  },
  {
    "heading": "Experience",
    "items": [
      {
        "title": "Software Developer, XYZ",
        "lines": ["Developed React apps", "Worked with MongoDB"]
      }
    ]
  }
]

The first section should always include full contact information, if available.
Only return valid JSON.

Resume text:
"""${rawResumeText.slice(0, 3000)}"""
`.trim();


    // שיחה עדכנית
    const latest = messages.at(-1)?.content || "שלום";

    const response = await llm.invoke([
      new SystemMessage("Return only valid JSON."),
      new HumanMessage(jsonPrompt),
    ]);

    // טיפול במקרה שהתשובה היא מערך של תכנים מורכבים
    let jsonText = "";
    if (typeof response.content === "string") {
      jsonText = response.content;
    } else if (Array.isArray(response.content)) {
      jsonText = response.content.map((part: any) => part?.text ?? "").join("");
    } else {
      throw new Error("Unexpected message format");
    }

    const cleanJson = jsonText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const structuredResume = JSON.parse(cleanJson);

    return NextResponse.json({
      reply: "✅ סיימתי לשפר את הקו״ח. הנה הקובץ שלך!",
      structuredResume,
    });
  } catch (error) {
    console.error("❌ resume chat error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: String(error) },
      { status: 500 }
    );
  }
}
