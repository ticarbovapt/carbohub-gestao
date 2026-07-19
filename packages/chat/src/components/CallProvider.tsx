import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, PhoneOff, Mic, MicOff, PhoneIncoming, Users } from "lucide-react";
import { useChatCtx } from "../context";
import { useActiveGroupCall } from "../hooks";
import { Avatar } from "./Avatar";
import { playRingback, playRing, stopRing, stopRingback, stopAllCallSounds } from "../lib/callSound";

// ── Contrato da engine de mídia (estrutural — NÃO importa @carbo/call). O app
// injeta o loader; assim os apps sem chamada não puxam o livekit-client. ──
export interface CallEngineParticipant { identity: string; isLocal: boolean; isSpeaking: boolean; muted: boolean }
export interface CallEngineEvents { onState?: (s: string) => void; onParticipants?: (p: CallEngineParticipant[]) => void; onError?: (e: Error) => void }
export interface CallEngineLike { connect(url: string, token: string): Promise<void>; disconnect(): Promise<void>; setMuted(m: boolean): Promise<void> }
export type CallEngineCtor = new (events?: CallEngineEvents) => CallEngineLike;
export type LoadCallEngine = () => Promise<{ CallEngine: CallEngineCtor }>;

type Phase = "idle" | "outgoing" | "incoming" | "ongoing";
type CallKind = "1x1" | "group";
interface Peer { id: string; name: string | null; avatar: string | null }
interface Session { id: string; room: string; channelId: string }

interface CallControls {
  callsEnabled: boolean;
  startCall: (channelId: string) => void;       // voz 1:1 (DM)
  joinGroupCall: (channelId: string) => void;    // huddle (grupo)
  busy: boolean;
  inCallChannelId: string | null;
}
const CallCtx = createContext<CallControls>({ callsEnabled: false, startCall: () => {}, joinGroupCall: () => {}, busy: false, inCallChannelId: null });
export function useCallControls() { return useContext(CallCtx); }

const rid = () => Math.random().toString(36).slice(2, 8);
const RING_TIMEOUT_MS = 35_000;

export function CallProvider({ loadCallEngine, children }: { loadCallEngine?: LoadCallEngine; children: ReactNode }) {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  const callsEnabled = !!loadCallEngine;

  const [phase, setPhase] = useState<Phase>("idle");
  const [callKind, setCallKind] = useState<CallKind | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [muted, setMuted] = useState(false);
  const [ongoingSince, setOngoingSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [participants, setParticipants] = useState<CallEngineParticipant[]>([]);

  const engineRef = useRef<CallEngineLike | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const kindRef = useRef<CallKind | null>(null);
  const timeoutRef = useRef<number | undefined>(undefined);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { kindRef.current = callKind; }, [callKind]);

  const fetchPeer = useCallback(async (id: string): Promise<Peer> => {
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
    setPhase("idle"); setCallKind(null); setActiveChannelId(null);
    setPeer(null); setMuted(false); setOngoingSince(null); setElapsed(0); setParticipants([]);
  }, []);

  const connectMedia = useCallback(async (room: string) => {
    if (!loadCallEngine) throw new Error("chamada indisponível");
    const { data, error } = await supabase.functions.invoke("call-token", { body: { room } });
    if (error) throw error;
    const { url, token } = data as { url: string; token: string };
    const mod = await loadCallEngine();
    const engine = new mod.CallEngine({
      onParticipants: (p) => setParticipants(p),
      onError: () => { toast.error("Erro na chamada"); cleanup(); },
    });
    engineRef.current = engine;
    await engine.connect(url, token);
  }, [loadCallEngine, supabase, cleanup]);

  // ── Voz 1:1 (DM) ──
  const startCall = useCallback(async (channelId: string) => {
    if (!callsEnabled || phaseRef.current !== "idle") return;
    try {
      const { data, error } = await supabase.rpc("call_start", { p_channel: channelId });
      if (error) throw error;
      const s = data as { session_id: string; room: string; callee_id: string };
      sessionRef.current = { id: s.session_id, room: s.room, channelId };
      setCallKind("1x1"); setActiveChannelId(channelId);
      setPeer(await fetchPeer(s.callee_id));
      setPhase("outgoing");
      playRingback();
      timeoutRef.current = window.setTimeout(() => {
        if (phaseRef.current === "outgoing" && sessionRef.current) {
          supabase.rpc("call_cancel", { p_session: sessionRef.current.id }).then(() => {}, () => {});
          cleanup();
        }
      }, RING_TIMEOUT_MS);
    } catch (e) { toast.error((e as Error)?.message || "Não foi possível ligar"); cleanup(); }
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

  // ── Voz em grupo (huddle) ──
  const joinGroupCall = useCallback(async (channelId: string) => {
    if (!callsEnabled || phaseRef.current !== "idle") return;
    try {
      const { data, error } = await supabase.rpc("group_call_join", { p_channel: channelId });
      if (error) throw error;
      const s = data as { session_id: string; room: string };
      sessionRef.current = { id: s.session_id, room: s.room, channelId };
      setCallKind("group"); setActiveChannelId(channelId);
      await connectMedia(s.room);
      setPhase("ongoing"); setOngoingSince(Date.now());
    } catch (e) { toast.error((e as Error)?.message || "Não foi possível entrar na chamada"); cleanup(); }
  }, [callsEnabled, supabase, connectMedia, cleanup]);

  // Desligar/Sair — decide pela natureza da chamada.
  const hangup = useCallback(() => {
    const s = sessionRef.current;
    if (s) {
      if (kindRef.current === "group") supabase.rpc("group_call_leave", { p_session: s.id }).then(() => {}, () => {});
      else if (phaseRef.current === "ongoing") supabase.rpc("call_end", { p_session: s.id }).then(() => {}, () => {});
      else supabase.rpc("call_cancel", { p_session: s.id }).then(() => {}, () => {});
    }
    cleanup();
  }, [supabase, cleanup]);

  const toggleMute = useCallback(async () => {
    const next = !muted;
    try {
      await engineRef.current?.setMuted(next);
      setMuted(next); // só reflete o mudo DEPOIS de confirmar (evita falso "mutado")
    } catch {
      toast.error(next ? "Não foi possível mutar" : "Não foi possível desmutar");
    }
  }, [muted]);

  // Tempo decorrido.
  useEffect(() => {
    if (phase !== "ongoing" || !ongoingSince) return;
    const iv = window.setInterval(() => setElapsed(Math.floor((Date.now() - ongoingSince) / 1000)), 1000);
    return () => window.clearInterval(iv);
  }, [phase, ongoingSince]);

  // Sinalização em tempo real (call_sessions + call_participants).
  useEffect(() => {
    if (!callsEnabled || !currentUser.id) return;
    const ch = supabase
      .channel("carbo-call:" + currentUser.id + ":" + rid())
      // Chamada 1:1 recebida.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_sessions" }, async (payload) => {
        const row = payload.new as { id: string; channel_id: string; status: string; callee_id: string | null; started_by: string; escopo: string };
        if (row.status !== "ringing" || row.callee_id !== currentUser.id) return;
        if (phaseRef.current !== "idle") { supabase.rpc("call_decline", { p_session: row.id }).then(() => {}, () => {}); return; }
        sessionRef.current = { id: row.id, room: "call_" + row.id, channelId: row.channel_id };
        setCallKind("1x1"); setActiveChannelId(row.channel_id);
        setPeer(await fetchPeer(row.started_by));
        setPhase("incoming");
        playRing();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "call_sessions" }, async (payload) => {
        const row = payload.new as { id: string; status: string; channel_id: string };
        // Banner de grupo (qualquer sessão de grupo mudou) → revalida.
        qc.invalidateQueries({ queryKey: ["chat", "group-call", row.channel_id] });
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
      // Huddle: alguém entrou/saiu → atualiza banner e painel.
      .on("postgres_changes", { event: "*", schema: "public", table: "call_participants" }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "group-call"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callsEnabled, currentUser.id]);

  // Catch-up: veio de um push de chamada 1:1 ainda tocando.
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
      setCallKind("1x1"); setActiveChannelId(row.channel_id);
      setPeer(await fetchPeer(row.started_by));
      setPhase("incoming"); playRing();
    })();
    return () => { cancelled = true; };
  }, [callsEnabled, currentUser.id, supabase, fetchPeer]);

  useEffect(() => () => { engineRef.current?.disconnect().catch(() => {}); }, []);

  const ctxValue = useMemo<CallControls>(
    () => ({ callsEnabled, startCall, joinGroupCall, busy: phase !== "idle", inCallChannelId: phase !== "idle" ? activeChannelId : null }),
    [callsEnabled, startCall, joinGroupCall, phase, activeChannelId],
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

      <CallPanel phase={phase} kind={callKind} channelId={activeChannelId} peer={peer}
        elapsed={elapsed} muted={muted} participants={participants}
        onToggleMute={toggleMute} onHangup={hangup} />
    </CallCtx.Provider>
  );
}

function formatElapsed(s: number) {
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

// Painel de chamada em andamento (1:1 e grupo).
function CallPanel({ phase, kind, channelId, peer, elapsed, muted, participants, onToggleMute, onHangup }: {
  phase: Phase; kind: CallKind | null; channelId: string | null; peer: Peer | null;
  elapsed: number; muted: boolean; participants: CallEngineParticipant[];
  onToggleMute: () => void; onHangup: () => void;
}) {
  const { currentUser } = useChatCtx();
  const isGroup = kind === "group";
  const group = useActiveGroupCall(isGroup ? channelId : null, isGroup);
  if (phase !== "outgoing" && phase !== "ongoing") return null;

  const speaking = new Set(participants.filter((p) => p.isSpeaking).map((p) => p.identity));
  const roster = group.data?.participants ?? [];

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-72 rounded-2xl border bg-background p-4 shadow-xl">
      {isGroup ? (
        <>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" /> Chamada de voz · {roster.length || group.data?.count || 1}
            {phase === "ongoing" && <span className="ml-auto text-xs font-normal text-muted-foreground">{formatElapsed(elapsed)}</span>}
          </p>
          <div className="max-h-52 space-y-1.5 overflow-y-auto">
            {(roster.length ? roster : [{ id: currentUser.id, full_name: currentUser.full_name ?? "Você", avatar_url: currentUser.avatar_url ?? null }]).map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="relative">
                  <Avatar name={p.full_name} url={p.avatar_url} size={28} />
                  {speaking.has(p.id) && <span className="absolute inset-0 rounded-full ring-2 ring-emerald-500" />}
                </span>
                <span className="truncate text-sm">{p.id === currentUser.id ? "Você" : (p.full_name ?? "—")}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <Avatar name={peer?.name} url={peer?.avatar} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{peer?.name ?? "Chamada"}</p>
            <p className="text-xs text-muted-foreground">{phase === "outgoing" ? "Chamando…" : formatElapsed(elapsed)}</p>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-4">
        {phase === "ongoing" && (
          <button onClick={onToggleMute} title={muted ? "Desmutar" : "Mutar"}
            className={`flex h-11 w-11 items-center justify-center rounded-full border ${muted ? "bg-muted text-destructive" : "hover:bg-muted"}`}>
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
        <button onClick={onHangup} title={isGroup ? "Sair" : "Desligar"}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
