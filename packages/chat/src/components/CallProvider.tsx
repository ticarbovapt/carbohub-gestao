import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Phone, PhoneOff, Mic, MicOff, PhoneIncoming } from "lucide-react";
import { useChatCtx } from "../context";
import { Avatar } from "./Avatar";
import { playRingback, playRing, stopRing, stopRingback, stopAllCallSounds } from "../lib/callSound";

// ── Contrato da engine de mídia (estrutural — NÃO importa @carbo/call). O app
// injeta o loader; assim os apps sem chamada não puxam o livekit-client. ──
export interface CallEngineEvents { onState?: (s: string) => void; onParticipants?: (p: unknown[]) => void; onError?: (e: Error) => void }
export interface CallEngineLike { connect(url: string, token: string): Promise<void>; disconnect(): Promise<void>; setMuted(m: boolean): Promise<void> }
export type CallEngineCtor = new (events?: CallEngineEvents) => CallEngineLike;
export type LoadCallEngine = () => Promise<{ CallEngine: CallEngineCtor }>;

type Phase = "idle" | "outgoing" | "incoming" | "ongoing";
interface Peer { id: string; name: string | null; avatar: string | null }
interface Session { id: string; room: string; channelId: string }

interface CallControls { callsEnabled: boolean; startCall: (channelId: string) => void; busy: boolean }
const CallCtx = createContext<CallControls>({ callsEnabled: false, startCall: () => {}, busy: false });
export function useCallControls() { return useContext(CallCtx); }

const rid = () => Math.random().toString(36).slice(2, 8);
const RING_TIMEOUT_MS = 35_000;

export function CallProvider({ loadCallEngine, children }: { loadCallEngine?: LoadCallEngine; children: ReactNode }) {
  const { supabase, currentUser } = useChatCtx();
  const callsEnabled = !!loadCallEngine;

  const [phase, setPhase] = useState<Phase>("idle");
  const [peer, setPeer] = useState<Peer | null>(null);
  const [muted, setMuted] = useState(false);
  const [ongoingSince, setOngoingSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const engineRef = useRef<CallEngineLike | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const timeoutRef = useRef<number | undefined>(undefined);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const fetchPeer = useCallback(async (id: string): Promise<Peer> => {
    // RPC definer: a RLS de profiles só deixa ver o PRÓPRIO perfil; nome/foto de
    // outro interno vêm por aqui.
    const { data } = await supabase.rpc("chat_user_info", { p_id: id });
    const p = ((data ?? []) as { full_name: string | null; avatar_url: string | null }[])[0];
    return { id, name: p?.full_name ?? null, avatar: p?.avatar_url ?? null };
  }, [supabase]);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) { window.clearTimeout(timeoutRef.current); timeoutRef.current = undefined; }
    stopAllCallSounds();
    engineRef.current?.disconnect().catch(() => {});
    engineRef.current = null;
    sessionRef.current = null;
    setPhase("idle"); setPeer(null); setMuted(false); setOngoingSince(null); setElapsed(0);
  }, []);

  // Pede o token e conecta a mídia (só chamado ao ATENDER / quando vira ongoing).
  const connectMedia = useCallback(async (room: string) => {
    if (!loadCallEngine) throw new Error("chamada indisponível");
    const { data, error } = await supabase.functions.invoke("call-token", { body: { room } });
    if (error) throw error;
    const { url, token } = data as { url: string; token: string };
    const mod = await loadCallEngine();
    const engine = new mod.CallEngine({ onError: () => { toast.error("Erro na chamada"); cleanup(); } });
    engineRef.current = engine;
    await engine.connect(url, token);
  }, [loadCallEngine, supabase, cleanup]);

  const startCall = useCallback(async (channelId: string) => {
    if (!callsEnabled || phaseRef.current !== "idle") return;
    try {
      const { data, error } = await supabase.rpc("call_start", { p_channel: channelId });
      if (error) throw error;
      const s = data as { session_id: string; room: string; callee_id: string };
      sessionRef.current = { id: s.session_id, room: s.room, channelId };
      setPeer(await fetchPeer(s.callee_id));
      setPhase("outgoing");
      playRingback();
      timeoutRef.current = window.setTimeout(() => {
        if (phaseRef.current === "outgoing" && sessionRef.current) {
          supabase.rpc("call_cancel", { p_session: sessionRef.current.id }).then(() => {}, () => {});
          cleanup();
        }
      }, RING_TIMEOUT_MS);
    } catch (e) {
      toast.error((e as Error)?.message || "Não foi possível ligar");
      cleanup();
    }
  }, [callsEnabled, supabase, fetchPeer, cleanup]);

  const accept = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    stopRing();
    try {
      const { error } = await supabase.rpc("call_accept", { p_session: s.id });
      if (error) throw error;
      await connectMedia(s.room);
      setPhase("ongoing"); setOngoingSince(Date.now());
    } catch {
      toast.error("Não foi possível atender");
      supabase.rpc("call_decline", { p_session: s.id }).then(() => {}, () => {});
      cleanup();
    }
  }, [supabase, connectMedia, cleanup]);

  const decline = useCallback(() => {
    const s = sessionRef.current;
    if (s) supabase.rpc("call_decline", { p_session: s.id }).then(() => {}, () => {});
    cleanup();
  }, [supabase, cleanup]);

  const hangup = useCallback(() => {
    const s = sessionRef.current;
    if (s) {
      if (phaseRef.current === "ongoing") supabase.rpc("call_end", { p_session: s.id }).then(() => {}, () => {});
      else supabase.rpc("call_cancel", { p_session: s.id }).then(() => {}, () => {});
    }
    cleanup();
  }, [supabase, cleanup]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    engineRef.current?.setMuted(next).catch(() => {});
    setMuted(next);
  }, [muted]);

  // Timer de tempo decorrido (ongoing).
  useEffect(() => {
    if (phase !== "ongoing" || !ongoingSince) return;
    const iv = window.setInterval(() => setElapsed(Math.floor((Date.now() - ongoingSince) / 1000)), 1000);
    return () => window.clearInterval(iv);
  }, [phase, ongoingSince]);

  // Sinalização em tempo real (call_sessions). RLS entrega só as dos meus canais.
  useEffect(() => {
    if (!callsEnabled || !currentUser.id) return;
    const ch = supabase
      .channel("carbo-call:" + currentUser.id + ":" + rid())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_sessions" }, async (payload) => {
        const row = payload.new as { id: string; channel_id: string; status: string; callee_id: string | null; started_by: string };
        if (row.status !== "ringing" || row.callee_id !== currentUser.id) return;
        if (phaseRef.current !== "idle") { supabase.rpc("call_decline", { p_session: row.id }).then(() => {}, () => {}); return; }
        sessionRef.current = { id: row.id, room: "call_" + row.id, channelId: row.channel_id };
        setPeer(await fetchPeer(row.started_by));
        setPhase("incoming");
        playRing();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "call_sessions" }, async (payload) => {
        const row = payload.new as { id: string; status: string };
        const s = sessionRef.current;
        if (!s || row.id !== s.id) return;
        if (row.status === "ongoing" && phaseRef.current === "outgoing") {
          stopRingback();
          try { await connectMedia(s.room); setPhase("ongoing"); setOngoingSince(Date.now()); }
          catch { toast.error("Falha ao conectar a chamada"); hangup(); }
        } else if (row.status === "ended" || row.status === "declined" || row.status === "missed") {
          if (phaseRef.current === "outgoing" && row.status === "declined") toast("Chamada recusada");
          if (phaseRef.current === "outgoing" && row.status === "missed") toast("Sem resposta");
          cleanup();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callsEnabled, currentUser.id]);

  // Catch-up: ao abrir o app (ex.: veio de um push de chamada), verifica se há
  // uma chamada AINDA tocando pra mim e mostra o modal — o INSERT do Realtime
  // pode ter acontecido antes de eu estar inscrito.
  useEffect(() => {
    if (!callsEnabled || !currentUser.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("call_sessions")
        .select("id, channel_id, started_by, started_at")
        .eq("callee_id", currentUser.id).eq("status", "ringing")
        .gte("started_at", new Date(Date.now() - 40_000).toISOString())
        .order("started_at", { ascending: false }).limit(1);
      const row = (data ?? [])[0] as { id: string; channel_id: string; started_by: string } | undefined;
      if (cancelled || !row || phaseRef.current !== "idle") return;
      sessionRef.current = { id: row.id, room: "call_" + row.id, channelId: row.channel_id };
      setPeer(await fetchPeer(row.started_by));
      setPhase("incoming");
      playRing();
    })();
    return () => { cancelled = true; };
  }, [callsEnabled, currentUser.id, supabase, fetchPeer]);

  // Libera o microfone se a aba fechar no meio da chamada.
  useEffect(() => () => { engineRef.current?.disconnect().catch(() => {}); }, []);

  const ctxValue = useMemo<CallControls>(
    () => ({ callsEnabled, startCall, busy: phase !== "idle" }),
    [callsEnabled, startCall, phase],
  );

  return (
    <CallCtx.Provider value={ctxValue}>
      {children}
      {phase === "incoming" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xs rounded-2xl border bg-background p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 w-fit"><Avatar name={peer?.name} url={peer?.avatar} size={72} /></div>
            <p className="text-base font-semibold">{peer?.name ?? "Alguém"}</p>
            <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <PhoneIncoming className="h-3.5 w-3.5" /> Chamada de voz recebida
            </p>
            <div className="mt-5 flex justify-center gap-6">
              <button onClick={decline} className="flex flex-col items-center gap-1 text-xs">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-destructive-foreground"><PhoneOff className="h-5 w-5" /></span>
                Recusar
              </button>
              <button onClick={accept} className="flex flex-col items-center gap-1 text-xs">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white"><Phone className="h-5 w-5" /></span>
                Aceitar
              </button>
            </div>
          </div>
        </div>
      )}

      {(phase === "outgoing" || phase === "ongoing") && (
        <div className="fixed bottom-4 right-4 z-[60] w-72 rounded-2xl border bg-background p-4 shadow-xl">
          <div className="flex items-center gap-3">
            <Avatar name={peer?.name} url={peer?.avatar} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{peer?.name ?? "Chamada"}</p>
              <p className="text-xs text-muted-foreground">
                {phase === "outgoing" ? "Chamando…" : formatElapsed(elapsed)}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-center gap-4">
            {phase === "ongoing" && (
              <button onClick={toggleMute} title={muted ? "Desmutar" : "Mutar"}
                className={`flex h-11 w-11 items-center justify-center rounded-full border ${muted ? "bg-muted text-destructive" : "hover:bg-muted"}`}>
                {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            )}
            <button onClick={hangup} title="Desligar"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </CallCtx.Provider>
  );
}

function formatElapsed(s: number) {
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}
