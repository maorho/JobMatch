import type { Server as HttpServer, IncomingMessage } from "http";
import WebSocket, { WebSocketServer } from "ws";

/**
 * Phone bridge: Twilio Media Streams ⇄ OpenAI Realtime.
 *
 * Twilio connects a WebSocket per call to /phone/stream/<sessionId> and sends
 * 8 kHz µ-law audio frames; we open a Realtime WebSocket with the session's
 * interviewer instructions (fetched from the Next app with the service
 * token), forward audio both ways, keep the transcript, and PATCH it back to
 * the app as the call goes. When the interviewer calls `end_interview` we
 * report the vocal impression, mark the session wrapped up, and hang up.
 */
type Turn = { role: "interviewer" | "candidate"; content: string; seconds?: number };

const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const SERVICE_TOKEN = process.env.CRON_SECRET || "";
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";

async function appFetch(path: string, init: RequestInit = {}) {
  return fetch(`${APP_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", "x-service-token": SERVICE_TOKEN, ...(init.headers || {}) } });
}

export function attachPhoneBridge(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url || "/", "http://x");
    const m = /^\/phone\/stream\/([a-f0-9]{24})$/.exec(url.pathname);
    if (!m) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => handleCall(ws, m[1]).catch((e) => console.error("[phone] call failed:", e?.message)));
  });
  console.log("📞 phone bridge ready at /phone/stream/:sessionId");
}

async function handleCall(twilio: WebSocket, sessionId: string) {
  // 1) What should the interviewer know? (instructions compiled by the app)
  const cfg = await appFetch(`/api/interview/phone?id=${sessionId}`).then((r) => (r.ok ? r.json() : null));
  if (!cfg?.instructions) {
    console.warn("[phone] no session config for", sessionId);
    return twilio.close();
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return twilio.close();

  // 2) Realtime session (µ-law in and out so no transcoding is needed)
  const oai = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(cfg.model || REALTIME_MODEL)}`, { headers: { Authorization: `Bearer ${apiKey}`, "OpenAI-Beta": "realtime=v1" } });
  let streamSid = "";
  const turns: Turn[] = [];
  let speechStart = 0;
  let impression: unknown = null;
  let ended = false;
  const send = (ws: WebSocket, msg: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));
  const sync = (wrappedUp = false) => appFetch("/api/interview/voice", { method: "PATCH", body: JSON.stringify({ sessionId, turns, wrappedUp, impression: impression || undefined }) }).catch(() => null);

  const hangUp = async () => {
    if (ended) return;
    ended = true;
    await sync(true);
    try { oai.close(); } catch {}
    try { twilio.close(); } catch {}
    if (cfg.callSid) await appFetch(`/api/interview/phone`, { method: "DELETE", body: JSON.stringify({ sessionId }) }).catch(() => null);
  };

  oai.on("open", () => {
    send(oai, {
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        instructions: cfg.instructions,
        voice: cfg.voice || "cedar",
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
        turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: cfg.silenceMs || 2500, create_response: true },
        tools: cfg.tools || [],
        tool_choice: "auto",
      },
    });
    send(oai, { type: "response.create" }); // the interviewer opens the call
  });

  oai.on("message", (raw) => {
    let ev: any;
    try { ev = JSON.parse(String(raw)); } catch { return; }
    switch (ev.type) {
      case "response.audio.delta":
      case "response.output_audio.delta":
        if (streamSid) send(twilio, { event: "media", streamSid, media: { payload: ev.delta } });
        break;
      case "input_audio_buffer.speech_started":
        speechStart = Date.now();
        // Barge-in: stop playing the interviewer's audio on the phone.
        if (streamSid) send(twilio, { event: "clear", streamSid });
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(ev.transcript || "").trim();
        if (text) {
          turns.push({ role: "candidate", content: text, seconds: speechStart ? Math.max(1, Math.round((Date.now() - speechStart) / 1000)) : undefined });
          speechStart = 0;
          sync();
        }
        break;
      }
      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done": {
        const text = String(ev.transcript || "").trim();
        if (text) turns.push({ role: "interviewer", content: text });
        break;
      }
      case "response.done": {
        const call = (ev.response?.output || []).find((o: any) => o.type === "function_call" && o.name === "end_interview");
        if (call) {
          try { impression = JSON.parse(call.arguments || "{}").vocal_impression || null; } catch {}
          send(oai, { type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ok: true }) } });
          setTimeout(hangUp, 3000); // let the goodbye finish playing
        }
        break;
      }
      case "error":
        console.warn("[phone] realtime error:", ev.error?.message);
        break;
    }
  });
  oai.on("close", () => hangUp());
  oai.on("error", (e) => console.warn("[phone] realtime socket error:", e?.message));

  // 3) Twilio side
  twilio.on("message", (raw) => {
    let ev: any;
    try { ev = JSON.parse(String(raw)); } catch { return; }
    switch (ev.event) {
      case "start":
        streamSid = ev.start?.streamSid || "";
        break;
      case "media":
        send(oai, { type: "input_audio_buffer.append", audio: ev.media?.payload });
        break;
      case "stop":
        hangUp();
        break;
    }
  });
  twilio.on("close", () => hangUp());
  twilio.on("error", () => hangUp());
}
