import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import mongoose from "mongoose";
import User from "@/app/models/User";

export async function POST(req: NextRequest) {
  try {
    const { userId, messages, rawResumeText } = await req.json();

    if (mongoose.connection.readyState === 0) {
      if (!process.env.MONGO_URI) {
        console.error("❌ MONGODB_URI is not defined");
      } else {
        await mongoose.connect(process.env.MONGO_URI);
      }
    }

    const user = userId ? await User.findById(userId).lean() : null;

    const convoSummary = (messages || [])
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) =>
        `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
      )
      .join("\n");

    const memory = user?.memory || {};

    const systemPrompt = `
You are a world-class resume writer and ATS optimization expert.
Your output MUST be STRICT JSON and nothing else. No markdown, no text outside JSON.

============================================================
AUTO-SUMMARY RULE (CRITICAL)
============================================================
You MUST ALWAYS produce a strong 2–4 line professional summary.

HOW TO GENERATE IT:
1. If parsed raw resume text is available → extract the summary from it.
   - Identify profession, strongest skills, years of experience, main achievements, and technical areas.
   - Rewrite into a clean, modern ATS-optimized summary.

2. If no resume text exists → generate the summary based on:
   - User profile fields (name, current job, skills from memory)
   - Conversation hints

3. If both resume text AND profile exist → ALWAYS use resume text as the primary source.

4. The summary MUST appear inside the Header section under the key "summary".

Example location in JSON:
{
  "heading": "Header",
  "items": [
    {
      "title": "Full Name",
      "subtitle": "Target Role",
      "location": "",
      "contact": [...],
      "summary": "A strong, 2–4 sentence ATS-friendly professional summary.",
      "bullets": []
    }
  ]
}

Never omit the summary.
Never leave it empty.
Never return placeholder summaries.

============================================================
INPUT SOURCES
============================================================

1. User profile:
   - Full name: ${user?.fullname || ""}
   - Email: ${user?.email || ""}
   - Current job: ${user?.currentJob || ""}

2. Long-term memory:
   - Skills: ${(memory.skills || []).join(", ")}
   - Experience hints: ${(memory.experience || []).join(" | ")}
   - Preferences: ${JSON.stringify(memory.preferences || {})}

3. Parsed raw resume text (if any):
"""
${(rawResumeText || "").slice(0, 5000)}
"""

4. Conversation summary:
"""
${convoSummary.slice(0, 5000)}
"""

============================================================
OUTPUT FORMAT (STRICT)
============================================================

Return ONLY the following JSON structure:

{
  "structuredResume": [
    {
      "heading": "Header",
      "items": [
        {
          "title": "Full Name",
          "subtitle": "Job Title or Target Role",
          "location": "City, Country (optional)",
          "contact": ["Email:email@example.com", "Phone: 123456789", "LinkedIn:  ..."],
          "summary": "Auto-generated or resume-extracted summary",
          "bullets": []
        }
      ]
    },
    {
      "heading": "Experience",
      "items": [
        {
          "title": "Job Title",
          "subtitle": "Company Name",
          "location": "",
          "dateRange": "2021 - Present",
          "bullets": [
            "Achievement-focused bullet with measurable impact",
            "Another optimized bullet"
          ]
        }
      ]
    },
    {
      "heading": "Education",
      "items": [
        {
          "title": "Degree",
          "subtitle": "University",
          "location": "",
          "dateRange": "2018 - 2021",
          "bullets": []
        }
      ]
    },
    {
      "heading": "Skills",
      "items": [
        {
          "title": "Technical Skills",
          "bullets": ["React", "Node.js", "MongoDB", "SQL"]
        }
      ]
    },
    {
      "heading": "Languages",
      "items": [
        {
          "title": "Language",
          "bullets": []
        }
      ]
    }
  ],
  "score": 0-100,
  "issues": [
    "Short improvement insight",
    "Another issue"
  ]
}

============================================================
RULES
============================================================
- Output MUST be valid JSON. No markdown, no commentary.
- All resume content MUST be in ENGLISH.
- If information is missing → infer realistic placeholders.
- Use strong active verbs, ATS-friendly structure, and clean formatting.
- Absolutely DO NOT include any extra keys beyond: structuredResume, score, issues.
`.trim();



    const llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.2,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage("Generate the JSON now."),
    ]);

    let text =
      typeof response.content === "string"
        ? response.content
        : (response.content as any[])
            .map((p) => p?.text ?? "")
            .join("");

    const clean = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(clean);
    
    return NextResponse.json({
      structuredResume: parsed.structuredResume,
      score: parsed.score,
      issues: parsed.issues,
    });
  } catch (err: any) {
    console.error("❌ buildResume error:", err);
    return NextResponse.json(
      { error: "Failed to build resume", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
