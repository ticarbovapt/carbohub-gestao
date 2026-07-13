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
function play(seq: Array<[number, number]>, type: OscillatorType, peak: number) {
  const ctx = ensureCtx();
  if (!ctx || ctx.state !== "running") return;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  let t = ctx.currentTime;
  for (const [f, dur] of seq) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
    t += dur * 0.7;
  }
}
// Moedinha (vibe de venda): "ca-ching" — toque curto agudo + repique.
function playCoin() { play([[987.77, 0.09], [1318.51, 0.5]], "square", 0.5); }
// Ding amigável pras demais notificações.
function playDing() { play([[659.25, 0.4], [783.99, 0.4], [1046.5, 0.42]], "triangle", 0.5); }

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
          if (n?.type === "ecommerce_sale") playCoin(); else playDing();
          toast(n?.title ?? "Nova notificação", { description: n?.body ?? undefined });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, user?.id]);
}
