export type DataScope = "proprio" | "equipe" | "departamento" | "global";

export interface AppScreen {
  id: string;
  label: string;
  path: string;
}

export interface ScreenGroup {
  id: string;
  label: string;
  screens: AppScreen[];
  /** true = aparece na barra lateral principal; false = portal separado (seção "Outros" no Role Matrix) */
  inSidebar?: boolean;
}

export interface DeptFunction {
  key: string;
  label: string;
  scope: DataScope;      // view scope (o que vê)
  editScope: DataScope;  // edit scope (o que pode editar)
}

export interface Department {
  key: string;
  label: string;
  fullAccess?: boolean;
  functions: DeptFunction[];
}

export const DATA_SCOPES: { value: DataScope; label: string; description: string; color: string }[] = [
  { value: "proprio",      label: "Próprio",      description: "Vê apenas seus próprios registros",          color: "text-muted-foreground" },
  { value: "equipe",       label: "Equipe",        description: "Vê registros dos seus subordinados diretos", color: "text-blue-500" },
  { value: "departamento", label: "Departamento",  description: "Vê todos os registros do departamento",      color: "text-violet-500" },
  { value: "global",       label: "Global",        description: "Vê tudo (como admin)",                       color: "text-carbo-green" },
];

export const DEPARTMENTS: Department[] = [
  {
    key: "command",
    label: "Command",
    functions: [
      { key: "ceo",                  label: "CEO",                  scope: "global",       editScope: "global" },
      { key: "assistente_executiva", label: "Assistente Executiva", scope: "departamento", editScope: "departamento" },
    ],
  },
  {
    key: "ops",
    label: "Operações",
    functions: [
      { key: "head",        label: "Head",           scope: "global",       editScope: "global" },
      { key: "gerente",     label: "Gerente",        scope: "departamento", editScope: "departamento" },
      { key: "coordenador", label: "Coordenador(a)", scope: "departamento", editScope: "departamento" },
      { key: "supervisor",  label: "Supervisor(a)",  scope: "equipe",       editScope: "equipe" },
      { key: "staff",       label: "Colaborador",    scope: "proprio",      editScope: "proprio" },
    ],
  },
  {
    key: "cgc",
    label: "Comercial GC",
    functions: [
      { key: "head",         label: "Head",             scope: "global",  editScope: "global" },
      { key: "supervisor",   label: "Supervisor(a)",    scope: "equipe",  editScope: "equipe" },
      { key: "vendedor_b2b", label: "Vendedor GC",      scope: "proprio", editScope: "proprio" },
      { key: "vendedor_b2c", label: "Vendedor Carbozé", scope: "proprio", editScope: "proprio" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    functions: [
      { key: "head",        label: "Head",           scope: "global",       editScope: "global" },
      { key: "gerente",     label: "Gerente",        scope: "departamento", editScope: "departamento" },
      { key: "coordenador", label: "Coordenador(a)", scope: "departamento", editScope: "departamento" },
      { key: "analista",    label: "Analista",       scope: "proprio",      editScope: "proprio" },
    ],
  },
  {
    key: "growth",
    label: "Growth",
    functions: [
      { key: "head",  label: "Head",        scope: "global",  editScope: "global" },
      { key: "staff", label: "Colaborador", scope: "proprio", editScope: "proprio" },
    ],
  },
  {
    key: "expansao",
    label: "Expansão",
    functions: [
      { key: "head",  label: "Head",        scope: "global",  editScope: "global" },
      { key: "staff", label: "Colaborador", scope: "proprio", editScope: "proprio" },
    ],
  },
  {
    key: "ti_suporte",
    label: "TI / Suporte",
    functions: [
      { key: "head",  label: "Head",        scope: "global",       editScope: "global" },
      { key: "staff", label: "Colaborador", scope: "departamento", editScope: "departamento" },
    ],
  },
];

// ─── Label helpers (fonte da verdade: DEPARTMENTS acima) ──────────────────────
// Usados para exibir departamento/função do perfil de forma consistente com o
// Role Matrix em qualquer tela (ex.: dashboard de Last Login).

/** Label do departamento a partir da chave (ex.: "ops" -> "Operações"). */
export function getDepartmentLabel(key?: string | null): string {
  if (!key) return "";
  return DEPARTMENTS.find((d) => d.key === key)?.label ?? key;
}

/**
 * Label da função dentro de um departamento. O mesmo `funcao` pode ter labels
 * diferentes por departamento (ex.: "staff" = "Colaborador"), por isso depende
 * do par (departamento, função).
 */
export function getFunctionLabel(deptKey?: string | null, funcKey?: string | null): string {
  if (!funcKey) return "";
  const dept = DEPARTMENTS.find((d) => d.key === deptKey);
  const inDept = dept?.functions.find((f) => f.key === funcKey)?.label;
  if (inDept) return inDept;
  // Sem departamento (ou não encontrado): procura a função em qualquer dept.
  for (const d of DEPARTMENTS) {
    const f = d.functions.find((fn) => fn.key === funcKey);
    if (f) return f.label;
  }
  return funcKey;
}

// ── Grupos espelham exatamente os setores da barra lateral ───────────────────
// inSidebar: true  → aparece na barra lateral → mostrado no topo do Role Matrix
// inSidebar: false → portal separado (Licenciados, PDV) → seção "Portais" no Role Matrix
export const SCREEN_GROUPS: ScreenGroup[] = [
  {
    id: "dashboards",
    label: "Dash",
    inSidebar: true,
    screens: [
      { id: "dashboard",                    label: "Visão Geral",              path: "/dashboard" },
      { id: "dashboard-producao",           label: "Dashboard Produção",       path: "/dashboards/producao" },
      { id: "dashboard-financeiro",         label: "Dashboard Financeiro",     path: "/dashboards/financeiro" },
      { id: "dashboard-logistica",          label: "Dashboard Logística",      path: "/dashboards/logistica" },
      { id: "dashboard-comercial",          label: "Dashboard Comercial",      path: "/dashboards/comercial" },
      { id: "dashboard-estrategico",        label: "Dashboard Estratégico",    path: "/dashboards/estrategico" },
      { id: "dashboard-ecommerce-vendas",   label: "E-commerce",               path: "/dashboards/ecommerce/vendas-online" },
      { id: "dashboard-meta-ecommerce",     label: "Meta E-commerce",          path: "/dashboards/metas/ecommerce" },
      { id: "dashboard-meta-vendedores",    label: "Meta Vendedores",          path: "/dashboards/metas/vendedores" },
      { id: "metas-config",                 label: "Config Metas",             path: "/dashboards/metas/config" },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    inSidebar: true,
    screens: [
      { id: "meu-painel",    label: "Meu Painel",        path: "/meu-painel" },
      { id: "vendas",        label: "Vendas",            path: "/vendas" },
      { id: "orders",        label: "Pedidos (RV)",      path: "/orders" },
      { id: "orders-new",    label: "Novo Pedido",       path: "/orders/new" },
      { id: "crm",           label: "CRM",               path: "/crm" },
      { id: "sales-targets", label: "Metas de Vendas",   path: "/sales-targets" },
      { id: "licensees",     label: "Licenciados",       path: "/licensees" },
      { id: "b2b",           label: "B2B Leads",         path: "/b2b" },
      { id: "b2b-funnel",    label: "Funil B2B",         path: "/b2b/funnel" },
    ],
  },
  {
    id: "ops",
    label: "OPS",
    inSidebar: true,
    screens: [
      { id: "os",            label: "OS Descarbonização",   path: "/os" },
      { id: "ops-alerts",    label: "Alertas Operacionais", path: "/ops/alerts" },
      { id: "scheduling",    label: "Agendamentos",          path: "/scheduling" },
      { id: "machines",      label: "Máquinas",              path: "/machines" },
      { id: "checklist",     label: "Checklists",            path: "/checklist" },
    ],
  },
  {
    id: "producao",
    label: "Produção",
    inSidebar: true,
    screens: [
      { id: "production-orders", label: "Ordens de Produção", path: "/production-orders" },
      { id: "mrp-products",      label: "Produtos (MRP)",     path: "/mrp/products" },
      { id: "skus",              label: "SKUs",               path: "/skus" },
      { id: "lots",              label: "Lotes",              path: "/lots" },
      { id: "mrp-suppliers",     label: "Fornecedores MRP",   path: "/mrp/suppliers" },
      { id: "suprimentos",       label: "Suprimentos",        path: "/suprimentos" },
    ],
  },
  {
    id: "financeiro",
    label: "Finance",
    inSidebar: true,
    screens: [
      { id: "financeiro",   label: "Financeiro",          path: "/financeiro" },
      { id: "faturamento",  label: "Fila de Faturamento", path: "/financeiro/faturamento" },
      { id: "bling-nfs",    label: "Notas Fiscais",       path: "/integrations/bling/nfs" },
      { id: "viagens",      label: "Viagens & PC",        path: "/viagens" },
      { id: "logistics",    label: "Logística",           path: "/logistics" },
      { id: "purchasing",   label: "Compras",             path: "/purchasing" },
      { id: "nfse",         label: "NFS-e",               path: "/admin/nfse" },
    ],
  },
  {
    id: "equipe",
    label: "Equipe",
    inSidebar: true,
    screens: [
      { id: "team",               label: "Equipe",              path: "/team" },
      { id: "org-chart",          label: "Organograma",         path: "/org-chart" },
      { id: "role-matrix",        label: "Matriz de Papéis",    path: "/role-matrix" },
      { id: "responsibility-map", label: "Responsabilidades",   path: "/responsibility-map" },
      { id: "import",             label: "Importar Dados",      path: "/import" },
    ],
  },
  {
    id: "territorial",
    label: "Territorial",
    inSidebar: true,
    screens: [
      { id: "mapa-territorial",       label: "Mapa Territorial",     path: "/mapa-territorial" },
      { id: "network-map",            label: "Mapa da Rede",         path: "/ops/network-map" },
      { id: "licensee-ranking",       label: "Ranking Licenciados",  path: "/ops/licensee-ranking" },
      { id: "territory-intelligence", label: "Inteligência Terr.",   path: "/ops/territory-intelligence" },
      { id: "territory-expansion",    label: "Expansão Territorial", path: "/ops/territory-expansion" },
      { id: "pdv-network",            label: "Rede PDV",             path: "/ops/pdv-network" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    inSidebar: true,
    screens: [
      { id: "admin",          label: "Administração",        path: "/admin" },
      { id: "cockpit",        label: "Cockpit Estratégico",  path: "/admin/cockpit" },
      { id: "governance",     label: "Governança",           path: "/governance" },
      { id: "admin-approval", label: "Aprovações",           path: "/admin/approval" },
      { id: "admin-pipeline", label: "Config Pipeline",      path: "/admin/pipeline" },
      { id: "admin-webhooks", label: "Webhooks CRM",         path: "/admin/webhooks" },
      { id: "bling",          label: "Bling",                path: "/integrations/bling" },
      { id: "bugs",           label: "Bugs",                 path: "/bugs" },
      { id: "ai-assistant",   label: "Assistente IA",        path: "/ai-assistant" },
    ],
  },

  // ── Portais separados (fora da barra lateral) ─────────────────────────────
  {
    id: "portal_licenciado",
    label: "Portal Licenciados",
    inSidebar: false,
    screens: [
      { id: "portal-licenciado",            label: "Portal (acesso)",        path: "/licensee/dashboard" },
      { id: "portal-licenciado-pedidos",    label: "Pedidos",                path: "/licensee/pedidos" },
      { id: "portal-licenciado-creditos",   label: "Créditos",               path: "/licensee/creditos" },
      { id: "portal-licenciado-comissoes",  label: "Comissões",              path: "/licensee/comissoes" },
      { id: "portal-licenciado-produtos",   label: "Produtos",               path: "/licensee/produtos" },
      { id: "portal-licenciado-clientes",   label: "Clientes",               path: "/licensee/clientes" },
      { id: "portal-licenciado-reagentes",  label: "Reagentes",              path: "/licensee/reagentes" },
      { id: "portal-licenciado-vapt",       label: "CarboVAPT",              path: "/licensee/vapt" },
      { id: "portal-licenciado-atendimento",label: "Atendimento",            path: "/licensee/atendimentos" },
    ],
  },
  {
    id: "pdv",
    label: "PDV",
    inSidebar: false,
    screens: [
      { id: "pdv-dashboard",  label: "Dashboard PDV",    path: "/pdv/dashboard" },
      { id: "pdv-pos",        label: "Ponto de Venda",   path: "/pdv/pos" },
      { id: "pdv-estoque",    label: "Estoque PDV",      path: "/pdv/estoque" },
      { id: "pdv-vendedores", label: "Vendedores PDV",   path: "/pdv/vendedores" },
      { id: "pdv-ranking",    label: "Ranking PDV",      path: "/pdv/ranking" },
    ],
  },
];
