import { useState } from "react";
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { useCall } from "@carbo/call";
import { supabase } from "@/integrations/supabase/client";

// Tela de TESTE do Carbo Call (C0, áudio só). Abra em 2 abas, entre na sala nas
// duas e fale — prova a engine + o token da Edge Function. Sem UI de chat.
const ROOM = "test-room";

export default function CallTest() {
  const { state, participants, muted, error, connect, disconnect, setMuted } = useCall();
  const [busy, setBusy] = useState(false);
  const [invokeErr, setInvokeErr] = useState<string | null>(null);

  const connected = state === "connected";

  async function join() {
    setBusy(true); setInvokeErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("call-token", { body: { room: ROOM } });
      if (error) throw error;
      const { url, token } = data as { url: string; token: string };
      await connect(url, token);
    } catch (e) {
      setInvokeErr((e as Error)?.message || "Falha ao entrar na sala");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 p-6">
      <div>
        <h1 className="text-lg font-bold">Teste de chamada — áudio</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Sala <code className="rounded bg-muted px-1">{ROOM}</code> · estado:{" "}
          <b className={connected ? "text-emerald-600" : "text-foreground"}>{state}</b>
        </p>
      </div>

      {!connected ? (
        <button onClick={join} disabled={busy}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Phone className="h-4 w-4" /> {busy ? "Conectando…" : "Entrar na sala de teste"}
        </button>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setMuted(!muted)}
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
            {muted ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4" />} {muted ? "Desmutar" : "Mutar"}
          </button>
          <button onClick={disconnect}
            className="flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground">
            <PhoneOff className="h-4 w-4" /> Sair
          </button>
        </div>
      )}

      {(invokeErr || error) && <p className="text-sm text-destructive">{invokeErr || error}</p>}

      <div>
        <p className="text-sm font-medium">Participantes ({participants.length})</p>
        {participants.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">— ninguém na sala —</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {participants.map((p) => (
              <li key={p.identity + (p.isLocal ? "-me" : "")} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${p.isSpeaking ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                <span className="truncate font-mono text-xs">{p.identity}</span>
                {p.isLocal && <span className="text-xs text-primary">(você)</span>}
                {p.muted && <span className="text-xs text-muted-foreground">🔇</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Dica: abra esta página em <b>2 abas</b> e clique em “Entrar” nas duas. O ponto verde acende em quem está falando.
      </p>
    </div>
  );
}
