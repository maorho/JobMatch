"use client";

import { DEFAULT_LANG, LANGS, translate, type Key, type Lang } from "../i18n/dict";

/** Browser side of Web Push: permission, subscription with the VAPID key, and the API calls. */
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Not a React module, so the interface language is read from what the provider stored (<html lang>, else the saved choice). */
function currentLang(): Lang {
  try {
    const fromDoc = document.documentElement.getAttribute("data-lang") || document.documentElement.lang;
    if (fromDoc && (LANGS as string[]).includes(fromDoc)) return fromDoc as Lang;
    const stored = localStorage.getItem("jm:lang");
    if (stored && (LANGS as string[]).includes(stored)) return stored as Lang;
  } catch {}
  return DEFAULT_LANG;
}
const msg = (key: Key) => translate(currentLang(), key);

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState = { supported: boolean; permission: NotificationPermission | "unsupported"; subscribed: boolean; configured: boolean };

export async function readPushState(): Promise<PushState> {
  if (!pushSupported()) return { supported: false, permission: "unsupported", subscribed: false, configured: false };
  const reg = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  const server = await fetch("/api/push/subscribe", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return { supported: true, permission: Notification.permission, subscribed: !!sub && !!server?.devices, configured: !!server?.configured && !!server?.publicKey };
}

/** Ask, subscribe, register with the server. Returns the final state; throws with a readable message. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) throw new Error(msg("pages.push.unsupported"));
  const server = await fetch("/api/push/subscribe", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
  if (!server?.configured || !server?.publicKey) throw new Error(msg("pages.push.notConfigured"));
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? msg("pages.push.denied") : msg("pages.push.notGranted"));
  const reg = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(server.publicKey) as BufferSource }));
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  if (!res.ok) throw new Error(msg("pages.push.registerFailed"));
  return readPushState();
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (sub) {
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return readPushState();
}
