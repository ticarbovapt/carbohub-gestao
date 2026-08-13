import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  rtmLerTodas, rtmObservar, rtmSincronizar, rtmIniciarSincronizacao, rtmLimparAntigas,
  type RtmVisitaLocal,
} from "@/lib/rtmFila";

// ─────────────────────────────────────────────────────────────────────────────
// RTM — Route to Market · Fase 1 (registro de visita)
//
// Leitura vem do banco; ESCRITA nunca vem daqui. Quem escreve é a fila local
// (`lib/rtmFila.ts`), porque a visita precisa continuar funcionando sem sinal.
// Misturar os dois caminhos criaria duas verdades sobre a mesma visita — e a
// que o vendedor vê tem de ser a do bolso dele.
//
// ⚠️ Os tipos gerados do Supabase não conhecem as tabelas rtm_*; o cast fica
// isolado neste `db`, como no `useTerritorio`.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  storage: { from: (b: string) => any };
};

/** O dia de BRASÍLIA, não o UTC. `toISOString().slice(0,10)` devolve o dia em
 *  UTC e a visita das 21h cairia no dia seguinte — o mesmo erro que já jogou o
 *  faturamento do dia 31 para o mês seguinte no `useMetaEcommerce`. */
export function diaLocal(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export type RtmSituacaoAgenda =
  | "pendente" | "em_andamento" | "concluida" | "nao_cumprida" | "cancelada";

export interface RtmAgendaRow {
  planejada_id: string;
  data_prevista: string;
  ordem: number | null;
  status_plano: string;
  origem: string;
  observacao: string | null;
  cancelamento_motivo: string | null;
  vendedor_id: string;
  vendedor_nome: string | null;
  pdv_id: string;
  pdv_nome: string;
  pdv_code: string;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  pdv_lat: number | null;
  pdv_lng: number | null;
  visita_id: string | null;
  ts_checkin: string | null;
  ts_checkout: string | null;
  resultado: string | null;
  situacao: RtmSituacaoAgenda;
}

export interface RtmVisitaCard {
  id: string;
  pdv_id: string;
  pdv_nome: string;
  pdv_code: string;
  cidade: string | null;
  uf: string | null;
  vendedor_id: string;
  vendedor_nome: string | null;
  tipo: string;
  ts_checkin: string;
  ts_checkout: string | null;
  distancia_pdv_m: number | null;
  resultado: string | null;
  motivo_label: string | null;
  motivo_texto: string | null;
  proximo_passo: string | null;
  proximo_passo_em: string | null;
  origem_registro: string;
  minutos: number | null;
  /** 'ok' | 'confirmar' | 'sem_referencia'. Ver o comentário em RtmSinalLocal. */
  local_status: "ok" | "confirmar" | "sem_referencia";
  fotos: number;
  skus_zerados: number;
  achados: number;
  foi_corrigida: boolean;
}

export interface RtmMotivo { id: string; label: string; ordem: number; exige_texto: boolean }

export interface RtmChecklistItem {
  id: string;
  codigo: string;
  label: string;
  ajuda: string | null;
  tipo: "sim_nao" | "sim_nao_na" | "numero" | "texto";
  obrigatorio: boolean;
  nao_e_problema: boolean;
  ordem: number;
}

export const RTM_RESULTADO_LABEL: Record<string, string> = {
  pedido: "Fez pedido",
  sem_pedido: "Sem pedido",
  pdv_fechado: "PDV fechado",
  nao_atendido: "Não fui atendido",
};

export const RTM_SITUACAO_LABEL: Record<RtmSituacaoAgenda, string> = {
  pendente: "A visitar",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  nao_cumprida: "Não cumprida",
  cancelada: "Cancelada",
};

export const RTM_SKU_LABEL: Record<string, string> = {
  "10ml": "Carbozé 10ml (sachê)",
  "100ml": "Carbozé 100ml",
  "1l": "Carbozé 1L",
};

export const RTM_SKUS = ["10ml", "100ml", "1l"] as const;

// ── Listas de apoio ──────────────────────────────────────────────────────────
//
// Cacheadas por muito tempo de propósito: mudam por decisão de negócio, não a
// cada minuto, e no celular em campo cada request a menos conta.

export function useRtmMotivos() {
  return useQuery({
    queryKey: ["rtm", "motivos"],
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<RtmMotivo[]> => {
      const { data, error } = await db.from("rtm_motivos")
        .select("id,label,ordem,exige_texto").eq("ativo", true).order("ordem");
      if (error) throw error;
      return (data ?? []) as RtmMotivo[];
    },
  });
}

export function useRtmChecklist() {
  return useQuery({
    queryKey: ["rtm", "checklist"],
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<RtmChecklistItem[]> => {
      const { data, error } = await db.from("rtm_checklist_itens")
        .select("id,codigo,label,ajuda,tipo,obrigatorio,nao_e_problema,ordem")
        .eq("ativo", true).order("ordem");
      if (error) throw error;
      return (data ?? []) as RtmChecklistItem[];
    },
  });
}

// ── Agenda ───────────────────────────────────────────────────────────────────

/** `vendedorId` nulo = todos (visão do gestor). A RLS já barra o que o membro
 *  não pode ver, então isto é filtro de tela, nunca de segurança. */
export function useRtmAgenda(de: string, ate: string, vendedorId?: string | null) {
  return useQuery({
    queryKey: ["rtm", "agenda", de, ate, vendedorId ?? "todos"],
    queryFn: async (): Promise<RtmAgendaRow[]> => {
      let q = db.from("rtm_agenda").select("*")
        .gte("data_prevista", de).lte("data_prevista", ate)
        .order("data_prevista").order("ordem", { nullsFirst: false }).order("pdv_nome");
      if (vendedorId) q = q.eq("vendedor_id", vendedorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RtmAgendaRow[];
    },
  });
}

export function useRtmVisitas(de: string, ate: string, vendedorId?: string | null) {
  return useQuery({
    queryKey: ["rtm", "visitas", de, ate, vendedorId ?? "todos"],
    queryFn: async (): Promise<RtmVisitaCard[]> => {
      let q = db.from("rtm_visita_card").select("*")
        // O filtro é por dia de Brasília, então a janela vai de 00:00 local do
        // primeiro dia a 00:00 local do dia seguinte ao último.
        .gte("ts_checkin", `${de}T00:00:00-03:00`)
        .lt("ts_checkin", `${ate}T23:59:59.999-03:00`)
        .order("ts_checkin", { ascending: false });
      if (vendedorId) q = q.eq("vendedor_id", vendedorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RtmVisitaCard[];
    },
  });
}

// ── Planejamento ─────────────────────────────────────────────────────────────

export function usePlanejarVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pdv_id: string; vendedor_id: string; data_prevista: string;
      ordem?: number | null; observacao?: string | null;
    }) => {
      const { error } = await db.from("rtm_visita_planejada").insert({
        pdv_id: input.pdv_id,
        vendedor_id: input.vendedor_id,
        data_prevista: input.data_prevista,
        ordem: input.ordem ?? null,
        observacao: input.observacao ?? null,
        origem: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rtm", "agenda"] });
      toast.success("Visita agendada.");
    },
    onError: (e: { message?: string }) => {
      const msg = e?.message ?? "";
      // O índice único é a regra "o mesmo vendedor não planeja o mesmo PDV
      // duas vezes no mesmo dia". Sem traduzir, o vendedor lê texto do Postgres.
      toast.error(
        /duplicate key|rtm_visita_planejada_pdv_id_vendedor_id_data_prevista_key/i.test(msg)
          ? "Este PDV já está na agenda deste vendedor neste dia."
          : "Não deu para agendar: " + (msg || "tente de novo"),
      );
    },
  });
}

export function useCancelarPlanejada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; motivo: string }) => {
      const { error } = await db.from("rtm_visita_planejada")
        .update({ status: "cancelada", cancelamento_motivo: input.motivo, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rtm", "agenda"] });
      toast.success("Visita cancelada.");
    },
    onError: (e: { message?: string }) => toast.error("Não deu para cancelar: " + (e?.message ?? "")),
  });
}

// ── A fila local ─────────────────────────────────────────────────────────────

/** Espelha o IndexedDB em estado de React. É a única fonte da visita em
 *  andamento — inclusive quando há sinal, para não existirem dois caminhos. */
export function useRtmFila() {
  const [visitas, setVisitas] = useState<RtmVisitaLocal[]>([]);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine);

  const recarregar = useCallback(() => {
    void rtmLerTodas().then(setVisitas).catch(() => setVisitas([]));
  }, []);

  useEffect(() => {
    rtmIniciarSincronizacao();
    recarregar();
    void rtmLimparAntigas();
    const solta = rtmObservar(recarregar);
    const mudou = () => setOnline(navigator.onLine);
    window.addEventListener("online", mudou);
    window.addEventListener("offline", mudou);
    return () => {
      solta();
      window.removeEventListener("online", mudou);
      window.removeEventListener("offline", mudou);
    };
  }, [recarregar]);

  const emAndamento = visitas.find((v) => !v.fechamento) ?? null;
  const pendentes = visitas.filter((v) => v.fechamento && v.estado !== "pronta");

  return { visitas, emAndamento, pendentes, online, recarregar, sincronizar: rtmSincronizar };
}

// ── Geolocalização ───────────────────────────────────────────────────────────
//
// ⚠️ NUNCA bloqueia. Sem permissão, sem sinal de GPS ou com timeout, devolve
// nulos e a visita segue. O briefing é explícito: geolocalização é evidência,
// não verdade — e recusar o check-in por falta de GPS transformaria um dado
// auxiliar em impedimento de trabalho.

export function pegarLocal(timeoutMs = 8000): Promise<{ lat: number | null; lng: number | null; precisao_m: number | null }> {
  return new Promise((resolve) => {
    const vazio = { lat: null, lng: null, precisao_m: null };
    if (typeof navigator === "undefined" || !navigator.geolocation) { resolve(vazio); return; }
    let respondeu = false;
    const t = window.setTimeout(() => { if (!respondeu) { respondeu = true; resolve(vazio); } }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (respondeu) return;
        respondeu = true; window.clearTimeout(t);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precisao_m: Math.round(p.coords.accuracy) });
      },
      () => { if (respondeu) return; respondeu = true; window.clearTimeout(t); resolve(vazio); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

// ── Fotos já sincronizadas ───────────────────────────────────────────────────

/** O bucket é privado, então a exibição precisa de link assinado. Uma hora é
 *  bastante para olhar a visita e curto para o link não virar acesso perene se
 *  alguém copiar a URL. */
export function useFotosDaVisita(visitaId: string | null) {
  return useQuery({
    enabled: !!visitaId,
    queryKey: ["rtm", "fotos", visitaId],
    queryFn: async (): Promise<{ id: string; tipo: string; url: string; legenda: string | null }[]> => {
      const { data, error } = await db.from("rtm_visita_fotos")
        .select("id,tipo,storage_path,legenda").eq("visita_id", visitaId).order("created_at");
      if (error) throw error;
      const linhas = (data ?? []) as { id: string; tipo: string; storage_path: string; legenda: string | null }[];
      const saida: { id: string; tipo: string; url: string; legenda: string | null }[] = [];
      for (const l of linhas) {
        const { data: assinado } = await db.storage.from("rtm-visitas").createSignedUrl(l.storage_path, 3600);
        if (assinado?.signedUrl) saida.push({ id: l.id, tipo: l.tipo, url: assinado.signedUrl, legenda: l.legenda });
      }
      return saida;
    },
  });
}
