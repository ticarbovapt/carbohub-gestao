import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
      let query = supabase
        .from("suppliers")
        .select("*")
        .order("name", { ascending: true });

      if (filters?.active !== undefined) {
        query = query.eq("is_active", filters.active);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Supplier[];
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
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    },
  });
}
