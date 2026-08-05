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
// ⚠️ O som da venda mora num lugar só: src/lib/sfxVenda.ts.
//
// Existia aqui um `playCoin()` sintetizado (cascata de tinidos via Web Audio)
// disparado na notificação `ecommerce_sale` — era ELE que se ouvia, não o MP3
// de caixa registradora, o que fez parecer que o arquivo instalado estava
// errado. Removido.
//
// O aviso de venda (som + toast) é do useEcommerceNotifications, que escuta
// esta mesma tabela `notifications` e é montado no mesmo Layout. Aqui o
// `ecommerce_sale` só atualiza o sininho — o invalidateQueries lá em cima já
// faz isso para qualquer tipo.
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

// Tempo real do Financeiro: mantém badges/KPIs ao vivo e dispara toast + som +
// sininho quando chega uma notificação nova (sem precisar dar F5).
export function useFinanceRealtime() {
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
    const inval = () => {
      qc.invalidateQueries({ queryKey: ["purchasing-badges"] });
      qc.invalidateQueries({ queryKey: ["purchasing-kpis"] });
    };
    const ch = supabase
      .channel("finance-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_requests" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_payables" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "receivables" }, inval)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel("finance-notif-" + user.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const n = payload.new;
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
          // Financeiro (RC/OC) toca ding + toast. Venda online é do
          // useEcommerceNotifications. Bug e demais notificações são só
          // sininho (bell), sem barulho.
          if (n?.type === "finance_rc_pendente" || n?.type === "finance_oc_nova") { playDing(); toast(n?.title ?? "Financeiro", { description: n?.body ?? undefined }); }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, user?.id]);
}
