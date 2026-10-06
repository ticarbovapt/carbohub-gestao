import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Registra a ÚLTIMA ATIVIDADE do usuário NESTE sistema (não só o login):
//  • ao montar / trocar de rota  → registra na hora (navegação = presença ativa);
//  • enquanto a aba está VISÍVEL → heartbeat a cada 2 min (mantém "último sistema"
//    mesmo parado na mesma página, e faz o sistema aberto "ganhar" sobre outra aba);
//  • ao focar/voltar pra aba → registra.
// Throttle de 2 min para não escrever no banco a cada evento.
const THROTTLE_MS = 2 * 60 * 1000;
let lastSent = 0;

export function useAccessPing(app: string) {
  const location = useLocation();

  useEffect(() => {
    const ping = (force = false) => {
      if (!force && document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastSent < THROTTLE_MS) return;
      lastSent = now;
      // .then() é OBRIGATÓRIO: supabase.rpc é lazy — sem .then()/await a
      // requisição NUNCA é enviada. (foi o bug do "último acesso" não gravar.)
      supabase.rpc("record_app_access", { _app: app }).then(() => {}, () => {});
    };

    ping(true); // montou ou trocou de rota → é atividade, registra já

    const onActive = () => ping();
    window.addEventListener("focus", onActive);
    document.addEventListener("visibilitychange", onActive);
    const id = setInterval(onActive, THROTTLE_MS); // heartbeat enquanto visível

    return () => {
      window.removeEventListener("focus", onActive);
      document.removeEventListener("visibilitychange", onActive);
      clearInterval(id);
    };
  }, [app, location.pathname]);
}
