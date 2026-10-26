import { NextRequest, NextResponse } from "next/server";
import { consumeQuota, quotaResponse } from "@/app/lib/ops/quota";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import User from "@/app/models/User";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { connectToDatabase } from "@/app/lib/db";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { announceResumeUpdate } from "@/app/lib/agents/triggers";
import { structuredToText } from "@/app/lib/resume/structuredToText";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Daily cap on this paid action (lib/ops/quota.ts); 429 with a hint when spent.
    try {
      await consumeQuota(userId, "resume_build");
    } catch (e) {
      const q = quotaResponse(e);
      if (q) return q;
      throw e;
    }
    const { messages, rawResumeText } = await req.json();
    await connectToDatabase();

    const user = userId ? await User.findById(userId).lean() : null;

    const convoSummary = (messages || [])
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) =>
        `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
      )
      .join("\n");

    const memory = {
      skills: Array.isArray(user?.memory?.skills) ? user.memory.skills : [],
      experience: Array.isArray(user?.memory?.experience) ? user.memory.experience : [],
      preferences:
        user?.memory?.preferences && typeof user.memory.preferences === "object"
          ? user.memory.preferences
          : {}
    };


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

Return ONLY the following JSON structure (sections in this order; omit a section only when there is truly nothing for it):

{
  "structuredResume": [
    {
      "heading": "Header",
      "items": [
        {
          "title": "Full Name",
          "subtitle": "",
          "location": "",
          "contact": ["054-1234567", "name@email.com", "linkedin.com/in/handle", "github.com/handle"],
          "summary": "2–3 sentences: profession, strongest stack, years/experience type, what you build. No fluff, no first person.",
          "bullets": []
        }
      ]
    },
    {
      "heading": "Experience",
      "items": [
        {
          "title": "Job Title",
          "subtitle": "Company",
          "location": "",
          "dateRange": "2024 – Present",
          "bullets": [
            "Verb-first bullet with impact and 1–3 **bold** technologies or metrics, e.g. Built the **React (TypeScript)** frontend on **Next.js**, cutting page load by **40%**.",
            "2–4 bullets per role, each one line or two, no duplicates"
          ]
        }
      ]
    },
    {
      "heading": "Education",
      "items": [
        { "title": "B.Sc. Computer Science", "subtitle": "University", "location": "", "dateRange": "2019 – 2023", "bullets": [] }
      ]
    },
    {
      "heading": "Projects",
      "items": [
        { "title": "Project Name", "subtitle": "", "dateRange": "", "bullets": ["What it does and the **stack**; your role; a measurable outcome"] }
      ]
    },
    {
      "heading": "Military Service",
      "items": [
        { "title": "Role", "subtitle": "Unit", "dateRange": "2013 – 2017", "bullets": ["Leadership/scale bullets — only if the person served"] }
      ]
    },
    {
      "heading": "Skills",
      "items": [
        { "title": "Languages & Frameworks", "bullets": ["TypeScript", "React", "Node.js"] },
        { "title": "Data & Cloud", "bullets": ["MongoDB", "AWS", "Vercel"] }
      ]
    },
    {
      "heading": "Languages",
      "items": [
        { "title": "", "bullets": ["Hebrew – Native", "English – Proficient"] }
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
- NEVER invent employers, titles, dates, degrees, companies, numbers or links. If something is unknown, omit the field or the whole item — a short, true résumé beats a padded one. No placeholders like "[Your Name]" or "City, Country".
- Contact entries are plain values (no "Email:"/"Phone:" prefixes), max 4, in this order: phone, email, LinkedIn, GitHub/portfolio.
- Bullets: start with a strong past/present-tense verb, state what + how + impact, mark 1–3 key technologies/metrics per bullet with **double asterisks**, ≤ 2 lines each, 2–4 per role. Never start a bullet with "Responsible for".
- Experience newest first. "Present" for current roles. Date format "2021 – 2023" (en dash).
- Projects: only real projects from the input; the strongest 1–2, with stack and ownership.
- Keep it to ONE page for < 8 years of experience: trim weak bullets before dropping sections.
- Skills: group into 2–4 titled groups, 4–8 items each, only skills evidenced by the résumé or the conversation.
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

    const text =
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

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Tolerate a prose preamble/suffix around the JSON object.
      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      if (start === -1 || end <= start) {
        throw new Error("Model did not return valid JSON");
      }
      parsed = JSON.parse(clean.slice(start, end + 1));
    }

    if (!parsed || !Array.isArray(parsed.structuredResume)) {
      return NextResponse.json(
        { error: "Model returned an unexpected shape" },
        { status: 502 }
      );
    }

    // Persist the result and feed the Matcher, so the personalized feed, the
    // match scores and the "tailor to this job" agent all see this résumé.
    const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 20) : [];
    const score = Number.isFinite(Number(parsed.score)) ? Number(parsed.score) : undefined;
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          resumeStructured: parsed.structuredResume,
          resumeScore: score,
          resumeIssues: issues,
          resumeUpdatedAt: new Date(),
        },
      }
    );
    let matchReady = false;
    try {
      // The uploaded text is the richest source; otherwise embed the built résumé.
      const text = (rawResumeText || "").trim() || structuredToText(parsed.structuredResume);
      matchReady = !!(await embedAndStoreResume(userId, text));
      if (matchReady) announceResumeUpdate(userId);
    } catch (e) {
      console.warn("[buildResume] embedding skipped:", (e as Error)?.message);
    }

    return NextResponse.json({
      structuredResume: parsed.structuredResume,
      score: parsed.score,
      issues: parsed.issues,
      matchReady,
    });
  } catch (err: any) {
    console.error("❌ buildResume error:", err);
    return NextResponse.json(
      { error: "Failed to build resume", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
