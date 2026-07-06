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
export type OsPersonType = "pf" | "pj";
// Estágios efetivos do kanban (licenciados): nova → em_execucao → concluida (+cancelada).
export type OsStage = "nova" | "em_execucao" | "concluida" | "cancelada";

// Espelha 1:1 o formulário de "Nova OS" do Licenciados (mesma tela nos dois).
export interface NovaOSInput {
  service_type: OsTipo;
  person_type: OsPersonType;
  customer_name: string;
  phone?: string | null;
  federal_code?: string | null; // CNPJ (PJ)
  company?: string | null;      // nome fantasia (PJ)
  email?: string | null;
  plate?: string | null;        // placa do veículo
  model?: string | null;        // modelo do veículo
  vehicle_year?: number | null; // ano do veículo
  scheduled_at?: string | null; // ISO; obrigatório p/ frota
}

// Cliente recorrente (autofill por telefone/CNPJ) — mesma UX do Licenciados.
export interface OsCustomerLite {
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  federal_code: string | null;
}

/** Busca cliente recorrente da OS (PF por telefone, PJ por CNPJ). */
export async function findOsCustomer(
  personType: OsPersonType, key: string,
): Promise<OsCustomerLite | null> {
  const { data, error } = await lic().rpc("os_find_customer", {
    p_person_type: personType, p_key: key.trim(),
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as OsCustomerLite) ?? null;
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
      const { data: id, error } = await lic().rpc("os_create", {
        p_person_type: input.person_type,
        p_customer_name: input.customer_name.trim(),
        p_phone: input.phone?.trim() || null,
        p_federal_code: input.federal_code?.trim() || null,
        p_company: input.company?.trim() || null,
        p_email: input.email?.trim() || null,
        p_service_type: input.service_type,
        p_vehicle_year: input.vehicle_year ?? null,
        p_plate: input.plate?.trim() || null,
        p_model: input.model?.trim() || null,
        p_scheduled_at: input.scheduled_at ?? null,
        p_priority: 3,
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
