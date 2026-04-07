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

export function useImportSuppliersFromBling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: contacts, error } = await supabase
        .from("bling_contacts")
        .select("*")
        .eq("is_supplier", true);
      if (error) throw error;
      if (!contacts || contacts.length === 0) return { imported: 0 };

      let imported = 0;
      for (const c of contacts) {
        const cpfCnpj = ((c as any).cpf_cnpj || "") as string;
        const cnpj = cpfCnpj.replace(/\D/g, "");
        if (!cnpj || cnpj.length < 11) continue;
        const cnpjPadded = cnpj.length === 14 ? cnpj : cnpj.padStart(14, "0");
        const { error: e } = await supabase
          .from("mrp_suppliers")
          .upsert({
            cnpj: cnpjPadded,
            legal_name: ((c as any).nome || (c as any).fantasia || "Sem nome") as string,
            trade_name: ((c as any).fantasia || null) as string | null,
            status: (c as any).situacao === "A" ? "active" : "inactive",
            emails: (c as any).email ? [(c as any).email] : ([] as string[]),
            phones: [(c as any).telefone, (c as any).celular].filter(Boolean) as string[],
            raw: ((c as any).raw_data || {}) as Json,
          } as any, { onConflict: "cnpj" });
        if (!e) imported++;
      }
      return { imported };
    },
    onSuccess: ({ imported }) => {
      if (imported === 0) {
        toast.info("Nenhum fornecedor novo encontrado no Bling. Verifique se o Bling está conectado e possui contatos marcados como fornecedor.");
      } else {
        toast.success(`${imported} fornecedor(es) importado(s) do Bling`);
      }
      qc.invalidateQueries({ queryKey: ["mrp-suppliers"] });
    },
    onError: (e: Error) => toast.error("Erro ao importar do Bling: " + e.message),
  });
}
