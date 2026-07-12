import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Subscription } from "@/types/purchasing";

const db = supabase as unknown as { from: (t: string) => any };

// Assinaturas / recorrências (Claude, Supabase, Vercel… por setor). Guarda em
// qual cartão cai a cobrança e o próximo vencimento pra lembrar de pagar.
export function useSubscriptions() {
  return useQuery({
    queryKey: ["subscriptions"],
    queryFn: async (): Promise<Subscription[]> => {
      const { data, error } = await db
        .from("subscriptions")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Subscription[];
    },
  });
}

export function useCreateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<Subscription>) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("subscriptions").insert({
        nome: values.nome,
        departamento: values.departamento || null,
        valor: values.valor ?? 0,
        currency: values.currency ?? "BRL",
        ciclo: values.ciclo ?? "mensal",
        proximo_vencimento: values.proximo_vencimento || null,
        payment_method_id: values.payment_method_id || null,
        cobranca: values.cobranca ?? "automatica",
        status: values.status ?? "ativa",
        responsavel: values.responsavel || null,
        url: values.url || null,
        notes: values.notes || null,
        created_by: u?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast({ title: "Assinatura cadastrada" });
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar assinatura", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Subscription> & { id: string }) => {
      const { error } = await db.from("subscriptions").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast({ title: "Assinatura atualizada" });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast({ title: "Assinatura removida" });
    },
    onError: (e: any) => toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });
}
