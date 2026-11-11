"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { ProsodyMeter } from "@/app/lib/interview/prosodyClient";
import { FaceMeter } from "@/app/lib/interview/faceClient";
import type { Prosody, Presence, VocalImpression } from "@/app/lib/interview/voice";
import { useT } from "@/app/lib/i18n/LanguageProvider";

/**
 * The live voice interview. Browser ↔ OpenAI Realtime over WebRTC using a
 * short-lived client secret from /api/interview/voice. We keep a running
 * transcript (both sides) with per-answer durations and a measured voice
 * profile, push it to the server as we go, and end the call when the
 * interviewer calls the end_interview tool (or the candidate hangs up).
 */
export type VoiceTurn = { role: "interviewer" | "candidate"; content: string; seconds?: number; prosody?: Prosody; presence?: Presence };

type Props = {
  sessionId: string;
  clientSecret: string;
  model: string;
  endpoint: "calls" | "legacy";
  targetQuestions: number;
  stageTitle: string;
  company: string;
  interviewer?: { name: string; gender: "female" | "male" };
  /** Seconds a single answer may run before the interviewer cuts in (from the server, per stage). */
  longAnswerSec?: number;
  /** The whole call's budget in seconds; the browser closes the call shortly after it runs out. */
  timeLimitSec?: number;
  onEnded: (turns: VoiceTurn[], reason: "interviewer" | "candidate" | "error") => void;
};

/** If the candidate says nothing for this long after a question, the interviewer checks in. */
const CHECK_IN_MS = 12_000;

type Status = "connecting" | "live" | "ended" | "error";

/** The Realtime server events this component reads (GA and preview names; everything else is ignored). */
type RealtimeItem = { type?: string; name?: string; call_id?: string; arguments?: string };
type RealtimeEvent = { type?: string; transcript?: string; delta?: string; response?: { output?: RealtimeItem[] }; error?: { message?: string } };

export default function VoiceInterview({ sessionId, clientSecret, model, endpoint, targetQuestions, stageTitle, company, interviewer, longAnswerSec = 90, timeLimitSec = 15 * 60, onEnded }: Props) {
  const { t, dir } = useT();
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [partial, setPartial] = useState("");
  const [speaking, setSpeaking] = useState<"" | "interviewer" | "candidate">("");
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const camRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<ProsodyMeter | null>(null);
  const faceRef = useRef<FaceMeter | null>(null);
  const [faceOn, setFaceOn] = useState(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const turnsRef = useRef<VoiceTurn[]>([]);
  const speechStartRef = useRef<number | null>(null);
  const pendingProsodyRef = useRef<Prosody | null>(null);
  const impressionRef = useRef<VocalImpression | null>(null);
  const endedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  // Clock on the current answer: past the stage's limit the interviewer is told to cut in (once per answer).
  const longAnswerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSteerRef = useRef<string>("");
  // Reviewed questions the server classified as follow-ups / clarifications: they do not count against the budget (one answer behind).
  const followUpsRef = useRef(0);
  // The clock on the whole call and the question budget: the model is reminded, then told to close, then cut off.
  const closingRef = useRef(false);
  const warnedRef = useRef(false);
  const dcSend = (msg: object) => {
    try {
      dcRef.current?.send(JSON.stringify(msg));
    } catch {}
  };
  const systemNote = (text: string) => dcSend({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text }] } });
  const askToClose = (why: string) => {
    if (closingRef.current || endedRef.current) return;
    closingRef.current = true;
    dcSend({ type: "response.create", response: { instructions: `${why} Close the interview NOW: one or two sentences (thank them, say what happens next), no new question, then call the end_interview tool.` } });
  };
  /** After every answer: how far along the interview is and what was already covered, so nothing is asked twice. */
  const progressNote = () => {
    const qs = turnsRef.current.filter((t) => t.role === "interviewer").slice(1); // the opening is not a question
    const askedN = Math.max(0, qs.length - followUpsRef.current); // follow-ups and clarifications are not main questions
    const covered = qs.map((q, i) => `${i + 1}. ${q.content.replace(/\s+/g, " ").slice(0, 120)}`).join("\n");
    const left = Math.max(0, targetQuestions - askedN);
    if (askedN >= targetQuestions) {
      askToClose(`PROGRESS: you have asked all ${targetQuestions} main questions and the last answer is in.`);
      return;
    }
    systemNote(`PROGRESS (private, never mention): main questions asked so far: ${askedN} of ${targetQuestions}; ${left} left.${covered ? ` Already covered — do not return to these subjects:\n${covered}` : ""}\nYour next question must be on a NEW subject${left === 1 ? ", and it is your last one: after its answer, close and call end_interview" : ""}.`);
  };
  const armLongAnswer = () => {
    if (longAnswerRef.current) clearTimeout(longAnswerRef.current);
    longAnswerRef.current = setTimeout(() => {
      if (endedRef.current) return;
      try {
        dcRef.current?.send(JSON.stringify({ type: "response.create", response: { instructions: `The candidate has now been answering for over ${longAnswerSec} seconds. Cut in politely at this breath, in one short sentence: thank them, say you want to cover a few more things, summarise what you got in half a sentence, and ask your next question. Do not apologise at length.` } }));
      } catch {}
    }, longAnswerSec * 1000);
  };
  const disarmLongAnswer = () => {
    if (longAnswerRef.current) clearTimeout(longAnswerRef.current);
    longAnswerRef.current = null;
  };
  const checkInRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkInsRef = useRef(0);

  // After the interviewer stops talking, give the candidate CHECK_IN_MS; if
  // nothing is heard, ask the model to check in / rephrase (max twice per call).
  const armCheckIn = () => {
    if (checkInRef.current) clearTimeout(checkInRef.current);
    checkInRef.current = setTimeout(() => {
      if (endedRef.current || checkInsRef.current >= 2) return;
      checkInsRef.current++;
      try {
        dcRef.current?.send(JSON.stringify({ type: "response.create", response: { instructions: "The candidate has been silent for a while after your last question. Gently check in in one short sentence — offer to repeat or rephrase the question, or to move on. Do not ask a new question yet." } }));
      } catch {}
    }, CHECK_IN_MS);
  };
  const disarmCheckIn = () => {
    if (checkInRef.current) clearTimeout(checkInRef.current);
    checkInRef.current = null;
  };

  const pushTurn = useCallback((t: VoiceTurn) => {
    turnsRef.current = [...turnsRef.current, t];
    setTurns(turnsRef.current);
  }, []);

  const sync = useCallback(
    async (wrappedUp = false) => {
      try {
        const r = await fetch("/api/interview/voice", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, turns: turnsRef.current, wrappedUp, impression: impressionRef.current || undefined }),
        });
        // Adaptive difficulty: the server's read of the answers so far becomes a private note in the conversation.
        const d = await r.json().catch(() => ({}));
        if (typeof d?.followUps === "number") followUpsRef.current = d.followUps;
        const steer = d?.steer?.kind ? `${d.steer.kind}:${turnsRef.current.length}` : "";
        if (!wrappedUp && d?.steer?.note && steer !== lastSteerRef.current && !endedRef.current) {
          lastSteerRef.current = steer;
          try {
            dcRef.current?.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: `(Private note from the hiring committee, never mention it: ${d.steer.note})` }] } }));
          } catch {}
        }
      } catch {}
    },
    [sessionId]
  );


  const hangUp = useCallback(
    async (reason: "interviewer" | "candidate" | "error") => {
      if (endedRef.current) return;
      endedRef.current = true;
      setStatus(reason === "error" ? "error" : "ended");
      disarmCheckIn();
      disarmLongAnswer();
      try { dcRef.current?.close(); } catch {}
      try { pcRef.current?.close(); } catch {}
      meterRef.current?.dispose();
      faceRef.current?.dispose();
      micRef.current?.getTracks().forEach((t) => t.stop());
      camRef.current?.getTracks().forEach((t) => t.stop());
      await sync(reason === "interviewer");
      onEnded(turnsRef.current, reason);
    },
    [onEnded, sync]
  );

  // ---- Realtime events (GA names first, preview names as fallback) ----
  const handleEvent = (ev: RealtimeEvent) => {
    const type: string = ev?.type || "";
    switch (type) {
      case "input_audio_buffer.speech_started":
        disarmCheckIn();
        if (!speechStartRef.current) armLongAnswer(); // the clock runs from the first word of the answer, across its pauses
        speechStartRef.current = speechStartRef.current || Date.now();
        meterRef.current?.start();
        faceRef.current?.start();
        setSpeaking("candidate");
        break;
      case "input_audio_buffer.speech_stopped":
        pendingProsodyRef.current = meterRef.current?.stop() ?? null;
        setSpeaking("");
        // The server does not auto-respond (create_response:false): post the progress note, then ask for the interviewer's turn.
        progressNote();
        if (!closingRef.current && !endedRef.current) dcSend({ type: "response.create" });
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(ev.transcript || "").trim();
        if (text) {
          const seconds = speechStartRef.current ? Math.max(1, Math.round((Date.now() - speechStartRef.current) / 1000)) : undefined;
          speechStartRef.current = null;
          disarmLongAnswer();
          const prosody = pendingProsodyRef.current ?? meterRef.current?.stop() ?? undefined;
          pendingProsodyRef.current = null;
          const presence = faceRef.current?.stop() ?? undefined;
          pushTurn({ role: "candidate", content: text, seconds, prosody: prosody || undefined, presence: presence || undefined });
          sync(); // every answer → the server reviews it while the interview goes on
        }
        break;
      }
      case "output_audio_buffer.started":
      case "response.output_audio.delta":
      case "response.audio.delta":
        setSpeaking("interviewer");
        break;
      case "output_audio_buffer.stopped":
        setSpeaking("");
        armCheckIn();
        break;
      case "output_audio_buffer.cleared":
        setSpeaking("");
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        setPartial((p) => p + String(ev.delta || ""));
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const text = String(ev.transcript || "").trim();
        setPartial("");
        if (text) pushTurn({ role: "interviewer", content: text });
        break;
      }
      case "response.done": {
        const items = ev.response?.output || [];
        const call = items.find((i) => i.type === "function_call" && i.name === "end_interview");
        if (call) {
          try {
            const args = JSON.parse(call.arguments || "{}");
            if (args?.vocal_impression) impressionRef.current = args.vocal_impression;
          } catch {}
          // Acknowledge the tool, then give the closing audio a moment to finish before hanging up.
          try {
            dcRef.current?.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ok: true }) } }));
          } catch {}
          setTimeout(() => hangUp("interviewer"), 2500);
        }
        break;
      }
      case "error":
        console.warn("[realtime] error", ev.error);
        setError(ev.error?.message || t("interview.voice.error"));
        break;
    }
  };

  // ---- connect ----
  useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      try {
        // Gain control on: a quiet laptop mic was the main reason answers came back half-transcribed.
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        if (cancelled) return;
        micRef.current = mic;
        meterRef.current = new ProsodyMeter(mic);
        try {
          const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
          camRef.current = cam;
          if (videoElRef.current) {
            videoElRef.current.srcObject = cam;
            // Face analysis runs on the device only (eye contact, expression, stillness); it never uploads a frame.
            const fm = new FaceMeter(videoElRef.current);
            faceRef.current = fm;
            fm.init().then((ok) => setFaceOn(ok)).catch(() => setFaceOn(false));
          }
        } catch {
          setCamOn(false); // no camera is fine — it's only a self-view
        }
        const levelTick = () => {
          if (endedRef.current) return;
          setLevel(meterRef.current?.level ?? 0);
          requestAnimationFrame(levelTick);
        };
        levelTick();

        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        pc.ontrack = (e) => {
          if (audioElRef.current) audioElRef.current.srcObject = e.streams[0];
        };
        mic.getAudioTracks().forEach((t) => pc.addTrack(t, mic));

        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        dc.onmessage = (ev) => handleEvent(JSON.parse(ev.data));
        dc.onopen = () => {
          setStatus("live");
          dc.send(JSON.stringify({ type: "response.create" })); // the interviewer opens the call
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const url = endpoint === "calls" ? `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}` : `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
        const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" }, body: offer.sdp });
        if (!res.ok) throw new Error(t("interview.voice.handshakeFailed", { status: res.status }));
        await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      } catch (e: unknown) {
        if (cancelled) return;
        const err = e as { name?: string; message?: string } | null;
        setError(err?.name === "NotAllowedError" ? t("interview.voice.micDenied") : err?.message || t("interview.voice.connectFailed"));
        hangUp("error");
      }
    };
    connect();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "live") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);
  // The clock: a two-minute warning, "time is up" at the limit, and a hard hang-up a minute later if the model never closed.
  useEffect(() => {
    if (status !== "live" || endedRef.current) return;
    if (!warnedRef.current && elapsed >= timeLimitSec - 120) {
      warnedRef.current = true;
      systemNote("TIME (private): about two minutes left. At most one more short question, then close and call end_interview.");
    }
    if (elapsed === timeLimitSec) askToClose("TIME IS UP.");
    if (elapsed >= timeLimitSec + 60) hangUp("interviewer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, status, timeLimitSec]);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, partial]);


  const toggleMute = () => {
    const next = !muted;
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };
  const toggleCam = () => {
    const next = !camOn;
    camRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  };

  const asked = turns.filter((t) => t.role === "interviewer").length;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const left = Math.max(0, timeLimitSec - elapsed);
  const leftLabel = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col" dir={dir}>
      <audio ref={audioElRef} autoPlay />
      <div className="p-3 border-b border-line flex flex-wrap items-center gap-2 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${status === "live" ? "bg-red-500 animate-pulse" : status === "connecting" ? "bg-sky" : "bg-ink-400"}`} />
        <span className="font-medium text-navy">{status === "connecting" ? t("interview.voice.connecting") : status === "live" ? t("interview.voice.live", { time: `${mm}:${ss}` }) : status === "ended" ? t("interview.voice.ended") : t("interview.voice.errorShort")}</span>
        <span className="jm-chip">{t("interview.questionOf", { a: Math.min(Math.max(asked - 1, 1), targetQuestions), b: targetQuestions })}</span>
        {status === "live" && <span className={`jm-chip ${left <= 120 ? "bg-red-50 text-red-700 border-red-200" : ""}`} dir="ltr" title={t("interview.voice.timeLimit")}>⏱ {leftLabel}</span>}
        <span className="jm-muted">{interviewer ? `${interviewer.name} · ` : ""}{stageTitle} · {company}</span>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_260px] gap-0">
        {/* Interviewer presence */}
        <div className="relative bg-navy text-white min-h-[260px] flex flex-col items-center justify-center p-6 gap-4">
          <div className={`h-28 w-28 rounded-full bg-white/10 flex items-center justify-center text-5xl transition-transform ${speaking === "interviewer" ? "scale-110 ring-4 ring-sky/60" : ""}`} aria-hidden>{interviewer?.gender === "female" ? "👩‍💼" : "👨‍💼"}</div>
          {interviewer && <div className="font-semibold">{interviewer.name}</div>}
          <div className="flex items-end gap-1 h-8" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span key={i} className={`w-1.5 rounded-full bg-sky transition-all duration-150 ${speaking === "interviewer" ? "animate-pulse" : ""}`} style={{ height: speaking === "interviewer" ? `${8 + ((i * 7) % 20)}px` : "4px" }} />
            ))}
          </div>
          <div className="text-sm text-white/80">{speaking === "interviewer" ? t("interview.voice.speaking") : speaking === "candidate" ? t("interview.voice.listening") : status === "live" ? t("interview.voice.yourTurn") : ""}</div>
          {partial && <p className="text-xs text-white/60 max-w-md text-center" dir="auto">{partial}</p>}
        </div>
        {/* Self view */}
        <div className="relative bg-black min-h-[200px]">
          <video ref={videoElRef} autoPlay muted playsInline className={`h-full w-full object-cover ${camOn ? "" : "hidden"}`} style={{ transform: "scaleX(-1)" }} />
          {!camOn && <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">{t("interview.voice.camOff")}</div>}
          <div className="absolute bottom-2 inset-x-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden"><div className="h-full bg-teal transition-all" style={{ width: `${Math.round(level * 100)}%` }} /></div>
            <span className="text-[10px] text-white/70">{muted ? t("interview.voice.muted") : t("interview.voice.mic")}</span>
            {camOn && faceOn && <span className="text-[10px] text-white/70" title={t("interview.voice.faceHint")}>· {t("interview.voice.faceOn")}</span>}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-b border-line flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggleMute} disabled={status !== "live"} className={`jm-btn jm-btn-sm ${muted ? "jm-btn-accent" : "jm-btn-secondary"}`}>{muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} {muted ? t("interview.voice.unmute") : t("interview.voice.mute")}</button>
        <button type="button" onClick={toggleCam} disabled={status !== "live"} className="jm-btn jm-btn-secondary jm-btn-sm">{camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />} {t("interview.voice.camera")}</button>
        <button type="button" onClick={() => hangUp("candidate")} disabled={status === "ended"} className="jm-btn jm-btn-danger jm-btn-sm ms-auto"><PhoneOff className="h-4 w-4" /> {t("interview.finishAndFeedback")}</button>
      </div>
      {error && <div className="m-3 jm-alert jm-alert-err">{error}</div>}

      <div ref={transcriptRef} className="jm-scroll overflow-y-auto p-4 space-y-2 max-h-[32vh] min-h-[120px]">
        {turns.length === 0 && <p className="jm-muted">{t("interview.voice.transcriptHint")}</p>}
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === "candidate" ? "justify-end" : "justify-start"}`}>
            <div dir="auto" className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${turn.role === "candidate" ? "bg-navy text-white rounded-2xl rounded-ee-sm" : "bg-canvas border border-line rounded-2xl rounded-es-sm"}`}>
              {turn.content}
              {turn.seconds ? <span className="ms-2 text-[10px] opacity-60">{turn.seconds}s</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
