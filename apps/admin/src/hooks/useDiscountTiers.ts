import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DiscountConfig, DiscountTier } from "@/lib/discount";

// Config da alçada de desconto (somente leitura) para a tela /vender. HOJE a
// config nasce desligada → { enabled: false } ⇒ todo desconto é auto-aprovado.
// Tabelas novas não estão nos tipos gerados → cliente sem tipo.
const db = supabase as unknown as { from: (t: string) => any };

export function useDiscountTiersPublic() {
  return useQuery({
    queryKey: ["discount_tiers_public"],
    staleTime: 5 * 60_000, // config muda raramente
    queryFn: async (): Promise<DiscountConfig> => {
      const cfg = await db.from("discount_approval_config").select("enabled").maybeSingle();
      const rows = await db
        .from("discount_approval_tiers")
        .select("min_percent, max_percent, authority, label")
        .order("sort_order", { ascending: true });
      const tiers = ((rows.data ?? []) as any[]).map((t) => ({
        min_percent: Number(t.min_percent),
        max_percent: t.max_percent == null ? null : Number(t.max_percent),
        authority: t.authority,
        label: t.label ?? null,
      })) as DiscountTier[];
      return { enabled: Boolean(cfg.data?.enabled), tiers };
    },
  });
}
