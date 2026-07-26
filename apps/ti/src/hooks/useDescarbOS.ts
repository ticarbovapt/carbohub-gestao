import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Criação de OS de DESCARBONIZAÇÃO a partir da venda (/vender).
//
// FONTE DE VERDADE = portal Licenciados: schema `licenciados`, tabela
// `service_orders`. A venda (itens kind=service) cria uma OS com UMA VAGA DE
// VEÍCULO por unidade vendida — pagas e bonificadas —, cada vaga com o seu
// porte. As vagas nascem vazias; o Carbox preenche placa/modelo/ano ao executar.
// O scheduled_at alimenta o calendário de agendamentos.
//
// NÃO mexe no `crm_os` (OS de campo do Ops), que segue em useOS.ts.
//
// O client tipado não conhece o schema `licenciados` → cast pontual p/ any.
// ─────────────────────────────────────────────────────────────────────────────
const lic = () => (supabase as unknown as { schema: (s: string) => any }).schema("licenciados");

export type OsTipo = "b2c" | "b2b" | "frota";
export type OsPersonType = "pf" | "pj";

export interface OSFromSaleInput {
  service_type: OsTipo;
  person_type: OsPersonType;
  customer_name: string;
  phone?: string | null;
  federal_code?: string | null;
  company?: string | null;
  email?: string | null;
  scheduled_at?: string | null;
  /** [{porte, qty, bonus}] — cada unidade vira uma vaga de veículo. */
  items: { porte: string; qty: number; bonus: number }[];
  responsibles?: { name: string; phone?: string | null }[];
  sale_order_id?: string | null;
  sale_order_number?: string | null;
  sale_total?: number | null;
}

export function useCreateOSFromSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OSFromSaleInput) => {
      const { data: id, error } = await lic().rpc("os_create_from_sale", {
        p_person_type:       input.person_type,
        p_customer_name:     input.customer_name.trim(),
        p_phone:             input.phone?.trim() || null,
        p_federal_code:      input.federal_code?.trim() || null,
        p_company:           input.company?.trim() || null,
        p_email:             input.email?.trim() || null,
        p_service_type:      input.service_type,
        p_scheduled_at:      input.scheduled_at ?? null,
        p_items:             input.items,
        p_responsibles:      input.responsibles ?? [],
        p_sale_order_id:     input.sale_order_id ?? null,
        p_sale_order_number: input.sale_order_number ?? null,
        p_sale_total:        input.sale_total ?? null,
        p_priority:          3,
      });
      if (error) throw error;

      // Número gerado (OS-AAAA-#####) + quantas vagas nasceram, para o toast.
      let numero: string | null = null;
      let vagas = 0;
      try {
        const { data: row } = await lic()
          .from("service_orders")
          .select("os_number, vehicles:os_vehicles(id)")
          .eq("id", id).single();
        numero = (row?.os_number as string) ?? null;
        vagas = Array.isArray(row?.vehicles) ? row.vehicles.length : 0;
      } catch { /* cosmético */ }

      return { id: id as string, numero, vagas };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["os_sales"] }); },
  });
}
