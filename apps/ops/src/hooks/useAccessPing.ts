import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Registra a ÚLTIMA ATIVIDADE do usuário neste sistema (não só o login):
// dispara ao montar, ao navegar entre páginas e ao focar a aba — com throttle
// para não escrever no banco a cada clique. Grava profiles.last_app/last_app_at.
const THROTTLE_MS = 3 * 60 * 1000;
let lastSent = 0;

export function useAccessPing(app: string) {
  const location = useLocation();

  useEffect(() => {
    const ping = () => {
      const now = Date.now();
      if (now - lastSent < THROTTLE_MS) return;
      lastSent = now;
      console.log("[record_app_access] chamando…", app);
      supabase.rpc("record_app_access", { _app: app }).then(({ error }) => {
        if (error) console.error("[record_app_access] ERRO:", error.message, error);
        else console.log("[record_app_access] OK →", app);
      });
    };

    ping(); // monta / troca de rota

    const onFocus = () => ping();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [app, location.pathname]);
}
