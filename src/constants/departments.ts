import type { Database } from "@/integrations/supabase/types";

export type DepartmentType = Database["public"]["Enums"]["department_type"];

// Squad nomenclature — matches the Carbo ecosystem hierarchy
export const SQUAD_DEPARTMENTS: { value: DepartmentType; label: string; prefix: string }[] = [
  { value: "command", label: "Command", prefix: "cmd" },
  { value: "ops", label: "OPS", prefix: "ops" },
  { value: "growth", label: "Growth", prefix: "gro" },
  { value: "expansao", label: "Expansão", prefix: "exp" },
  { value: "b2b", label: "B2B", prefix: "b2b" },
  { value: "finance", label: "Finance", prefix: "fin" },
];

// All departments = only squads
export const ALL_DEPARTMENTS = SQUAD_DEPARTMENTS;

// Label map for display
export const DEPARTMENT_LABELS: Record<string, string> = {
  command: "Command",
  ops: "OPS",
  growth: "Growth",
  expansao: "Expansão",
  b2b: "B2B",
  finance: "Finance",
};
