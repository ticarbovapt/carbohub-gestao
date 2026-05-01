/**
 * Progressive Gating — validates required fields before advancing a lead's stage.
 * Plan reference: pipeline_service.validate_stage_advance
 *
 * Required fields are stored in crm_pipeline_stages.required_fields (jsonb array of column slugs).
 * Falls back to hard-coded defaults if the table has no config for that funnel+stage.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CRMLead, FunnelType } from "@/types/crm";

// ─────────────────────────────────────────────────────────────────────────────
// Default required fields per funnel+target-stage (hard-coded fallbacks)
// Admin can override these via crm_pipeline_stages table.
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_REQUIRED: Record<string, Record<string, string[]>> = {
  f1: {
    em_negociacao: ["contact_name", "contact_phone"],
    convertido:    ["contact_name", "contact_phone", "source"],
  },
  f2: {
    qualificado:   ["cnpj", "legal_name", "contact_name", "contact_phone"],
    apresentacao:  ["cnpj", "legal_name", "vehicles_per_day"],
    proposta:      ["cnpj", "legal_name", "estimated_revenue"],
    contrato:      ["cnpj", "legal_name", "estimated_revenue", "city", "state"],
    parceiro:      ["cnpj", "legal_name", "estimated_revenue"],
  },
  f3: {
    em_negociacao: ["contact_name", "contact_phone", "fleet_size", "fuel_type"],
    convertido:    ["contact_name", "contact_phone", "fleet_size", "estimated_revenue"],
  },
  f4: {
    visita_agendada: ["cnpj", "contact_name", "contact_phone", "city"],
    pedido_inicial:  ["cnpj", "contact_name", "contact_phone"],
    convertido:      ["cnpj", "contact_name", "estimated_revenue"],
  },
  f5: {
    visita_agendada: ["cnpj", "contact_name", "contact_phone"],
    convertido:      ["cnpj", "contact_name", "estimated_revenue"],
  },
  f7: {
    diagnostico:       ["cnpj", "legal_name", "contact_name", "equipment_type"],
    poc:               ["cnpj", "legal_name", "equipment_type", "notes"],
    proposta_tecnica:  ["cnpj", "legal_name", "estimated_revenue"],
    fechamento:        ["cnpj", "legal_name", "estimated_revenue", "contact_email"],
  },
  f8: {
    diagnostico:    ["cnpj", "legal_name", "contact_name", "monthly_consumption"],
    proposta_tecnica: ["cnpj", "legal_name", "estimated_revenue", "monthly_consumption"],
    fechamento:     ["cnpj", "legal_name", "estimated_revenue"],
  },
};

// Human-readable field labels for error messages
export const FIELD_LABELS: Record<string, string> = {
  contact_name:       "Nome do contato",
  contact_phone:      "Telefone / WhatsApp",
  contact_email:      "E-mail",
  cnpj:               "CNPJ",
  legal_name:         "Razão Social",
  trade_name:         "Nome Fantasia",
  city:               "Cidade",
  state:              "UF",
  estimated_revenue:  "Receita estimada",
  vehicles_per_day:   "Veículos/dia",
  fleet_size:         "Tamanho da frota",
  fuel_type:          "Tipo de combustível",
  monthly_consumption: "Consumo mensal",
  equipment_type:     "Tipo de equipamento",
  source:             "Origem do lead",
  notes:              "Observações",
};

// ─────────────────────────────────────────────────────────────────────────────
// Fetch configured required fields from DB (admin-editable)
// ─────────────────────────────────────────────────────────────────────────────
export function usePipelineStageConfig(funnelType: FunnelType) {
  return useQuery({
    queryKey: ["crm-pipeline-stages", funnelType],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_pipeline_stages")
        .select("stage_slug, required_fields")
        .eq("funnel_type", funnelType);
      // Convert to map {stage_slug → required_fields[]}
      const map: Record<string, string[]> = {};
      for (const row of data || []) {
        if (row.required_fields) map[row.stage_slug] = row.required_fields as string[];
      }
      return map;
    },
    staleTime: 5 * 60 * 1000, // refresh every 5 min
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate a lead before advancing to targetStage
// Returns array of missing field labels (empty = OK to advance)
// ─────────────────────────────────────────────────────────────────────────────
export function validateStageAdvance(
  lead: CRMLead,
  targetStage: string,
  funnelType: FunnelType,
  dbConfig: Record<string, string[]>
): string[] {
  // DB config takes priority over defaults
  const required =
    dbConfig[targetStage] ??
    DEFAULT_REQUIRED[funnelType]?.[targetStage] ??
    [];

  const missing: string[] = [];
  for (const field of required) {
    const value = (lead as Record<string, unknown>)[field];
    const isEmpty =
      value === null ||
      value === undefined ||
      value === "" ||
      (typeof value === "number" && value === 0 && field !== "probability");
    if (isEmpty) {
      missing.push(FIELD_LABELS[field] || field);
    }
  }
  return missing;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: upsert required fields for a funnel+stage
// ─────────────────────────────────────────────────────────────────────────────
export function useUpsertPipelineStage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      funnelType,
      stageSlug,
      requiredFields,
    }: {
      funnelType: string;
      stageSlug: string;
      requiredFields: string[];
    }) => {
      const { error } = await supabase.from("crm_pipeline_stages").upsert({
        funnel_type: funnelType,
        stage_slug: stageSlug,
        required_fields: requiredFields,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-pipeline-stages", vars.funnelType] });
      toast.success("Configuração de campos salva.");
    },
    onError: (e) => toast.error(`Erro: ${(e as Error).message}`),
  });
}
