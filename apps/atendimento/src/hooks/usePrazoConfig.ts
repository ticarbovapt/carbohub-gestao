import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PrazoConfig } from "@/lib/prazos";

// Config de prazos (somente leitura) para a tela /vender. Nasce desligada; a
// tabela PPF/PPE e o aviso funcionam sempre — só o GATE de aprovação é inerte.
// Tabela nova não está nos tipos gerados → cliente sem tipo.
const db = supabase as unknown as { from: (t: string) => any };

export function usePrazoConfigPublic() {
  return useQuery({
    queryKey: ["prazo_config_public"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PrazoConfig> => {
      const { data } = await db.from("prazo_config").select("enabled, min_business_days, ship_offset_days").maybeSingle();
      return {
        enabled: Boolean(data?.enabled),
        minBusinessDays: Number(data?.min_business_days ?? 3),
        shipOffsetDays: Number(data?.ship_offset_days ?? 1),
      };
    },
  });
}
