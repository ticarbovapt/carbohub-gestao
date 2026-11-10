import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { lerSemTeto } from "@carbo/shell";
import { supabase } from "@/integrations/supabase/client";
import type { MvEvento, MvLead, Pessoa } from "@/lib/maquinaVendas";

// ─────────────────────────────────────────────────────────────────────────────
// Máquina de Vendas — IO. As regras estão em `lib/maquinaVendas.ts`.
// ⚠️ Leitura SEM TETO (`lerSemTeto`, ordem estável): o pipeline cresce, e o
//    corte calado de 1.000 do PostgREST sumiria com os leads mais antigos.
// ⚠️ Mudar o card muda a tela NO CLIQUE (otimista) e desfaz se o banco recusar.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: object) => any; channel: any; removeChannel: any };
const CHAVE = ["mv", "leads"] as const;

export function useMvLeads(verArquivados: boolean) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...CHAVE, verArquivados],
    queryFn: () =>
      lerSemTeto<MvLead>(() => {
        let c = db.from("mv_leads").select("*");
        c = verArquivados ? c.not("arquivado_em", "is", null) : c.is("arquivado_em", null);
        return c.order("primeiro_contato_em", { ascending: false }).order("id");
      }),
    refetchInterval: 120_000, // rede de segurança; o Realtime traz a novidade na hora
  });

  useEffect(() => {
    const ch = db.channel("mv-leads")
      .on("postgres_changes", { event: "*", schema: "public", table: "mv_leads" },
          () => qc.invalidateQueries({ queryKey: CHAVE }))
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [qc]);

  return q;
}

export function useMvPessoas() {
  return useQuery({
    queryKey: ["mv", "pessoas"],
    queryFn: async () => {
      const { data, error } = await db.rpc("mv_pessoas");
      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
    staleTime: 10 * 60_000,
  });
}

export function useMvEventos(leadId: string | null) {
  return useQuery({
    queryKey: ["mv", "eventos", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await db.from("mv_lead_eventos").select("*")
        .eq("lead_id", leadId).order("em", { ascending: false }).order("id", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as MvEvento[];
    },
  });
}

type Campos = Partial<Omit<MvLead, "id" | "created_at" | "updated_at" | "created_by">>;

/** Troca campos de um lead — otimista em todas as listas carregadas. */
export function useMvAtualizar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Campos }) => {
      const { error } = await db.from("mv_leads").update(campos).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, campos }) => {
      await qc.cancelQueries({ queryKey: CHAVE });
      const antes = qc.getQueriesData<MvLead[]>({ queryKey: CHAVE });
      qc.setQueriesData<MvLead[]>({ queryKey: CHAVE }, (lista) =>
        lista?.map((l) => (l.id === id ? { ...l, ...campos } : l)));
      return { antes };
    },
    onError: (e: any, _v, ctx) => {
      ctx?.antes.forEach(([k, v]) => qc.setQueryData(k, v));
      toast.error("Não foi possível salvar", { description: e?.message });
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: CHAVE });
      qc.invalidateQueries({ queryKey: ["mv", "eventos", v.id] });
    },
  });
}

/** Cria o lead com o id gerado no navegador: ele aparece já com o id definitivo. */
export function useMvCriar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campos: Campos & { nome: string }) => {
      const id = crypto.randomUUID();
      const { error } = await db.from("mv_leads").insert({ id, ...campos });
      if (error) throw error;
      return id;
    },
    onError: (e: any) => toast.error("Não foi possível criar o lead", { description: e?.message }),
    onSettled: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

/** Mensagem de erro de leitura: tabela ausente = a migração ainda não rodou. */
export function erroDeLeitura(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "42P01" || err?.code === "PGRST205" || /mv_leads/.test(err?.message ?? ""))
    return "A tabela do pipeline ainda não existe neste banco (migração 20261153).";
  return err?.message ?? "Erro ao carregar.";
}
