import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Cotações (RFQ) por ITEM da requisição. Cada item pode ter várias cotações de
// fornecedores; o comprador marca a vencedora (selected) por item. Compartilhado
// entre a requisição (Ops/Sales) e o Finanças — todos leem/escrevem purchase_quotes.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as { from: (t: string) => any };

export interface Quote {
  id: string;
  request_id: string;
  item_index: number;
  item_descricao: string | null;
  supplier_name: string;
  supplier_id: string | null;
  unit_price: number;
  quantidade: number;
  notes: string | null;
  link: string | null;
  selected: boolean;
}

export interface SupplierLite { id: string; name: string }

/** Cadastro de fornecedores (ativos) — pra autocomplete/vínculo nas cotações. */
export function useSuppliersLite() {
  return useQuery({
    queryKey: ["suppliers_lite"],
    staleTime: 60_000,
    queryFn: async (): Promise<SupplierLite[]> => {
      const { data, error } = await db.from("suppliers").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as SupplierLite[];
    },
  });
}

export function useQuotes(requestId: string | null) {
  return useQuery({
    queryKey: ["purchase_quotes", requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<Quote[]> => {
      const { data, error } = await db
        .from("purchase_quotes")
        .select("*")
        .eq("request_id", requestId)
        .order("item_index", { ascending: true })
        .order("unit_price", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Quote[];
    },
  });
}

export function useAddQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (q: {
      request_id: string; item_index: number; item_descricao?: string | null;
      supplier_name: string; supplier_id?: string | null; unit_price: number; quantidade: number; notes?: string | null; link?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("purchase_quotes").insert({
        request_id: q.request_id,
        item_index: q.item_index,
        item_descricao: q.item_descricao ?? null,
        supplier_name: q.supplier_name,
        supplier_id: q.supplier_id ?? null,
        unit_price: q.unit_price,
        quantidade: q.quantidade,
        notes: q.notes ?? null,
        link: q.link ?? null,
        created_by: u?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["purchase_quotes", v.request_id] });
      toast.success("Cotação adicionada.");
    },
    onError: (e: Error) => toast.error("Erro ao adicionar cotação: " + e.message),
  });
}

/** Marca a cotação vencedora do item (desmarca as outras do mesmo item). */
export function useSelectQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (q: { id: string; request_id: string; item_index: number; selected: boolean }) => {
      // Zera a seleção do item e, se estamos escolhendo, marca só esta.
      const un = await db.from("purchase_quotes").update({ selected: false })
        .eq("request_id", q.request_id).eq("item_index", q.item_index);
      if (un.error) throw un.error;
      if (q.selected) {
        const { error } = await db.from("purchase_quotes").update({ selected: true }).eq("id", q.id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["purchase_quotes", v.request_id] }),
    onError: (e: Error) => toast.error("Erro ao escolher cotação: " + e.message),
  });
}

// Cotação de RASCUNHO (na criação da requisição, antes de existir request_id).
export interface DraftQuote {
  key: string;
  item_index: number;
  item_descricao: string | null;
  supplier_name: string;
  supplier_id: string | null;
  unit_price: number;
  quantidade: number;
  notes: string | null;
  link: string | null;
  selected: boolean;
}

/** Persiste as cotações de rascunho depois que a requisição foi criada (tem id). */
export async function persistDraftQuotes(requestId: string, drafts: DraftQuote[]) {
  if (!drafts.length) return;
  const { data: u } = await supabase.auth.getUser();
  const rows = drafts.map((d) => ({
    request_id: requestId,
    item_index: d.item_index,
    item_descricao: d.item_descricao ?? null,
    supplier_name: d.supplier_name,
    supplier_id: d.supplier_id ?? null,
    unit_price: d.unit_price,
    quantidade: d.quantidade,
    notes: d.notes ?? null,
    link: d.link ?? null,
    selected: !!d.selected,
    created_by: u?.user?.id ?? null,
  }));
  const { error } = await (supabase as any).from("purchase_quotes").insert(rows);
  if (error) throw error;
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (q: { id: string; request_id: string }) => {
      const { error } = await db.from("purchase_quotes").delete().eq("id", q.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["purchase_quotes", v.request_id] }),
    onError: (e: Error) => toast.error("Erro ao remover cotação: " + e.message),
  });
}
