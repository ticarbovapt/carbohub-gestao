// Store externo mínimo pra presença/typing — alimentado pelo ChatAlerts (dono do
// canal Realtime) e lido pelo header, lista e conversa via useSyncExternalStore.
// Fica fora do React pra não re-renderizar a árvore a cada tecla/heartbeat.
import { useSyncExternalStore } from "react";

export interface TypingUser { userId: string; name: string }

const TYPING_TTL = 6000; // ms sem novo "typing" → some sozinho

const onlineIds = new Set<string>();
const typingByChannel = new Map<string, Map<string, { name: string; exp: number }>>();
let sendTypingImpl: ((channelId: string, on: boolean) => void) | null = null;

let version = 0;
const listeners = new Set<() => void>();
function bump() { version++; listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

// ── escrita (ChatAlerts) ──────────────────────────────────────────────────────
export const presenceBus = {
  setOnline(ids: Iterable<string>) {
    onlineIds.clear();
    for (const id of ids) onlineIds.add(id);
    bump();
  },
  setTyping(channelId: string, userId: string, name: string, on: boolean) {
    let m = typingByChannel.get(channelId);
    if (on) {
      if (!m) { m = new Map(); typingByChannel.set(channelId, m); }
      m.set(userId, { name, exp: Date.now() + TYPING_TTL });
    } else if (m) {
      m.delete(userId);
      if (m.size === 0) typingByChannel.delete(channelId);
    }
    bump();
  },
  prune() {
    const now = Date.now();
    let changed = false;
    for (const [ch, m] of typingByChannel) {
      for (const [uid, v] of m) if (v.exp <= now) { m.delete(uid); changed = true; }
      if (m.size === 0) typingByChannel.delete(ch);
    }
    if (changed) bump();
  },
  registerSendTyping(fn: ((channelId: string, on: boolean) => void) | null) { sendTypingImpl = fn; },
};

export function sendTyping(channelId: string, on: boolean) { sendTypingImpl?.(channelId, on); }

// ── leitura (hooks) ───────────────────────────────────────────────────────────
export function useIsOnline(userId: string | null | undefined): boolean {
  return useSyncExternalStore(subscribe, () => (userId ? onlineIds.has(userId) : false));
}

// Cache por canal pra devolver a MESMA referência enquanto a versão não muda
// (useSyncExternalStore exige snapshot estável).
const typingCache = new Map<string, { version: number; value: TypingUser[] }>();
const EMPTY: TypingUser[] = [];

export function useTyping(channelId: string | null | undefined, excludeUserId?: string): TypingUser[] {
  return useSyncExternalStore(subscribe, () => {
    if (!channelId) return EMPTY;
    const cached = typingCache.get(channelId);
    if (cached && cached.version === version) return cached.value;
    const m = typingByChannel.get(channelId);
    const now = Date.now();
    const arr: TypingUser[] = m
      ? [...m.entries()]
          .filter(([uid, v]) => v.exp > now && uid !== excludeUserId)
          .map(([uid, v]) => ({ userId: uid, name: v.name }))
      : EMPTY;
    const value = arr.length ? arr : EMPTY;
    typingCache.set(channelId, { version, value });
    return value;
  });
}
