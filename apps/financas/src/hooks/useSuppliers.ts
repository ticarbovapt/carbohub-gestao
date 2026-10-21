import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { lerSemTeto } from "@carbo/shell";

export interface Supplier {
  id: string;
  name: string;
  legal_name: string | null;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  address: string | null;
  category: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useSuppliers(filters?: { search?: string; active?: boolean }) {
  return useQuery({
    queryKey: ["suppliers", filters],
    queryFn: async () => {
      // ⚠️ Sem teto: o PostgREST corta em 1.000 linhas calado. `id` desempata
      // nomes iguais — sem ele a paginação repete uma linha e perde outra.
      const data = await lerSemTeto<Supplier>(() => {
        let query = supabase
          .from("suppliers")
          .select("*")
          .order("name", { ascending: true })
          .order("id");
        if (filters?.active !== undefined) query = query.eq("is_active", filters.active);
        return query;
      });
      return data as unknown as Supplier[];
    },
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: Partial<Supplier>) => {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          name: values.name!,
          legal_name: values.legal_name || null,
          document_number: values.document_number || null,
          email: values.email || null,
          phone: values.phone || null,
          city: values.city || null,
          state: values.state || null,
          zip_code: values.zip_code || null,
          address: values.address || null,
          category: values.category || "geral",
          notes: values.notes || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Fornecedor cadastrado com sucesso" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao cadastrar fornecedor", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Supplier> & { id: string }) => {
      const { error } = await supabase
        .from("suppliers")
        .update(values as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Fornecedor atualizado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Fornecedor removido" });
    },
    onError: (err: any) => {
      // 23503 = chave estrangeira: há cotação, OC ou conta a pagar apontando
      // para ele. Apagar sumiria com o vínculo do histórico — o banco recusa.
      if (err?.code === "23503") {
        toast({
          title: "Este fornecedor tem compras ligadas",
          description: "Cotações, ordens de compra ou contas a pagar apontam para ele. Inative em vez de excluir.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    },
  });
}
