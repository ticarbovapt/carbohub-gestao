export interface AppScreen {
  id: string;
  label: string;
  path: string;
}

export interface ScreenGroup {
  id: string;
  label: string;
  screens: AppScreen[];
}

export interface DeptFunction {
  key: string;
  label: string;
}

export interface Department {
  key: string;
  label: string;
  fullAccess?: boolean;
  functions: DeptFunction[];
}

export const DEPARTMENTS: Department[] = [
  {
    key: "command",
    label: "Command",
    functions: [],
  },
  {
    key: "ops",
    label: "Operações",
    functions: [],
  },
  {
    key: "b2b",
    label: "Vendas",
    functions: [],
  },
  {
    key: "finance",
    label: "Finance",
    functions: [],
  },
  {
    key: "growth",
    label: "Growth",
    functions: [],
  },
  {
    key: "expansao",
    label: "Expansão",
    functions: [],
  },
  {
    key: "ti_suporte",
    label: "TI / Suporte",
    fullAccess: true,
    functions: [],
  },
];

export const SCREEN_GROUPS: ScreenGroup[] = [
  {
    id: "operacional",
    label: "Operacional",
    screens: [
      { id: "dashboard", label: "Dashboard", path: "/dashboard" },
      { id: "home", label: "Home Hub", path: "/home" },
      { id: "meu-painel", label: "Meu Painel", path: "/meu-painel" },
      { id: "os", label: "Ordens de Serviço", path: "/os" },
      { id: "checklist", label: "Checklists", path: "/checklist" },
      { id: "scheduling", label: "Agendamentos", path: "/scheduling" },
      { id: "machines", label: "Máquinas", path: "/machines" },
      { id: "ops-alerts", label: "Alertas Operacionais", path: "/ops/alerts" },
    ],
  },
  {
    id: "comercial",
    label: "Comercial / Vendas",
    screens: [
      { id: "orders", label: "Controle de Pedidos", path: "/orders" },
      { id: "orders-new", label: "Novo Pedido", path: "/orders/new" },
      { id: "b2b", label: "B2B Leads", path: "/b2b" },
      { id: "b2b-funnel", label: "Funil B2B", path: "/b2b/funnel" },
      { id: "crm", label: "CRM Dashboard", path: "/crm" },
      { id: "sales-targets", label: "Metas de Vendas", path: "/sales-targets" },
      { id: "licensees", label: "Licenciados", path: "/licensees" },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    screens: [
      { id: "financeiro", label: "Financeiro", path: "/financeiro" },
      { id: "viagens", label: "Viagens e PC", path: "/viagens" },
      { id: "nfse", label: "Importação NFS-e", path: "/admin/nfse" },
    ],
  },
  {
    id: "producao",
    label: "Produção / MRP",
    screens: [
      { id: "mrp-products", label: "Produtos (MRP)", path: "/mrp/products" },
      { id: "mrp-suppliers", label: "Fornecedores MRP", path: "/mrp/suppliers" },
      { id: "skus", label: "SKUs", path: "/skus" },
      { id: "lots", label: "Lotes", path: "/lots" },
      { id: "production-orders", label: "Ordens de Produção", path: "/production-orders" },
      { id: "suprimentos", label: "Suprimentos", path: "/suprimentos" },
      { id: "purchasing", label: "Compras", path: "/purchasing" },
    ],
  },
  {
    id: "logistica",
    label: "Logística",
    screens: [
      { id: "logistics", label: "Logística", path: "/logistics" },
    ],
  },
  {
    id: "dashboards",
    label: "Dashboards",
    screens: [
      { id: "dashboard-producao", label: "Dashboard Produção", path: "/dashboards/producao" },
      { id: "dashboard-financeiro", label: "Dashboard Financeiro", path: "/dashboards/financeiro" },
      { id: "dashboard-logistica", label: "Dashboard Logística", path: "/dashboards/logistica" },
      { id: "dashboard-comercial", label: "Dashboard Comercial", path: "/dashboards/comercial" },
      { id: "dashboard-estrategico", label: "Dashboard Estratégico", path: "/dashboards/estrategico" },
    ],
  },
  {
    id: "inteligencia",
    label: "Inteligência / Rede",
    screens: [
      { id: "mapa-territorial", label: "Mapa Territorial", path: "/mapa-territorial" },
      { id: "network-map", label: "Mapa da Rede", path: "/ops/network-map" },
      { id: "licensee-ranking", label: "Ranking Licenciados", path: "/ops/licensee-ranking" },
      { id: "territory-intelligence", label: "Inteligência Territorial", path: "/ops/territory-intelligence" },
      { id: "territory-expansion", label: "Expansão Territorial", path: "/ops/territory-expansion" },
      { id: "pdv-network", label: "Rede PDV", path: "/ops/pdv-network" },
    ],
  },
  {
    id: "pdv",
    label: "PDV",
    screens: [
      { id: "pdv-dashboard", label: "PDV Dashboard", path: "/pdv/dashboard" },
      { id: "pdv-pos", label: "PDV Ponto de Venda", path: "/pdv/pos" },
      { id: "pdv-estoque", label: "PDV Estoque", path: "/pdv/estoque" },
      { id: "pdv-vendedores", label: "PDV Vendedores", path: "/pdv/vendedores" },
      { id: "pdv-ranking", label: "PDV Ranking", path: "/pdv/ranking" },
    ],
  },
  {
    id: "rh",
    label: "RH / Organização",
    screens: [
      { id: "team", label: "Equipe", path: "/team" },
      { id: "org-chart", label: "Organograma", path: "/org-chart" },
      { id: "role-matrix", label: "Matriz de Papéis", path: "/role-matrix" },
      { id: "responsibility-map", label: "Mapa de Responsabilidades", path: "/responsibility-map" },
    ],
  },
  {
    id: "admin",
    label: "Admin / Config",
    screens: [
      { id: "admin", label: "Administração", path: "/admin" },
      { id: "cockpit", label: "Cockpit Estratégico (CEO)", path: "/admin/cockpit" },
      { id: "admin-approval", label: "Aprovações", path: "/admin/approval" },
      { id: "admin-pipeline", label: "Config Pipeline", path: "/admin/pipeline" },
      { id: "admin-webhooks", label: "Config Webhooks", path: "/admin/webhooks" },
      { id: "import", label: "Importação de Dados", path: "/import" },
      { id: "governance", label: "Governança", path: "/governance" },
    ],
  },
  {
    id: "outros",
    label: "Outros",
    screens: [
      { id: "bugs", label: "Bugs", path: "/bugs" },
      { id: "ai-assistant", label: "Assistente IA", path: "/ai-assistant" },
      { id: "bling", label: "Integração Bling", path: "/integrations/bling" },
    ],
  },
];
