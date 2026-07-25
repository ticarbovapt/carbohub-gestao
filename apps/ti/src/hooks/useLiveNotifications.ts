import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Sons via Web Audio (sem asset). O navegador só libera áudio depois de um
// gesto do usuário, então destravamos o contexto no 1º clique/tecla da página.
let audioCtx: AudioContext | null = null;
function ensureCtx(): AudioContext | null {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}
function newMaster(ctx: AudioContext): GainNode {
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  return master;
}

// Um tinido metálico curto de moeda: parcial inarmônica (2.76x) dá o "clink".
function coinPing(ctx: AudioContext, master: GainNode, t: number, base: number, peak: number) {
  [1, 2.76].forEach((mult, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = i === 0 ? "square" : "triangle";
    o.frequency.value = base * mult;
    o.connect(g); g.connect(master);
    const p = i === 0 ? peak : peak * 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.start(t); o.stop(t + 0.15);
  });
}
// Moedas caindo no cofre (vibe de venda/caixa): cascata de tinidos subindo.
function playCoin() {
  const ctx = ensureCtx();
  if (!ctx || ctx.state !== "running") return;
  const master = newMaster(ctx);
  const now = ctx.currentTime;
  // Pentatônica alegre, com repiques, pra soar como moedas tilintando.
  const notes = [1318.51, 1567.98, 1760.0, 2093.0, 1567.98, 1975.53, 2093.0, 2637.02];
  notes.forEach((f, i) => {
    const jitter = (i % 3) * 0.011;         // leve desalinho = cascata natural
    coinPing(ctx, master, now + i * 0.055 + jitter, f, 0.5);
  });
}

// Ding amigável pras demais notificações (não-venda).
function playDing() {
  const ctx = ensureCtx();
  if (!ctx || ctx.state !== "running") return;
  const master = newMaster(ctx);
  let t = ctx.currentTime;
  for (const [f, dur] of [[659.25, 0.4], [783.99, 0.4], [1046.5, 0.42]] as Array<[number, number]>) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = f;
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
    t += dur * 0.7;
  }
}

// Ouve notificações novas ao vivo: toast + som + atualiza o sininho, sem F5.
export function useLiveNotifications() {
  const qc = useQueryClient();
  const { user } = useAuth();

  // Destrava o áudio no primeiro gesto (clique/tecla/toque) em qualquer lugar.
  useEffect(() => {
    const unlock = () => ensureCtx();
    const opts: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel("live-notif-" + user.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const n = payload.new;
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
          // Só venda (moedinha) e financeiro (RC/OC, ding) tocam som + toast.
          // Bug e demais notificações são só sininho (bell), sem barulho.
          if (n?.type === "ecommerce_sale") { playCoin(); toast(n?.title ?? "Nova venda", { description: n?.body ?? undefined }); }
          else if (n?.type === "finance_rc_pendente" || n?.type === "finance_oc_nova") { playDing(); toast(n?.title ?? "Financeiro", { description: n?.body ?? undefined }); }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, user?.id]);
}
