"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { ProsodyMeter } from "@/app/lib/interview/prosodyClient";
import type { Prosody, VocalImpression } from "@/app/lib/interview/voice";

/**
 * The live voice interview. Browser ↔ OpenAI Realtime over WebRTC using a
 * short-lived client secret from /api/interview/voice. We keep a running
 * transcript (both sides) with per-answer durations and a measured voice
 * profile, push it to the server as we go, and end the call when the
 * interviewer calls the end_interview tool (or the candidate hangs up).
 */
export type VoiceTurn = { role: "interviewer" | "candidate"; content: string; seconds?: number; prosody?: Prosody };

type Props = {
  sessionId: string;
  clientSecret: string;
  model: string;
  endpoint: "calls" | "legacy";
  targetQuestions: number;
  stageTitle: string;
  company: string;
  onEnded: (turns: VoiceTurn[], reason: "interviewer" | "candidate" | "error") => void;
};

type Status = "connecting" | "live" | "ended" | "error";

export default function VoiceInterview({ sessionId, clientSecret, model, endpoint, targetQuestions, stageTitle, company, onEnded }: Props) {
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
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const turnsRef = useRef<VoiceTurn[]>([]);
  const speechStartRef = useRef<number | null>(null);
  const pendingProsodyRef = useRef<Prosody | null>(null);
  const impressionRef = useRef<VocalImpression | null>(null);
  const endedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const pushTurn = useCallback((t: VoiceTurn) => {
    turnsRef.current = [...turnsRef.current, t];
    setTurns(turnsRef.current);
  }, []);

  const sync = useCallback(
    async (wrappedUp = false) => {
      try {
        await fetch("/api/interview/voice", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, turns: turnsRef.current, wrappedUp, impression: impressionRef.current || undefined }),
        });
      } catch {}
    },
    [sessionId]
  );

  const hangUp = useCallback(
    async (reason: "interviewer" | "candidate" | "error") => {
      if (endedRef.current) return;
      endedRef.current = true;
      setStatus(reason === "error" ? "error" : "ended");
      try { dcRef.current?.close(); } catch {}
      try { pcRef.current?.close(); } catch {}
      meterRef.current?.dispose();
      micRef.current?.getTracks().forEach((t) => t.stop());
      camRef.current?.getTracks().forEach((t) => t.stop());
      await sync(reason === "interviewer");
      onEnded(turnsRef.current, reason);
    },
    [onEnded, sync]
  );

  // ---- connect ----
  useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
        if (cancelled) return;
        micRef.current = mic;
        meterRef.current = new ProsodyMeter(mic);
        try {
          const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
          camRef.current = cam;
          if (videoElRef.current) videoElRef.current.srcObject = cam;
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
        if (!res.ok) throw new Error(`Realtime handshake failed (${res.status})`);
        await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.name === "NotAllowedError" ? "צריך לאשר גישה למיקרופון כדי לקיים ראיון קולי." : e?.message || "החיבור נכשל");
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
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, partial]);

  // ---- Realtime events (GA names first, preview names as fallback) ----
  const handleEvent = (ev: any) => {
    const type: string = ev?.type || "";
    switch (type) {
      case "input_audio_buffer.speech_started":
        speechStartRef.current = Date.now();
        meterRef.current?.start();
        setSpeaking("candidate");
        break;
      case "input_audio_buffer.speech_stopped":
        pendingProsodyRef.current = meterRef.current?.stop() ?? null;
        setSpeaking("");
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(ev.transcript || "").trim();
        if (text) {
          const seconds = speechStartRef.current ? Math.max(1, Math.round((Date.now() - speechStartRef.current) / 1000)) : undefined;
          speechStartRef.current = null;
          const prosody = pendingProsodyRef.current ?? meterRef.current?.stop() ?? undefined;
          pendingProsodyRef.current = null;
          pushTurn({ role: "candidate", content: text, seconds, prosody: prosody || undefined });
          if (turnsRef.current.length % 2 === 0) sync();
        }
        break;
      }
      case "output_audio_buffer.started":
      case "response.output_audio.delta":
      case "response.audio.delta":
        setSpeaking("interviewer");
        break;
      case "output_audio_buffer.stopped":
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
        const items: any[] = ev.response?.output || [];
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
        setError(ev.error?.message || "שגיאה בשיחה");
        break;
    }
  };

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

  return (
    <div className="flex flex-col" dir="rtl">
      <audio ref={audioElRef} autoPlay />
      <div className="p-3 border-b border-line flex flex-wrap items-center gap-2 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${status === "live" ? "bg-red-500 animate-pulse" : status === "connecting" ? "bg-sky" : "bg-ink-400"}`} />
        <span className="font-medium text-navy">{status === "connecting" ? "מתחבר…" : status === "live" ? `שיחה חיה · ${mm}:${ss}` : status === "ended" ? "השיחה הסתיימה" : "שגיאה"}</span>
        <span className="jm-chip">שאלה {Math.min(Math.max(asked, 1), targetQuestions)} מתוך {targetQuestions}</span>
        <span className="jm-muted">{stageTitle} · {company}</span>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_260px] gap-0">
        {/* Interviewer presence */}
        <div className="relative bg-navy text-white min-h-[260px] flex flex-col items-center justify-center p-6 gap-4">
          <div className={`h-28 w-28 rounded-full bg-white/10 flex items-center justify-center text-5xl transition-transform ${speaking === "interviewer" ? "scale-110 ring-4 ring-sky/60" : ""}`} aria-hidden>🧑‍💼</div>
          <div className="flex items-end gap-1 h-8" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span key={i} className={`w-1.5 rounded-full bg-sky transition-all duration-150 ${speaking === "interviewer" ? "animate-pulse" : ""}`} style={{ height: speaking === "interviewer" ? `${8 + ((i * 7) % 20)}px` : "4px" }} />
            ))}
          </div>
          <div className="text-sm text-white/80">{speaking === "interviewer" ? "המראיין/ת מדבר/ת…" : speaking === "candidate" ? "שומע/ת אותך…" : status === "live" ? "תורך — דבר/י כשמוכן/ה" : ""}</div>
          {partial && <p className="text-xs text-white/60 max-w-md text-center" dir="auto">{partial}</p>}
        </div>
        {/* Self view */}
        <div className="relative bg-black min-h-[200px]">
          <video ref={videoElRef} autoPlay muted playsInline className={`h-full w-full object-cover ${camOn ? "" : "hidden"}`} style={{ transform: "scaleX(-1)" }} />
          {!camOn && <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">המצלמה כבויה</div>}
          <div className="absolute bottom-2 inset-x-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden"><div className="h-full bg-teal transition-all" style={{ width: `${Math.round(level * 100)}%` }} /></div>
            <span className="text-[10px] text-white/70">{muted ? "מושתק" : "מיקרופון"}</span>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-b border-line flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggleMute} disabled={status !== "live"} className={`jm-btn jm-btn-sm ${muted ? "jm-btn-accent" : "jm-btn-secondary"}`}>{muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} {muted ? "בטל השתקה" : "השתק"}</button>
        <button type="button" onClick={toggleCam} disabled={status !== "live"} className="jm-btn jm-btn-secondary jm-btn-sm">{camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />} מצלמה</button>
        <button type="button" onClick={() => hangUp("candidate")} disabled={status === "ended"} className="jm-btn jm-btn-danger jm-btn-sm ms-auto"><PhoneOff className="h-4 w-4" /> סיים ראיון וקבל משוב</button>
      </div>
      {error && <div className="m-3 jm-alert jm-alert-err">{error}</div>}

      <div ref={transcriptRef} className="jm-scroll overflow-y-auto p-4 space-y-2 max-h-[32vh] min-h-[120px]">
        {turns.length === 0 && <p className="jm-muted">התמלול יופיע כאן תוך כדי השיחה.</p>}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "candidate" ? "justify-end" : "justify-start"}`}>
            <div dir="auto" className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${t.role === "candidate" ? "bg-navy text-white rounded-2xl rounded-ee-sm" : "bg-canvas border border-line rounded-2xl rounded-es-sm"}`}>
              {t.content}
              {t.seconds ? <span className="ms-2 text-[10px] opacity-60">{t.seconds}s</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
