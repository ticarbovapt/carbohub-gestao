import type { Database } from "@/integrations/supabase/types";

export type DepartmentType = Database["public"]["Enums"]["department_type"];

// Squad nomenclature — matches the Carbo ecosystem hierarchy
export const SQUAD_DEPARTMENTS: { value: DepartmentType; label: string; prefix: string }[] = [
  { value: "command",                    label: "Command",      prefix: "cmd" },
  { value: "ops",                        label: "Operações",    prefix: "ops" },
  { value: "growth",                     label: "Growth",       prefix: "gro" },
  { value: "expansao",                   label: "Expansão",     prefix: "exp" },
  { value: "b2b",                        label: "Vendas",       prefix: "vnd" },
  { value: "finance",                    label: "Finance",      prefix: "fin" },
  { value: "ti_suporte" as DepartmentType, label: "TI / Suporte", prefix: "tis" },
];

// All departments = only squads
export const ALL_DEPARTMENTS = SQUAD_DEPARTMENTS;

// Label map for display
export const DEPARTMENT_LABELS: Record<string, string> = {
  command: "Command",
  ops: "Operações",
  growth: "Growth",
  expansao: "Expansão",
  b2b: "Vendas",
  finance: "Finance",
  ti_suporte: "TI / Suporte",
};
