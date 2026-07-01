// ─────────────────────────────────────────────────────────────────────────────
// Modelo de acesso do CRM
//
// Filosofia (ver docs/ARQUITETURA-SEPARACAO.md §9):
//   - SEM matriz tela-a-tela. O nível de acesso decide tudo.
//   - CAMADA 2 (nível no sistema): "gestor" vê tudo + botões de gestão;
//     "membro" vê o operacional do próprio escopo, sem esses botões.
//   - CAMADA 3 (escopo de dado): reaproveitada do sistema atual
//     (proprio | equipe | departamento | global).
//   - Crescimento futuro = adicionar CAPABILITIES aqui, NUNCA telas numa matriz.
//
// Este arquivo é o MANIFESTO do CRM. O futuro app Admin importa CRM_MANIFEST
// para se espelhar — adicionar uma capability aqui aparece no Admin automático.
// ─────────────────────────────────────────────────────────────────────────────

/** Nível da pessoa dentro do CRM (Camada 2). */
export type AccessLevel = "gestor" | "membro";

/** Escopo de visibilidade de dados (Camada 3) — herdado do modelo atual. */
export type DataScope = "proprio" | "equipe" | "departamento" | "global";

/** Identidade mínima que o CRM recebe do CORE (profiles). */
export interface Identity {
  department: string | null;
  funcao: string | null;
  secondary_department?: string | null;
  secondary_funcao?: string | null;
}

// ── Capabilities: permissões nomeadas, poucas e semânticas ───────────────────
// Cada capability lista os NÍVEIS que a possuem. É aqui que o sistema cresce.
export const CAPABILITIES = {
  ver_todos_leads:      ["gestor"],
  reatribuir_lead:      ["gestor"],
  filtrar_por_vendedor: ["gestor"],
  editar_metas:         ["gestor"],
  exportar_relatorio:   ["gestor"],
} as const satisfies Record<string, readonly AccessLevel[]>;

export type Capability = keyof typeof CAPABILITIES;

// ── Manifesto do CRM (o que o Admin espelha) ─────────────────────────────────
export const CRM_MANIFEST = {
  system: "crm",
  label: "CRM",
  levels: ["gestor", "membro"] as AccessLevel[],
  capabilities: CAPABILITIES,
  screens: [
    { id: "crm-leads", label: "Leads / Kanban", path: "/leads" },
  ],
} as const;

// ── Derivação do nível a partir da identidade (Camada 1 → 2) ─────────────────
// Funções/departamentos de comando enxergam tudo. O resto é membro.
// (espelha a hierarquia do sistema atual: head/ceo/command/ti = gestão)
const GESTOR_FUNCOES = new Set(["head", "ceo", "command"]);
const GESTOR_DEPARTAMENTOS = new Set(["command", "ti_suporte"]);

export function levelFromIdentity(id: Identity | null | undefined): AccessLevel {
  if (!id) return "membro";
  const isGestor =
    GESTOR_DEPARTAMENTOS.has(id.department ?? "") ||
    GESTOR_DEPARTAMENTOS.has(id.secondary_department ?? "") ||
    GESTOR_FUNCOES.has(id.funcao ?? "") ||
    GESTOR_FUNCOES.has(id.secondary_funcao ?? "");
  return isGestor ? "gestor" : "membro";
}

/** Escopo de dado derivado do nível (gestor vê tudo; membro só o próprio). */
export function scopeFromLevel(level: AccessLevel): DataScope {
  return level === "gestor" ? "global" : "proprio";
}

// ── Nível CIENTE da função (carbo_functions.access_level) — a flag do Admin ──
// Mapa `${department}:${function_key}` → 'gestor' | 'colaborador'. É o que o
// Admin controla na tela Estrutura. Espelha public.carbo_is_gestor no banco:
// gestor = command/ti_suporte OU access_level='gestor' (papel primário/secundário).
export type FnAccessMap = Record<string, "gestor" | "colaborador">;

export function fnKey(dept?: string | null, fn?: string | null): string {
  return `${dept ?? ""}:${fn ?? ""}`;
}

/** A pessoa é gestor? Fonte ÚNICA = a flag do Admin (access_level da função,
 *  papel primário OU secundário). SEM hardcode de cargo: command/head/TI são
 *  gestor porque estão marcados gestor no Admin, não por regra fixa no código.
 *  Espelha public.carbo_is_gestor no banco. */
export function isManager(id: Identity | null | undefined, fnMap?: FnAccessMap): boolean {
  if (!id || !fnMap) return false;
  return (
    fnMap[fnKey(id.department, id.funcao)] === "gestor" ||
    fnMap[fnKey(id.secondary_department, id.secondary_funcao)] === "gestor"
  );
}

/** A pessoa (por nível) tem a capability? */
export function can(level: AccessLevel, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly AccessLevel[]).includes(level);
}
