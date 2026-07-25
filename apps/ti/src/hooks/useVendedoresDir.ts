// ─────────────────────────────────────────────────────────────────────────────
// Diretório de vendedores (Admin) — porta FIEL de apps/crm/src/hooks/useVendas.ts
// (useVendedoresDir). Chama a RPC crm_list_vendedores (profiles, não toca vendas).
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VendedorDir {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  secondary_department: string | null;
  is_vendedor: boolean;
}

const db = supabase as unknown as {
  rpc: (fn: string, args?: any) => Promise<{ data: any; error: any }>;
};

/** Diretório de vendedores (RPC crm_list_vendedores) — profiles, não toca vendas. */
export function useVendedoresDir() {
  return useQuery({
    queryKey: ["crm_list_vendedores"],
    queryFn: async (): Promise<VendedorDir[]> => {
      const { data, error } = await db.rpc("crm_list_vendedores");
      if (error) throw error;
      return (data ?? []) as VendedorDir[];
    },
  });
}
