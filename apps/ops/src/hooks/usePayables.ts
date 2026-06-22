import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Contas a Pagar (purchase_payables) — lançar, marcar pago, listar, excluir.
//  Conta pode nascer de uma OC recebida (purchase_order_id) ou ser manual.
//  "Atrasado" é derivado: vencido e ainda não pago/cancelado. RLS: authenticated.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export type PayableStatus = "programado" | "pago" | "atrasado" | "cancelado";

export interface Payable {
  id: string;
  supplier_name: string;
  oc_number: string | null;
  amount: number;
  due_date: string; // YYYY-MM-DD
  status: PayableStatus;
  paid_at: string | null;
  notes: string | null;
  /** vencido e ainda em aberto */
  overdue: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

export function usePayables() {
  return useQuery({
    queryKey: ["ops", "payables"],
    queryFn: async (): Promise<Payable[]> => {
      const res = await db
        .from("purchase_payables")
        .select("id, supplier_name, amount, due_date, status, paid_at, notes, purchase_orders(oc_number)")
        .order("due_date", { ascending: true });
      if (res.error) throw res.error;
      const td = today();
      return (res.data ?? []).map((r: any) => {
        const status = (r.status ?? "programado") as PayableStatus;
        const due = r.due_date ? String(r.due_date).slice(0, 10) : "";
        const aberto = status !== "pago" && status !== "cancelado";
        return {
          id: r.id,
          supplier_name: r.supplier_name ?? "—",
          oc_number: r.purchase_orders?.oc_number ?? null,
          amount: Number(r.amount) || 0,
          due_date: due,
          status,
          paid_at: r.paid_at ? String(r.paid_at).slice(0, 10) : null,
          notes: r.notes ?? null,
          overdue: aberto && !!due && due < td,
        };
      });
    },
  });
}

export interface CreatePayableInput {
  supplierName: string;
  amount: number;
  dueDate: string;
  purchaseOrderId?: string | null;
  notes?: string;
}

export function usePayableMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "payables"] });

  const create = useMutation({
    mutationFn: async (p: CreatePayableInput) => {
      if (!p.supplierName.trim()) throw new Error("Informe o fornecedor.");
      if (!p.dueDate) throw new Error("Informe o vencimento.");
      if (!(Number(p.amount) > 0)) throw new Error("Informe um valor maior que zero.");
      const res = await db.from("purchase_payables").insert({
        supplier_name: p.supplierName.trim(),
        amount: Number(p.amount),
        due_date: p.dueDate,
        purchase_order_id: p.purchaseOrderId || null,
        notes: p.notes?.trim() || null,
        status: "programado",
      });
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await db.auth.getUser();
      const res = await db.from("purchase_payables")
        .update({ status: "pago", paid_at: new Date().toISOString(), paid_by: auth?.user?.id ?? null })
        .eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("purchase_payables").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, markPaid, remove };
}
