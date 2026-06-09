// ─────────────────────────────────────────────────────────────────────────────
// REGRA DE ACESSO — fonte única, replicável para todos os sistemas novos.
//
// Filosofia (docs/ARQUITETURA-SEPARACAO.md §9): SEM matriz tela-a-tela e SEM
// user_roles/is_admin. Quem "manda" (vê tudo + ações de gestão) é DERIVADO do
// perfil já existente (profiles.department + profiles.funcao):
//
//   • department = command            → manda (CEO, assistente, etc.)
//   • funcao     = head (qualquer dep) → manda
//   • department = ti_suporte          → manda (head OU colaborador)
//   • senão                            → colaborador (escopo próprio)
//
// Nada novo é criado no banco — apenas lemos os perfis que já existem.
// ─────────────────────────────────────────────────────────────────────────────

export type AccessLevel = "gestor" | "colaborador";
export type DataScope = "proprio" | "equipe" | "departamento" | "global";

export interface Identity {
  department: string | null;
  funcao: string | null;
  secondary_department?: string | null;
  secondary_funcao?: string | null;
}

// "head" novo + aliases legados que também significam comando (dados antigos).
const MANDA_FUNCOES = new Set(["head", "ceo", "command"]);
const MANDA_DEPARTAMENTOS = new Set(["command", "ti_suporte"]);

/** A pessoa "manda" no sistema (vê tudo + gestão)? Derivado do perfil. */
export function seesEverything(id: Identity | null | undefined): boolean {
  if (!id) return false;
  return (
    MANDA_DEPARTAMENTOS.has(id.department ?? "") ||
    MANDA_DEPARTAMENTOS.has(id.secondary_department ?? "") ||
    MANDA_FUNCOES.has(id.funcao ?? "") ||
    MANDA_FUNCOES.has(id.secondary_funcao ?? "")
  );
}

export function levelFromIdentity(id: Identity | null | undefined): AccessLevel {
  return seesEverything(id) ? "gestor" : "colaborador";
}

export function scopeFromLevel(level: AccessLevel): DataScope {
  return level === "gestor" ? "global" : "proprio";
}

// ─────────────────────────────────────────────────────────────────────────────
// Nível CIENTE da função (carbo_functions.access_level) — a regra que manda.
// Mapa: `${department}:${function_key}` → 'gestor' | 'colaborador'.
// Manda se QUALQUER papel (primário OU secundário) for gestor, ou se o
// departamento for command/ti_suporte. Pega sempre o maior — nunca trava.
// ─────────────────────────────────────────────────────────────────────────────
export type FnAccessMap = Record<string, "gestor" | "colaborador">;

export function fnKey(dept?: string | null, fn?: string | null): string {
  return `${dept ?? ""}:${fn ?? ""}`;
}

export function isManager(id: Identity | null | undefined, fnMap?: FnAccessMap): boolean {
  if (!id) return false;
  if (
    MANDA_DEPARTAMENTOS.has(id.department ?? "") ||
    MANDA_DEPARTAMENTOS.has(id.secondary_department ?? "")
  ) return true;
  if (fnMap) {
    if (fnMap[fnKey(id.department, id.funcao)] === "gestor") return true;
    if (fnMap[fnKey(id.secondary_department, id.secondary_funcao)] === "gestor") return true;
  }
  // fallback por nome (caso o mapa não esteja carregado)
  return MANDA_FUNCOES.has(id.funcao ?? "") || MANDA_FUNCOES.has(id.secondary_funcao ?? "");
}
