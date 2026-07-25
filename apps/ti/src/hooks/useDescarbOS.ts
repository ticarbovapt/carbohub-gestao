import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Criação de OS de DESCARBONIZAÇÃO a partir da venda (/vender).
//
// FONTE DE VERDADE = portal Licenciados: schema `licenciados`, tabela
// `service_orders`. A venda de descarbonização (itens kind=service) cria aqui
// uma OS pendente (sem veículo) que aparece em Descarbonização › OS e cujo
// scheduled_at alimenta o calendário de agendamentos. NÃO mexe no `crm_os`
// (sistema de OS de campo do Ops), que segue em useOS.ts.
//
// O client tipado não conhece o schema `licenciados` → cast pontual p/ any.
// ─────────────────────────────────────────────────────────────────────────────
const lic = () => (supabase as unknown as { schema: (s: string) => any }).schema("licenciados");

export type OsTipo = "b2c" | "b2b" | "frota";
export type OsPersonType = "pf" | "pj";

// Espelha o formulário de "Nova OS" do Licenciados (mesma tela nos dois).
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
  scheduled_at?: string | null; // ISO; vira o agendamento no calendário
  responsibles?: { name: string; phone?: string | null }[];
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
        p_responsibles: input.responsibles ?? [],
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
