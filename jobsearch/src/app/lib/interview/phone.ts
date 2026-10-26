/**
 * Phone interviews: the interviewer calls the candidate's phone. Twilio
 * places the call and streams the audio (Media Streams, g711 µ-law) to our
 * bridge on the Puppeteer/apply server, which relays it to OpenAI Realtime
 * with the same interviewer instructions as a web voice session. Env-gated:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (E.164),
 *   PHONE_BRIDGE_WSS_URL (public wss:// of the bridge, e.g. wss://apply.jobmatch.co.il)
 */
export function phoneConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && process.env.PHONE_BRIDGE_WSS_URL);
}

/** Israeli numbers in local form → E.164 (+972…); already-international numbers pass through. */
export function toE164(raw: string, defaultCountry = "+972"): string | null {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length >= 9) return `${defaultCountry}${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
}

/** The TwiML Twilio executes when the candidate picks up: a short greeting, then stream the call to the bridge. */
export function callTwiml(opts: { streamUrl: string; sessionId: string; greeting?: string }): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const greeting = opts.greeting || "Connecting you to your JobMatch interview.";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="en-US">${esc(greeting)}</Say>
  <Connect>
    <Stream url="${esc(opts.streamUrl)}">
      <Parameter name="sessionId" value="${esc(opts.sessionId)}" />
    </Stream>
  </Connect>
</Response>`;
}

export type PlacedCall = { sid: string; status: string };

/** Place the outbound call through Twilio's REST API (no SDK). */
export async function placeCall(opts: { to: string; sessionId: string; fetchImpl?: typeof fetch }): Promise<PlacedCall> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM!;
  const streamUrl = `${process.env.PHONE_BRIDGE_WSS_URL!.replace(/\/$/, "")}/phone/stream/${opts.sessionId}`;
  const body = new URLSearchParams({ To: opts.to, From: from, Twiml: callTwiml({ streamUrl, sessionId: opts.sessionId }), Timeout: "25" });
  const res = await (opts.fetchImpl || fetch)(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio call failed: ${res.status} ${data?.message || ""}`);
  return { sid: data.sid, status: data.status };
}

/** Hang up a call (used when the interviewer ends the interview). */
export async function endCall(callSid: string, fetchImpl?: typeof fetch): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  await (fetchImpl || fetch)(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ Status: "completed" }),
  }).catch(() => null);
}
