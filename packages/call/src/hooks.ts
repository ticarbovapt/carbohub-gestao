import { useCallback, useEffect, useRef, useState } from "react";
import type { CallEngine } from "./engine";
import type { CallParticipant, CallStateValue } from "./types";

// Hook React sobre a engine. A engine (e o livekit-client) só são carregados
// no primeiro connect() — dynamic import, fora do bundle inicial.
export function useCall() {
  const engineRef = useRef<CallEngine | null>(null);
  const [state, setState] = useState<CallStateValue>("idle");
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [muted, setMutedState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (url: string, token: string) => {
    setError(null);
    const mod = await import("./engine"); // ← carrega a engine + livekit sob demanda
    const engine = new mod.CallEngine({
      onState: setState,
      onParticipants: setParticipants,
      onError: (e) => setError(e.message),
    });
    engineRef.current = engine;
    await engine.connect(url, token);
  }, []);

  const disconnect = useCallback(async () => {
    await engineRef.current?.disconnect();
    engineRef.current = null;
    setMutedState(false);
  }, []);

  const setMuted = useCallback(async (m: boolean) => {
    await engineRef.current?.setMuted(m);
    setMutedState(m);
  }, []);

  // Segurança: ao desmontar, libera o microfone e fecha a conexão.
  useEffect(() => () => { engineRef.current?.disconnect(); engineRef.current = null; }, []);

  return { state, participants, muted, error, connect, disconnect, setMuted };
}
