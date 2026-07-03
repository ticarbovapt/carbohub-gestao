import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Ordens de Serviço / Descarbonização.
//
// FONTE DE VERDADE = portal Licenciados: schema `licenciados`, tabela
// `service_orders` (+ os_customers, os_vehicles). O Carbo Sales CRIA
// (RPC os_create) e ACOMPANHA (kanban espelho read-only + Realtime). A
// EXECUÇÃO (avançar estágio, fotos, IA) fica no Carbox/Licenciados.
//
// O client tipado não conhece o schema `licenciados` → cast pontual p/ any.
// ─────────────────────────────────────────────────────────────────────────────
const lic = () => (supabase as unknown as { schema: (s: string) => any }).schema("licenciados");

export type OsTipo = "b2c" | "b2b" | "frota";
// Estágios efetivos do kanban (licenciados): nova → em_execucao → concluida (+cancelada).
export type OsStage = "nova" | "em_execucao" | "concluida" | "cancelada";

export interface NovaOSInput {
  tipo: OsTipo;
  cliente_nome?: string;
  cnpj?: string;
  telefone?: string;
  responsavel?: string;
  placa?: string;
  modelo?: string;
  qtd_veiculos?: number | null;
  recorrencia?: string | null;
  data_prevista?: string | null;
  prioridade?: number;
  titulo?: string;
  observacoes?: string;
}

export interface OSRow {
  id: string;
  numero: string | null;
  tipo: OsTipo;
  stage: OsStage;
  cliente_nome: string | null;
  cnpj: string | null;
  telefone: string | null;
  placa: string | null;
  modelo: string | null;
  data_prevista: string | null;
  prioridade: number;
  titulo: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

const onlyDigits = (s?: string | null) => (s ?? "").replace(/\D/g, "") || null;

/** Mapeia a linha do schema licenciados para o formato usado pelas telas. */
function mapRow(o: any): OSRow {
  const cust = o.customer ?? null;
  const vehicles = Array.isArray(o.vehicles) ? o.vehicles : [];
  const veh = vehicles.find((v: any) => v.position === 1) ?? vehicles[0] ?? null;
  return {
    id: o.id,
    numero: o.os_number ?? null,
    tipo: o.service_type,
    stage: o.os_stage,
    cliente_nome: o.customer_name ?? cust?.name ?? null,
    cnpj: cust?.federal_code ?? null,
    telefone: cust?.phone ?? null,
    placa: veh?.plate ?? o.vehicle_plate ?? null,
    modelo: veh?.model ?? o.vehicle_model ?? null,
    data_prevista: o.scheduled_at ?? null,
    prioridade: o.priority ?? 3,
    titulo: o.title ?? null,
    observacoes: o.description ?? null,
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}

const SELECT_COLS =
  "id, os_number, service_type, os_stage, customer_name, scheduled_at, priority, title, description, " +
  "vehicle_plate, vehicle_model, created_at, updated_at, " +
  "customer:os_customers(name, phone, federal_code), vehicles:os_vehicles(position, plate, model)";

/** Lista de OS (espelho ao vivo). RLS: o Sales enxerga via is_carbo_sales(). */
export function useOS() {
  const qc = useQueryClient();

  // Realtime: qualquer mudança na OS (criar/mover/concluir) atualiza na hora.
  useEffect(() => {
    const rt = supabase as unknown as {
      channel: (n: string) => any;
      removeChannel: (c: any) => void;
    };
    const ch = rt
      .channel("os-sales-mirror")
      .on("postgres_changes", { event: "*", schema: "licenciados", table: "service_orders" },
        () => qc.invalidateQueries({ queryKey: ["os_sales"] }))
      .on("postgres_changes", { event: "*", schema: "licenciados", table: "os_vehicles" },
        () => qc.invalidateQueries({ queryKey: ["os_sales"] }))
      .subscribe();
    return () => { rt.removeChannel(ch); };
  }, [qc]);

  return useQuery({
    queryKey: ["os_sales"],
    queryFn: async (): Promise<OSRow[]> => {
      const { data, error } = await lic()
        .from("service_orders")
        .select(SELECT_COLS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map(mapRow);
    },
  });
}

/** Cria uma OS de descarbonização na fonte de verdade (RPC os_create). */
export function useCreateOS() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovaOSInput) => {
      const isPJ = input.tipo === "b2b" || input.tipo === "frota";

      // Campos que a OS não guarda em coluna própria (placa/modelo/frota/
      // responsável) vão para a descrição — assim o Carbox os vê no detalhe.
      const extras: string[] = [];
      if (input.placa) extras.push(`Placa: ${input.placa}`);
      if (input.modelo) extras.push(`Modelo: ${input.modelo}`);
      if (input.qtd_veiculos) extras.push(`Veículos: ${input.qtd_veiculos}`);
      if (input.recorrencia && input.recorrencia !== "unica") extras.push(`Recorrência: ${input.recorrencia}`);
      if (input.responsavel) extras.push(`Responsável: ${input.responsavel}`);
      const description =
        [input.observacoes?.trim(), extras.join(" · ")].filter(Boolean).join("\n") || null;

      const { data: id, error } = await lic().rpc("os_create", {
        p_person_type: isPJ ? "pj" : "pf",
        p_customer_name: (input.cliente_nome ?? "").trim(),
        p_phone: onlyDigits(input.telefone),
        p_federal_code: isPJ ? onlyDigits(input.cnpj) : null,
        p_company: isPJ ? (input.cliente_nome ?? "").trim() || null : null,
        p_email: null,
        p_service_type: input.tipo,
        p_scheduled_at: input.data_prevista ?? null,
        p_priority: input.prioridade ?? 3,
        p_description: description,
      });
      if (error) throw error;

      // Busca o número gerado (OS-AAAA-#####) para o feedback.
      let numero: string | null = null;
      try {
        const { data: row } = await lic()
          .from("service_orders").select("os_number").eq("id", id).single();
        numero = (row?.os_number as string) ?? null;
      } catch { /* número é só cosmético no toast */ }

      return { id: id as string, numero };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["os_sales"] }); },
  });
}
