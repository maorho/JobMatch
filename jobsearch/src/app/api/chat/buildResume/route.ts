import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

type Role = "user" | "assistant" | "system";

interface ChatMessage {
  role: Role;
  content: string;
}

const BUILD_JSON_PROMPT = `
You are an expert English resume writer specializing in ATS-optimized resumes
for software engineers and tech roles.

Your job:

1. Take the original resume text ("raw_resume_text") and the conversation
   with the candidate ("chat_context").
2. Extract all relevant information: experience, projects, education,
   skills, tools, certifications.
3. Rewrite and restructure everything as a clean, professional, ATS-optimized
   resume in English ONLY.

Output format:

Return ONLY valid JSON with this shape:

{
  "header": {
    "name": "Full Name",
    "title": "Professional Title",
    "contact": [
      "email: ...",
      "phone: ...",
      "location: ...",
      "LinkedIn: ...",
      "GitHub: ..."
    ]
  },
  "summary": "2–4 lines professional summary, focused on impact and value.",
  "skills": ["Skill1", "Skill2", "Skill3", "..."],
  "experience": [
    {
      "company": "Company Name",
      "role": "Role / Position",
      "period": "YYYY–YYYY or YYYY–Present",
      "bullets": [
        "Achievement-oriented bullet 1",
        "Achievement-oriented bullet 2",
        "Achievement-oriented bullet 3"
      ]
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": [
        "What the project does",
        "Technologies used",
        "Impact / result (if any)"
      ]
    }
  ],
  "education": [
    {
      "school": "University / School name",
      "degree": "BSc in Computer Science ...",
      "period": "YYYY–YYYY"
    }
  ],
  "certifications": ["Certification 1", "Certification 2"],
  "tools": ["React", "Node.js", "MongoDB", "TypeScript", "..."]
}

Rules:

- All content MUST be in English.
- Do NOT invent fake experience. You may infer reasonable, generic bullet phrasing
  based on the user's real experience.
- Use strong action verbs (Designed, Led, Implemented, Optimized, Built, Reduced, Increased...).
- Focus on measurable impact where possible (%, time saved, performance improvements).
- Ensure the JSON is strictly valid, no comments, no trailing commas.
- Do NOT wrap the JSON in markdown code fences.
`;

export async function POST(req: NextRequest) {
  try {
    const {
      rawResumeText,
      messages,
    }: { rawResumeText: string; messages: ChatMessage[] } = await req.json();

    const llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const chatContext = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n")
      .slice(0, 8000);

    const prompt = `
raw_resume_text:
"""${(rawResumeText || "").slice(0, 8000)}"""

chat_context:
"""${chatContext}"""
`.trim();

    const response = await llm.invoke([
      new SystemMessage(BUILD_JSON_PROMPT),
      new HumanMessage(prompt),
    ]);

    let jsonText: string;
    if (typeof response.content === "string") {
      jsonText = response.content;
    } else if (Array.isArray(response.content)) {
      jsonText = response.content.map((p: any) => p?.text ?? "").join("");
    } else {
      throw new Error("Unexpected response format from LLM");
    }

    const cleanJson = jsonText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const structuredResume = JSON.parse(cleanJson);

    return NextResponse.json({ structuredResume });
  } catch (err: unknown) {
    console.error("❌ buildResume error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: (err as Error).message },
      { status: 500 }
    );
  }
}
