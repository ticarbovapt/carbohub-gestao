import type { Database } from "@/integrations/supabase/types";

export type DepartmentType = Database["public"]["Enums"]["department_type"];

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH FOR DEPARTMENTS
//
// To add a new department: add ONE entry here.
// To rename a label:       change label here (or via the UI → Matriz de Acesso).
// NEVER change `key` — it is the value stored in the DB and must stay stable.
// ─────────────────────────────────────────────────────────────────────────────

export interface DepartmentConfig {
  key: string;           // DB value — NEVER changes
  label: string;         // Default display name (can be overridden via DB)
  color: string;         // Hex color for org chart, badges, etc.
  usernamePrefix: string; // Prefix for auto-generated usernames (3 chars, uppercase)
  order: number;         // Display order across the app
}

export const DEPARTMENT_CONFIGS: DepartmentConfig[] = [
  { key: "command",    label: "Command",      color: "#6366f1", usernamePrefix: "COM", order: 1 },
  { key: "finance",    label: "Finance",      color: "#f59e0b", usernamePrefix: "FIN", order: 2 },
  { key: "growth",     label: "Growth",       color: "#22c55e", usernamePrefix: "GRO", order: 3 },
  { key: "b2b",        label: "Vendas",       color: "#ec4899", usernamePrefix: "B2B", order: 4 },
  { key: "ops",        label: "Operações",    color: "#3b82f6", usernamePrefix: "OPS", order: 5 },
  { key: "expansao",   label: "Expansão",     color: "#8b5cf6", usernamePrefix: "EXP", order: 6 },
  { key: "ti_suporte", label: "TI / Suporte", color: "#64748b", usernamePrefix: "TI",  order: 7 },
];

// ─── Derived maps — do NOT define these manually anywhere else ────────────────

/** key → default label  (ex: "ops" → "Operações") */
export const DEPARTMENT_LABELS: Record<string, string> =
  Object.fromEntries(DEPARTMENT_CONFIGS.map((d) => [d.key, d.label]));

/** key → hex color  (ex: "ops" → "#3b82f6") */
export const DEPARTMENT_COLORS: Record<string, string> =
  Object.fromEntries(DEPARTMENT_CONFIGS.map((d) => [d.key, d.color]));

/** key → username prefix  (ex: "ops" → "OPS") */
export const DEPARTMENT_USERNAME_PREFIX: Record<string, string> =
  Object.fromEntries(DEPARTMENT_CONFIGS.map((d) => [d.key, d.usernamePrefix]));

/** Ordered list of keys for display  (ex: ["command", "finance", ...]) */
export const DEPARTMENT_ORDER: string[] =
  [...DEPARTMENT_CONFIGS].sort((a, b) => a.order - b.order).map((d) => d.key);

/** Drop-down options (value = key, label = display name) */
export const SQUAD_DEPARTMENTS: { value: DepartmentType; label: string; prefix: string }[] =
  [...DEPARTMENT_CONFIGS].sort((a, b) => a.order - b.order).map((d) => ({
    value: d.key as DepartmentType,
    label: d.label,
    prefix: d.usernamePrefix.toLowerCase(),
  }));

export const ALL_DEPARTMENTS = SQUAD_DEPARTMENTS;

// ─── Normalization map ────────────────────────────────────────────────────────
// Maps ANY known alias of a department (label, prefix, legacy display name) → key.
// Built automatically — no manual maintenance needed when a label changes.
export const DEPT_NORMALIZE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const d of DEPARTMENT_CONFIGS) {
    map[d.key]                      = d.key;  // ops → ops
    map[d.label]                    = d.key;  // Operações → ops
    map[d.label.toUpperCase()]      = d.key;  // OPERAÇÕES → ops
    map[d.usernamePrefix]           = d.key;  // OPS → ops
    map[d.usernamePrefix.toLowerCase()] = d.key; // ops → ops (already there, no harm)
  }
  // Legacy aliases that existed before (keeps old data working)
  map["Growth & B2B"] = "growth";
  map["Vendas"]       = "b2b";
  return map;
})();

/** Resolve any dept string (key, label, prefix, legacy) to the canonical key. */
export function normalizeDeptKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return DEPT_NORMALIZE[raw] ?? DEPT_NORMALIZE[raw.toLowerCase()] ?? raw.toLowerCase();
}

/** Get display label for a dept key, with optional DB overrides merged in. */
export function getDeptLabel(key: string | null | undefined, overrides?: Record<string, string>): string {
  if (!key) return "—";
  return overrides?.[key] ?? DEPARTMENT_LABELS[key] ?? key;
}

/** Get hex color for a dept key. Falls back to neutral gray. */
export function getDeptColorByKey(key: string | null | undefined): string {
  if (!key) return "#64748b";
  return DEPARTMENT_COLORS[key] ?? "#64748b";
}
