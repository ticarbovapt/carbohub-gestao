import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { PaymentMethod } from "@/types/purchasing";

const db = supabase as unknown as { from: (t: string) => any };

// Cadastro de Cartões / formas de pagamento. Compartilhado entre a compra da OC
// e (futuramente) as assinaturas. Só guardamos últimos 4 + bandeira (PCI-safe).
export function usePaymentMethods(onlyActive = false) {
  return useQuery({
    queryKey: ["payment_methods", onlyActive],
    queryFn: async (): Promise<PaymentMethod[]> => {
      let q = db.from("payment_methods").select("*").order("apelido", { ascending: true });
      if (onlyActive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PaymentMethod[];
    },
  });
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<PaymentMethod>) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("payment_methods").insert({
        apelido: values.apelido,
        tipo: values.tipo ?? "credito",
        bandeira: values.bandeira || null,
        ultimos4: values.ultimos4 || null,
        titular: values.titular || null,
        departamento: values.departamento || null,
        notes: values.notes || null,
        created_by: u?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment_methods"] });
      toast({ title: "Forma de pagamento cadastrada" });
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" }),
  });
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<PaymentMethod> & { id: string }) => {
      const { error } = await db.from("payment_methods").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment_methods"] });
      toast({ title: "Forma de pagamento atualizada" });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("payment_methods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment_methods"] });
      toast({ title: "Forma de pagamento removida" });
    },
    onError: (e: any) => toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });
}

/** Rótulo curto e seguro pra exibir um cartão: "Nubank TI · Visa ••1234". */
export function labelPaymentMethod(pm: Pick<PaymentMethod, "apelido" | "bandeira" | "ultimos4"> | null | undefined): string {
  if (!pm) return "—";
  const parts = [pm.apelido];
  const tail = [pm.bandeira, pm.ultimos4 ? `••${pm.ultimos4}` : null].filter(Boolean).join(" ");
  if (tail) parts.push(tail);
  return parts.join(" · ");
}
