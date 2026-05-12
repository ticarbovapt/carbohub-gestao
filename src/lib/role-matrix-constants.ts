/**
 * role-matrix-constants.ts
 * Constantes e helpers da Matriz de Autorização — compartilhados entre
 * RoleMatrix.tsx e AccessConfigDialog.tsx
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Access = "full" | "read" | "own" | "none";

export interface FeatureRow {
  module: string;
  feature: string;
  ceo: Access;
  gestor_adm: Access;
  gestor_fin: Access;
  gestor_compras: Access;
  operador_fiscal: Access;
  vendedor: Access;
  operador: Access;
  suporte: Access;
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export const ROLES = [
  { key: "ceo",            label: "CEO",                color: "bg-purple-500",   desc: "Acesso total ao sistema" },
  { key: "gestor_adm",     label: "Gestor ADM",         color: "bg-blue-500",     desc: "Gestão administrativa e comercial" },
  { key: "gestor_fin",     label: "Gestor Financeiro",  color: "bg-emerald-500",  desc: "Financeiro, comissões, faturamento" },
  { key: "gestor_compras", label: "Gestor Compras/Ops", color: "bg-amber-500",    desc: "Suprimentos, produção, logística" },
  { key: "operador_fiscal",label: "Operador Fiscal",    color: "bg-cyan-500",     desc: "Emissão NF, expedição, rastreio" },
  { key: "vendedor",       label: "Vendedor",           color: "bg-carbo-green",  desc: "Criar pedidos, ver leads B2B" },
  { key: "operador",       label: "Operador",           color: "bg-gray-500",     desc: "Executar etapas operacionais" },
  { key: "suporte",        label: "Suporte & TI",       color: "bg-cyan-500",     desc: "Acesso completo para bugs e melhorias" },
] as const;

export type RoleKey = typeof ROLES[number]["key"];

// Mapeia CarboRole (DB) → RoleKey da MATRIX estática
export const ROLE_KEY_MAP: Record<string, RoleKey> = {
  "ceo":              "ceo",
  "gestor_adm":       "gestor_adm",
  "gestor_fin":       "gestor_fin",
  "gestor_compras":   "gestor_compras",
  "operador_fiscal":  "operador_fiscal",
  "vendedor":         "vendedor",
  "operador":         "operador",
  // Aliases exibidos no CarboRolesManager
  "Admin Estratégico (CEO)":    "ceo",
  "Gestor Administrativo":      "gestor_adm",
  "Gestor Financeiro":          "gestor_fin",
  "Gestor Compras & Logística": "gestor_compras",
  "Operador Fiscal":            "operador_fiscal",
  "Operador":                   "operador",
  "suporte":                    "suporte",
  "Suporte & TI":               "suporte",
};

// ─── Matrix ───────────────────────────────────────────────────────────────────

export const MATRIX: FeatureRow[] = [
  { module: "Dashboard",      feature: "Home / KPIs gerais",           ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"read",  operador_fiscal:"read", vendedor:"read", operador:"read", suporte:"full" },
  { module: "Dashboard",      feature: "Cockpit Estratégico",          ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Pedidos",        feature: "Ver lista de pedidos",         ceo:"full", gestor_adm:"full",  gestor_fin:"full",  gestor_compras:"read",  operador_fiscal:"read", vendedor:"own",  operador:"none", suporte:"full" },
  { module: "Pedidos",        feature: "Criar pedido (RV)",            ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none", suporte:"full" },
  { module: "Pedidos",        feature: "Editar / alterar status",      ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"read",  operador_fiscal:"full", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Pedidos",        feature: "Ver comissão e dados fiscais", ceo:"full", gestor_adm:"full",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"full", vendedor:"own",  operador:"none", suporte:"full" },
  { module: "Funil B2B",      feature: "Ver leads",                    ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none", suporte:"full" },
  { module: "Funil B2B",      feature: "Criar / avançar lead",         ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none", suporte:"full" },
  { module: "Funil B2B",      feature: "Converter lead em pedido",     ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none", suporte:"full" },
  { module: "Metas",          feature: "Ver metas de vendas",          ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"own",  operador:"none", suporte:"full" },
  { module: "Metas",          feature: "Criar / editar metas",         ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Produção (OP)",  feature: "Ver Ordens de Produção",       ceo:"full", gestor_adm:"read",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full", suporte:"full" },
  { module: "Produção (OP)",  feature: "Criar / confirmar OP",         ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full", suporte:"full" },
  { module: "Serviços (OS)",  feature: "Ver Ordens de Serviço",        ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full", suporte:"full" },
  { module: "Serviços (OS)",  feature: "Criar / executar OS",          ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full", suporte:"full" },
  { module: "Suprimentos",    feature: "Ver estoque",                  ceo:"full", gestor_adm:"read",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"read", suporte:"full" },
  { module: "Suprimentos",    feature: "Movimentar estoque",           ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full", suporte:"full" },
  { module: "Suprimentos",    feature: "Política de estoque mínimo",   ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Compras",        feature: "Requisições de compra",        ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"full",  operador_fiscal:"read", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Compras",        feature: "Aprovar RC / emitir PO",       ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Compras",        feature: "Receber e dar entrada NF",     ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"full", vendedor:"none", operador:"full", suporte:"full" },
  { module: "Financeiro",     feature: "Ver relatórios financeiros",   ceo:"full", gestor_adm:"read",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"read", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Financeiro",     feature: "Lançar / aprovar pagamentos",  ceo:"full", gestor_adm:"none",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Licenciados",    feature: "Ver rede de licenciados",      ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none", suporte:"full" },
  { module: "Licenciados",    feature: "Criar / editar licenciados",   ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Time & Admin",   feature: "Gerenciar membros",            ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Time & Admin",   feature: "Importar time em massa",       ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Time & Admin",   feature: "Matriz de permissões",         ceo:"full", gestor_adm:"read",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Integrações",    feature: "Bling ERP",                    ceo:"full", gestor_adm:"full",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
  { module: "Governança",     feature: "Log de auditoria / governança",ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none", suporte:"full" },
];

export const MODULES = [...new Set(MATRIX.map((r) => r.module))];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const PRIORITY: Record<Access, number> = { full: 3, own: 2, read: 1, none: 0 };

export const ACCESS_LABEL: Record<Access, string> = {
  full: "Acesso total",
  read: "Somente leitura",
  own:  "Apenas próprios",
  none: "Sem acesso",
};

export function getEffectiveAccess(roleKeys: RoleKey[], feature: FeatureRow): Access {
  let best: Access = "none";
  for (const rk of roleKeys) {
    const a = feature[rk] as Access;
    if (PRIORITY[a] > PRIORITY[best]) best = a;
  }
  return best;
}
