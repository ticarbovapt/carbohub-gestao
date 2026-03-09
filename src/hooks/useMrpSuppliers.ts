import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface MrpSupplier {
  id: string;
  cnpj: string;
  legal_name: string | null;
  trade_name: string | null;
  status: string;
  address: Record<string, string> | null;
  phones: string[] | null;
  emails: string[] | null;
  category: string | null;
  raw: Record<string, unknown> | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useMrpSuppliers() {
  return useQuery({
    queryKey: ["mrp-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mrp_suppliers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MrpSupplier[];
    },
  });
}

export function useCnpjLookup() {
  return useMutation({
    mutationFn: async (cnpj: string) => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/cnpj-lookup?cnpj=${encodeURIComponent(cnpj)}`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro na consulta CNPJ");
      }
      return res.json();
    },
  });
}

export function useCreateMrpSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supplier: { cnpj: string; legal_name?: string | null; trade_name?: string | null; category?: string | null; notes?: string | null; status: string; address?: Json | null; phones?: Json | null; emails?: Json | null; raw?: Json | null }) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("mrp_suppliers")
        .insert({ ...supplier, created_by: user.user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mrp-suppliers"] }); toast.success("Fornecedor cadastrado!"); },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}

export function useUpdateMrpSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, any>) => {
      const { error } = await supabase.from("mrp_suppliers").update(data as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mrp-suppliers"] }); toast.success("Fornecedor atualizado!"); },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}
