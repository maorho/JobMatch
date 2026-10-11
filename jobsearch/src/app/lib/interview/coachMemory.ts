import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import InterviewSession from "@/app/models/InterviewSession";
import { extractJson } from "@/app/lib/resume/tailor";

/**
 * The coach's memory of a candidate across mock interviews: scores and
 * delivery metrics over time, and the recurring themes in the feedback.
 * Rebuilt after every finished interview, stored on the user, and fed to
 * the interviewer ("probe what they struggled with last time") and to the
 * debrief ("last time 190 wpm with 12 fillers; today 140 and 4").
 */
export type SessionPoint = {
  sessionId: string;
  at: string;
  stage: string;
  mode: "chat" | "voice";
  score: number;
  deliveryScore?: number;
  wordsPerMinute?: number | null;
  fillersPerMinute?: number | null;
  avgAnswerSeconds?: number;
  expressiveness?: string | null;
  company: string;
};
export type CoachMemory = {
  updatedAt: string;
  sessions: number;
  points: SessionPoint[]; // oldest → newest, last 12
  trend: { scoreDelta: number | null; fillersDelta: number | null; paceDelta: number | null };
  themes: { theme: string; count: number; status: "improving" | "persistent" | "new" }[];
  summary: string; // one paragraph for prompts
};

const themeSchema = z.object({ themes: z.array(z.object({ theme: z.string(), count: z.number().int().min(1), status: z.enum(["improving", "persistent", "new"]) })).max(6) });

const toPoint = (s: any): SessionPoint => ({
  sessionId: String(s._id),
  at: new Date(s.finishedAt || s.createdAt).toISOString(),
  stage: s.stage,
  mode: s.mode || "chat",
  score: Number(s.feedback?.overallScore ?? 0),
  deliveryScore: s.feedback?.delivery?.score,
  wordsPerMinute: s.delivery?.wordsPerMinute ?? null,
  fillersPerMinute: s.delivery?.fillersPerMinute ?? null,
  avgAnswerSeconds: s.delivery?.avgAnswerSeconds,
  expressiveness: s.delivery?.tone?.expressiveness ?? null,
  company: s.company || "",
});

const delta = (pts: SessionPoint[], key: keyof SessionPoint): number | null => {
  const vals = pts.map((p) => p[key]).filter((v): v is number => typeof v === "number");
  if (vals.length < 2) return null;
  const half = Math.max(1, Math.floor(vals.length / 2));
  const first = vals.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const last = vals.slice(-half).reduce((a, b) => a + b, 0) / half;
  return Math.round((last - first) * 10) / 10;
};

/** Theme extraction over the last feedbacks (LLM; deterministic fallback = raw improvement lines). */
async function extractThemes(feedbacks: { at: string; improvements: string[]; strengths: string[] }[], useLLM: boolean): Promise<CoachMemory["themes"]> {
  const all = feedbacks.flatMap((f) => f.improvements);
  if (!all.length) return [];
  if (!useLLM || feedbacks.length < 2) {
    const counts = new Map<string, number>();
    for (const line of all) counts.set(line.slice(0, 80), (counts.get(line.slice(0, 80)) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([theme, count]) => ({ theme, count, status: count > 1 ? "persistent" : "new" }));
  }
  const system = `You cluster interview-feedback "improvements" from the same candidate across several mock interviews (oldest first) into 3–6 recurring themes. For each theme: a short label in the same language as the input, how many interviews it appeared in, and a status: "persistent" (still appears in the latest interview), "improving" (appeared earlier, not in the latest), "new" (only in the latest). Return STRICT JSON: {"themes":[{"theme","count","status"}]}.`;
  const user = feedbacks.map((f, i) => `INTERVIEW ${i + 1} (${f.at.slice(0, 10)}):\n- improvements: ${f.improvements.join(" | ")}\n- strengths: ${f.strengths.join(" | ")}`).join("\n\n");
  try {
    const res = await new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0, maxTokens: 600, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } }).invoke([new SystemMessage(system), new HumanMessage(user)]);
    const text = typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join("");
    const parsed = themeSchema.safeParse(extractJson(text));
    if (parsed.success) return parsed.data.themes;
  } catch (e) {
    console.warn("[coachMemory] theme extraction skipped:", (e as Error)?.message);
  }
  return extractThemes(feedbacks, false);
}

export function memoryToText(m: CoachMemory | null | undefined): string {
  if (!m || !m.sessions) return "";
  const last = m.points.at(-1);
  const bits = [
    `${m.sessions} previous mock interview${m.sessions === 1 ? "" : "s"}; latest score ${last?.score}/100 (${last?.stage}${last?.company ? ` @ ${last.company}` : ""})`,
    m.trend.scoreDelta !== null ? `score trend ${m.trend.scoreDelta > 0 ? "+" : ""}${m.trend.scoreDelta}` : "",
    m.trend.fillersDelta !== null ? `filler words/min trend ${m.trend.fillersDelta > 0 ? "+" : ""}${m.trend.fillersDelta}` : "",
    m.trend.paceDelta !== null ? `pace trend ${m.trend.paceDelta > 0 ? "+" : ""}${m.trend.paceDelta} wpm` : "",
    m.themes.length ? `recurring themes: ${m.themes.map((t) => `${t.theme} (${t.status}, ${t.count}×)`).join("; ")}` : "",
  ].filter(Boolean);
  return bits.join(". ");
}

/** Rebuild and store the memory for a user. */
export async function rebuildCoachMemory(userId: string, opts: { useLLM?: boolean } = {}): Promise<CoachMemory> {
  await connectToDatabase();
  const sessions: any[] = await InterviewSession.find({ userId, status: "finished", feedback: { $exists: true } }).sort({ finishedAt: 1, createdAt: 1 }).limit(12).select("stage mode company feedback delivery finishedAt createdAt").lean();
  const points = sessions.map(toPoint);
  const useLLM = opts.useLLM ?? !!(process.env.OPENAI_API_KEY && process.env.NODE_ENV !== "test");
  const themes = await extractThemes(sessions.map((s) => ({ at: new Date(s.finishedAt || s.createdAt).toISOString(), improvements: (s.feedback?.improvements || []).slice(0, 6), strengths: (s.feedback?.strengths || []).slice(0, 4) })), useLLM);
  const memory: CoachMemory = {
    updatedAt: new Date().toISOString(),
    sessions: points.length,
    points,
    trend: { scoreDelta: delta(points, "score"), fillersDelta: delta(points, "fillersPerMinute"), paceDelta: delta(points, "wordsPerMinute") },
    themes,
    summary: "",
  };
  memory.summary = memoryToText(memory);
  await User.updateOne({ _id: userId }, { $set: { coachMemory: memory } });
  return memory;
}

export async function loadCoachMemory(userId: string): Promise<CoachMemory | null> {
  await connectToDatabase();
  const u: any = await User.findById(userId).select("coachMemory").lean();
  return u?.coachMemory || null;
}
