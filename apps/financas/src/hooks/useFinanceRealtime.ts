import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Som amigável (três toques) via Web Audio — sem asset. Destravado no 1º gesto.
let audioCtx: AudioContext | null = null;
function playDing() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx!.state === "suspended") audioCtx!.resume();
    const now = audioCtx!.currentTime;
    // Ganho mestre alto pra ser audível mesmo com o volume do SO no meio.
    const master = audioCtx!.createGain();
    master.gain.value = 0.9;
    master.connect(audioCtx!.destination);
    // Arpejo ascendente (dó-mi-sol) — presente sem ser estridente.
    [659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = audioCtx!.createOscillator(), g = audioCtx!.createGain();
      // triangle soa mais "cheio"/alto que sine no mesmo ganho.
      o.type = "triangle"; o.frequency.value = f;
      o.connect(g); g.connect(master);
      const t = now + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.start(t); o.stop(t + 0.42);
    });
  } catch { /* som é bônus */ }
}

// Tempo real do Financeiro: mantém badges/KPIs ao vivo e dispara toast + som +
// sininho quando chega uma notificação nova (sem precisar dar F5).
export function useFinanceRealtime() {
  const qc = useQueryClient();
  const { user } = useAuth();

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
          playDing();
          toast(n?.title ?? "Nova notificação", { description: n?.body ?? undefined });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, user?.id]);
}
