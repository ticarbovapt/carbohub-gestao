import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Som amigável (dois toques) via Web Audio — sem asset. Destravado no 1º gesto.
let audioCtx: AudioContext | null = null;
function playDing() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx!.state === "suspended") audioCtx!.resume();
    const now = audioCtx!.currentTime;
    [880, 1174.66].forEach((f, i) => {
      const o = audioCtx!.createOscillator(), g = audioCtx!.createGain();
      o.type = "sine"; o.frequency.value = f;
      o.connect(g); g.connect(audioCtx!.destination);
      const t = now + i * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.start(t); o.stop(t + 0.3);
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
