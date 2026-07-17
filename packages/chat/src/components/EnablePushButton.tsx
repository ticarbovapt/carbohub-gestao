import { useEffect, useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useChatCtx } from "../context";
import { enablePush, getPushState, isIOS, isStandalone, type PushState } from "../lib/push";

// Botão "Ativar notificações" (push com o app fechado). Aparece só quando faz
// sentido pedir: some se já concedido, se o navegador não suporta ou se as
// chaves VAPID não estão configuradas. No iPhone, push só funciona instalado na
// tela de início — nesse caso mostra a dica em vez do botão.
export function EnablePushButton() {
  const { supabase } = useChatCtx();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getPushState().then(setState); }, []);

  if (state === null || state === "unsupported" || state === "unconfigured" || state === "granted") {
    return null;
  }

  // iPhone fora do modo instalado: não dá pra ativar; orienta instalar.
  if (isIOS() && !isStandalone()) {
    return (
      <p className="px-2 py-1 text-[11px] leading-tight text-muted-foreground">
        Para receber notificações no iPhone, instale o app na tela de início
        (Compartilhar → Adicionar à Tela de Início).
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="px-2 py-1 text-[11px] leading-tight text-muted-foreground">
        Notificações bloqueadas — libere nas configurações do navegador.
      </p>
    );
  }

  async function activate() {
    setBusy(true);
    try {
      const next = await enablePush(supabase);
      setState(next);
      if (next === "granted") toast.success("Notificações ativadas");
      else if (next === "denied") toast.error("Permissão negada");
    } catch {
      toast.error("Não foi possível ativar as notificações");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={activate}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
      title="Receber notificações mesmo com o app fechado"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "granted" ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
      Ativar notificações
    </button>
  );
}
