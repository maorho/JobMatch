import { buildInterviewerPrompt, END_MARK, type SimInput, type SessionTurn } from "./simulator";

/**
 * Voice interviews: the same interviewer persona and company brief as the
 * text simulator, delivered as a real-time speech conversation (OpenAI
 * Realtime API over WebRTC). The server only mints a short-lived client
 * secret; audio flows browser ↔ OpenAI directly. The browser sends us the
 * transcript as it goes — each answer with its duration and a prosody
 * profile (pitch, loudness, pauses) measured from the microphone — and the
 * interviewer model, which actually heard the candidate, reports its vocal
 * impression when it ends the call. The debrief uses both.
 */
export const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";
export const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "";
export const END_TOOL = "end_interview";
/** Seconds of silence after which the interviewer reacts (follow-up or next question). */
export const SILENCE_MS = 2500;

/** A believable interviewer per call: the voice decides the name's gender. */
export const VOICES: { voice: string; gender: "female" | "male"; names: string[] }[] = [
  { voice: "marin", gender: "female", names: ["דנה", "נועה", "מיכל", "שירה", "יעל", "רותם"] },
  { voice: "cedar", gender: "male", names: ["יואב", "עומר", "אלון", "רון", "אורי", "איתי"] },
];
export function pickVoice(seed?: number): { voice: string; gender: "female" | "male"; name: string } {
  const r = seed ?? Math.random();
  const forced = REALTIME_VOICE ? VOICES.find((v) => v.voice === REALTIME_VOICE) : undefined;
  const v = forced || VOICES[Math.floor(r * VOICES.length) % VOICES.length];
  return { voice: v.voice, gender: v.gender, name: v.names[Math.floor((r * 1000) % v.names.length)] };
}

export function buildVoiceInstructions(input: SimInput): string {
  const base = buildInterviewerPrompt(input).replace(`and append the exact token ${END_MARK} at the very end of that message.`, `and then call the ${END_TOOL} tool.`);
  return `${base}

THIS IS A LIVE VOICE CALL, not text:
- Talk like a person on a call: short sentences, natural pauses, no lists, no markdown, no headings. One question per turn, then stop and wait — never answer for the candidate.
- LANGUAGE: open in Hebrew. Right after introducing yourself, ask whether they prefer to do the interview in Hebrew or English, and continue in whatever they choose (if they just start talking in a language, follow it). Technical terms stay in English either way.
- PAUSES: you get the floor whenever the candidate is silent for about ${Math.round(SILENCE_MS / 1000)} seconds. If their answer sounded unfinished or thin, ask a short follow-up that helps them continue ("ומה יצא מזה?", "תן/י לי דוגמה"); if it was complete, acknowledge briefly and move to the next question. Never leave a silence hanging. If they stay silent after a question, check in once ("קח/י את הזמן — או שאשאל אחרת?") and offer to rephrase.
- When they ask you something, answer it (briefly, honestly) and then wait for their reaction instead of jumping to your next question.
- If you can't hear or understand something, say so briefly and ask them to repeat.
- Keep each of your turns under 25 seconds of speech.
- Listen to HOW they speak as well as what they say (confidence, energy, clarity, pace, hesitation) — you will report it at the end, never during the call.
- When the interview is over: say your closing (1–2 sentences), then call the ${END_TOOL} tool with your honest vocal impression. Do not call it before the closing is spoken.`;
}

/** The tool the model calls once it has said goodbye — carrying what it heard in the candidate's voice. */
export const END_TOOL_DEF = {
  type: "function",
  name: END_TOOL,
  description: "Call this right after your closing words, when the interview is over. Include your impression of the candidate's voice and delivery as you heard it.",
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string", description: "why it ended: all questions asked / candidate asked to stop" },
      vocal_impression: {
        type: "object",
        description: "How the candidate sounded, 1 (weak) to 5 (strong), judged from the audio, not the words.",
        properties: {
          confidence: { type: "integer", minimum: 1, maximum: 5 },
          energy: { type: "integer", minimum: 1, maximum: 5 },
          clarity: { type: "integer", minimum: 1, maximum: 5 },
          pace: { type: "string", enum: ["too slow", "good", "too fast", "uneven"] },
          warmth: { type: "integer", minimum: 1, maximum: 5 },
          notes: { type: "string", description: "2–3 specific observations: tone, hesitation, trailing off, monotone, nervous laughter, etc." },
        },
        required: ["confidence", "energy", "clarity", "pace", "warmth", "notes"],
      },
    },
    required: ["vocal_impression"],
  },
};

export type ClientSecret = { value: string; expiresAt: number; model: string; voice: string; endpoint: "calls" | "legacy" };

/**
 * Mint an ephemeral key for the browser. Tries the GA endpoint
 * (/v1/realtime/client_secrets) and falls back to the preview one
 * (/v1/realtime/sessions) so either API generation works.
 */
export async function createRealtimeClientSecret(opts: { instructions: string; language: "he" | "en"; model?: string; voice?: string; fetchImpl?: typeof fetch }): Promise<ClientSecret> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const f = opts.fetchImpl || fetch;
  const model = opts.model || REALTIME_MODEL;
  const voice = opts.voice || pickVoice().voice;
  // No fixed language: the candidate picks Hebrew or English on the call.
  const transcription = { model: "gpt-4o-mini-transcribe" };

  const ga = await f("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 1800 },
      session: {
        type: "realtime",
        model,
        instructions: opts.instructions,
        tools: [END_TOOL_DEF],
        tool_choice: "auto",
        audio: {
          // Server VAD with a fixed silence window: the interviewer reacts after
          // SILENCE_MS of quiet (follow-up or next question), never sooner.
          input: { transcription, turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: SILENCE_MS, create_response: true, interrupt_response: true } },
          output: { voice },
        },
      },
    }),
  });
  if (ga.ok) {
    const d: any = await ga.json();
    return { value: d.value, expiresAt: Number(d.expires_at) || 0, model, voice, endpoint: "calls" };
  }
  const gaErr = await ga.text().catch(() => "");

  const legacyModel = model.startsWith("gpt-realtime") ? "gpt-4o-mini-realtime-preview" : model;
  const legacy = await f("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: legacyModel, voice: ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"].includes(voice) ? voice : "ash", instructions: opts.instructions, tools: [END_TOOL_DEF], tool_choice: "auto", input_audio_transcription: { model: "whisper-1" }, turn_detection: { type: "server_vad", silence_duration_ms: SILENCE_MS } }),
  });
  if (!legacy.ok) throw new Error(`Realtime session failed: ${ga.status} ${gaErr.slice(0, 200)} / ${legacy.status} ${(await legacy.text().catch(() => "")).slice(0, 200)}`);
  const d: any = await legacy.json();
  return { value: d.client_secret?.value, expiresAt: Number(d.client_secret?.expires_at) || 0, model: legacyModel, voice, endpoint: "legacy" };
}

// ---------------------------------------------------------------------------
// Delivery + tone metrics (what the debrief can say about HOW the candidate spoke)
// ---------------------------------------------------------------------------

/** Measured in the browser for one spoken answer (see lib/interview/prosodyClient.ts). */
export type Prosody = {
  /** Median fundamental frequency (Hz) over voiced frames. */
  pitchMedianHz: number;
  /** Pitch variability in semitones (std dev); < 1.5 reads as monotone, > 4 as very expressive. */
  pitchVarSemitones: number;
  /** Mean loudness in dBFS and its variability. */
  loudnessDb: number;
  loudnessVarDb: number;
  /** Fraction of the answer that was silence (0–1). */
  pauseRatio: number;
  /** Loudness at the end minus at the start (dB): negative = trailing off. */
  endTrendDb: number;
  voicedFrames: number;
};

export type VocalImpression = { confidence: number; energy: number; clarity: number; pace: string; warmth: number; notes: string };

export type VoiceTurn = SessionTurn & { seconds?: number; prosody?: Prosody };

export type ToneSummary = {
  pitchVarSemitones: number | null;
  expressiveness: "monotone" | "flat" | "natural" | "expressive" | null;
  loudnessDb: number | null;
  volume: "quiet" | "normal" | "loud" | null;
  pauseRatio: number | null;
  trailingOffAnswers: number;
  measuredAnswers: number;
};

export type DeliveryMetrics = {
  answers: number;
  totalSpeakingSeconds: number;
  avgAnswerSeconds: number;
  longestAnswerSeconds: number;
  wordsPerMinute: number | null;
  fillerWords: number;
  fillersPerMinute: number | null;
  shortAnswers: number; // under 8 words
  tone: ToneSummary;
  impression?: VocalImpression;
};

const FILLERS_HE = ["אממ", "אמ", "אה", "אהה", "כאילו", "יעני", "בעצם", "נו", "אוקיי אז", "זאת אומרת"];
const FILLERS_EN = ["um", "uh", "erm", "like", "you know", "basically", "actually", "sort of", "kind of"];
const fillerRe = new RegExp(`(^|[\\s,.!?])(${[...FILLERS_HE, ...FILLERS_EN].map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=[\\s,.!?]|$)`, "gi");

export function countFillers(text: string): number {
  return (text.match(fillerRe) || []).length;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarizeTone(turns: VoiceTurn[]): ToneSummary {
  const p = turns.filter((t) => t.role === "candidate" && t.prosody && t.prosody.voicedFrames >= 10).map((t) => t.prosody!);
  const pitchVar = avg(p.map((x) => x.pitchVarSemitones));
  const loud = avg(p.map((x) => x.loudnessDb));
  const pause = avg(p.map((x) => x.pauseRatio));
  return {
    pitchVarSemitones: pitchVar === null ? null : Math.round(pitchVar * 10) / 10,
    expressiveness: pitchVar === null ? null : pitchVar < 1.5 ? "monotone" : pitchVar < 2.5 ? "flat" : pitchVar < 4.5 ? "natural" : "expressive",
    loudnessDb: loud === null ? null : Math.round(loud),
    volume: loud === null ? null : loud < -35 ? "quiet" : loud > -12 ? "loud" : "normal",
    pauseRatio: pause === null ? null : Math.round(pause * 100) / 100,
    trailingOffAnswers: p.filter((x) => x.endTrendDb < -6).length,
    measuredAnswers: p.length,
  };
}

export function computeDelivery(turns: VoiceTurn[], impression?: VocalImpression): DeliveryMetrics {
  const answers = turns.filter((t) => t.role === "candidate");
  const words = answers.reduce((n, t) => n + t.content.split(/\s+/).filter(Boolean).length, 0);
  const seconds = answers.reduce((n, t) => n + (t.seconds || 0), 0);
  const fillerWords = answers.reduce((n, t) => n + countFillers(t.content), 0);
  const minutes = seconds / 60;
  return {
    answers: answers.length,
    totalSpeakingSeconds: Math.round(seconds),
    avgAnswerSeconds: answers.length ? Math.round(seconds / answers.length) : 0,
    longestAnswerSeconds: Math.round(Math.max(0, ...answers.map((t) => t.seconds || 0))),
    wordsPerMinute: minutes > 0.25 ? Math.round(words / minutes) : null,
    fillerWords,
    fillersPerMinute: minutes > 0.25 ? Math.round((fillerWords / minutes) * 10) / 10 : null,
    shortAnswers: answers.filter((t) => t.content.split(/\s+/).filter(Boolean).length < 8).length,
    tone: summarizeTone(turns),
    ...(impression ? { impression } : {}),
  };
}

/** A paragraph for the feedback prompt: the numbers plus what the interviewer heard. */
export function describeDelivery(m: DeliveryMetrics, language: "he" | "en"): string {
  const parts = [
    `${m.answers} spoken answers, ${m.totalSpeakingSeconds}s total speaking time, average ${m.avgAnswerSeconds}s per answer (longest ${m.longestAnswerSeconds}s)`,
    m.wordsPerMinute !== null ? `pace ≈ ${m.wordsPerMinute} words/min (${language === "he" ? "Hebrew" : "English"}; comfortable conversational pace is ~110–160)` : "",
    `${m.fillerWords} filler words${m.fillersPerMinute !== null ? ` (${m.fillersPerMinute}/min)` : ""}`,
    m.shortAnswers ? `${m.shortAnswers} very short answers (< 8 words)` : "",
  ].filter(Boolean);
  const t = m.tone;
  if (t.measuredAnswers > 0) {
    parts.push(
      `voice tone measured on ${t.measuredAnswers} answers: pitch variability ${t.pitchVarSemitones} semitones (${t.expressiveness}), volume ${t.loudnessDb} dBFS (${t.volume}), ${Math.round((t.pauseRatio || 0) * 100)}% of answer time was pauses${t.trailingOffAnswers ? `, ${t.trailingOffAnswers} answer(s) trailed off at the end` : ""}`
    );
  }
  if (m.impression) {
    const i = m.impression;
    parts.push(`the interviewer's own impression of the voice (1–5): confidence ${i.confidence}, energy ${i.energy}, clarity ${i.clarity}, warmth ${i.warmth}, pace "${i.pace}" — "${i.notes}"`);
  }
  return parts.join("; ");
}
