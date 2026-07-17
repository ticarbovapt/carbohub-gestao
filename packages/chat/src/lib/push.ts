// Web Push no cliente: pede permissão, cria a subscription no service worker do
// app e salva no banco (RPC chat_save_push_subscription). Sem libs — usa as APIs
// nativas (Notification / PushManager / ServiceWorker).
import type { SupabaseClient } from "@supabase/supabase-js";

// Chave pública VAPID: cada app injeta via env (Vite). Igual nos 4 apps.
const VAPID_PUBLIC_KEY = (import.meta as unknown as { env?: Record<string, string> }).env
  ?.VITE_VAPID_PUBLIC_KEY ?? "";

export function isPushSupported(): boolean {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

// iOS só entrega push quando o app está instalado na tela de início (standalone).
export function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}
export function isIOS(): boolean {
  const ua = window.navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && "ontouchend" in window);
}

export type PushState = "unsupported" | "unconfigured" | "denied" | "default" | "granted";

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") return "default";
  return "granted";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function keyToB64(sub: PushSubscription, name: "p256dh" | "auth"): string {
  const buf = sub.getKey(name);
  if (!buf) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

// Pede permissão (se preciso), cria/reaproveita a subscription e salva no banco.
// Deve ser chamada a partir de um gesto do usuário (clique) — exigência do iOS.
export async function enablePush(supabase: SupabaseClient): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";

  const perm = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "default";

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await supabase.rpc("chat_save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: keyToB64(sub, "p256dh"),
    p_auth: keyToB64(sub, "auth"),
    p_origin: window.location.origin,
    p_device: navigator.userAgent.slice(0, 180),
  });

  return "granted";
}

export async function disablePush(supabase: SupabaseClient): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc("chat_delete_push_subscription", { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => {});
}
