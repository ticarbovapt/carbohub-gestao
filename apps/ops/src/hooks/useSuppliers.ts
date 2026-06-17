import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Fornecedores MRP (mrp_suppliers) — leitura + escrita.
//  e-mail/telefone vivem em jsonb (emails/phones); contato/obs em raw.
//  RLS: mrp_suppliers aberto a autenticado (migration do Ops).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface Supplier {
  id: string;
  cnpj: string;
  legal_name: string;
  trade_name: string;
  category: string;
  status: "active" | "inactive";
  email: string;
  phone: string;
  contact: string;
  notes: string;
}

const first = (v: unknown): string => (Array.isArray(v) && v.length ? String(v[0]) : "");

export function useSuppliers() {
  return useQuery({
    queryKey: ["ops", "suppliers"],
    queryFn: async (): Promise<Supplier[]> => {
      const res = await db
        .from("mrp_suppliers")
        .select("id, cnpj, legal_name, trade_name, category, status, emails, phones, raw")
        .order("legal_name");
      if (res.error) throw res.error;
      return (res.data ?? []).map((s: Record<string, any>) => ({
        id: s.id as string,
        cnpj: (s.cnpj as string) ?? "",
        legal_name: (s.legal_name as string) ?? "",
        trade_name: (s.trade_name as string) ?? "",
        category: (s.category as string) ?? "",
        status: s.status === "inactive" ? "inactive" : "active",
        email: first(s.emails),
        phone: first(s.phones),
        contact: (s.raw?.contact as string) ?? "",
        notes: (s.raw?.notes as string) ?? "",
      }));
    },
  });
}

export interface SupplierInput {
  legal_name: string;
  cnpj: string;
  contact?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

const digits = (s: string) => s.replace(/\D/g, "");

export function useSupplierMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "suppliers"] });

  const payload = (p: SupplierInput) => ({
    cnpj: digits(p.cnpj),
    legal_name: p.legal_name.trim(),
    emails: p.email?.trim() ? [p.email.trim()] : [],
    phones: p.phone?.trim() ? [p.phone.trim()] : [],
    raw: { contact: p.contact?.trim() || null, notes: p.notes?.trim() || null },
  });

  const validate = (p: SupplierInput) => {
    if (!p.legal_name.trim()) throw new Error("Nome é obrigatório.");
    if (!digits(p.cnpj)) throw new Error("CNPJ é obrigatório.");
  };

  const create = useMutation({
    mutationFn: async (p: SupplierInput) => {
      validate(p);
      const res = await db.from("mrp_suppliers").insert({ ...payload(p), status: "active" });
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...p }: SupplierInput & { id: string }) => {
      validate(p);
      const res = await db.from("mrp_suppliers").update(payload(p)).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, update };
}
