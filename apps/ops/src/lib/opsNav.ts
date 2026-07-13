import {
  LayoutDashboard, Factory, BarChart3, Package, Boxes, Layers, Building2,
  Warehouse, ShoppingCart, PackagePlus, Wallet, Receipt, FileText, Truck,
  Plane, ClipboardList, Calendar, Cog, UserCheck, Bell, TrendingUp, Target, Link2, ShoppingBag,
  type LucideIcon,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Estrutura de navegação do Carbo Ops — caminhos pt-BR padronizados.
// Cada área é autossuficiente e tem seu próprio dashboard (sem "Dash" genérico).
// `ready` marca telas já portadas; as demais mostram placeholder "em breve".
// As telas serão portadas 1:1 do Carbo Controle, por etapas.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpsNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  ready?: boolean;
  /** Marca ativo só na rota exata — evita acender junto com sub-rotas irmãs. */
  end?: boolean;
  /** Origem no Controle (referência para o port fiel). */
  from?: string;
  /** Tela espelhada do Sales (só visualização). */
  mirror?: boolean;
  /**
   * Tela migrada para o Carbo Finanças. Permanece listada (não apagada),
   * porém travada: cadeado, não clicável e jogada para o fim da sidebar.
   */
  locked?: boolean;
}
export interface OpsNavGroup {
  label: string;
  items: OpsNavItem[];
  /** Grupo inteiro travado (domínio migrado para o Carbo Finanças). */
  locked?: boolean;
}

export const OPS_HOME: OpsNavItem = { path: "/", label: "Início", icon: LayoutDashboard, ready: true };

export const OPS_GROUPS: OpsNavGroup[] = [
  {
    label: "Produção",
    items: [
      { path: "/producao/ordens", label: "Ordens de Produção", icon: Factory, from: "/production-orders", ready: true },
      { path: "/producao/dashboard", label: "Dashboard de Produção", icon: BarChart3, from: "/dashboards/producao", ready: true },
      { path: "/producao/produtos", label: "Produtos (MRP)", icon: Package, from: "/mrp/products", ready: true },
      { path: "/producao/skus", label: "SKUs", icon: Boxes, from: "/skus", ready: true },
      { path: "/producao/lotes", label: "Lotes", icon: Layers, from: "/lots", ready: true },
      { path: "/producao/fornecedores", label: "Fornecedores", icon: Building2, from: "/mrp/suppliers", ready: true },
    ],
  },
  {
    label: "Estoque",
    items: [
      { path: "/estoque", label: "Todos os Hubs", icon: Warehouse, from: "warehouse_stock", ready: true },
      { path: "/estoque/hub-natal", label: "Hub Natal", icon: Warehouse, from: "warehouse_stock", ready: true },
      { path: "/estoque/cd-sp-loghouse", label: "CD SP LogHouse", icon: Warehouse, from: "warehouse_stock", ready: true },
      { path: "/estoque/cd-sp-vendas", label: "CD SP Vendas", icon: Warehouse, from: "warehouse_stock", ready: true },
      { path: "/estoque/cd-bling", label: "CD Bling", icon: Warehouse, from: "warehouse_stock", ready: true },
      { path: "/suprimentos", label: "Suprimentos", icon: PackagePlus, from: "/suprimentos", ready: true },
    ],
  },
  {
    label: "Compras",
    items: [
      // Só a Requisição de Compra fica no Ops; o resto do fluxo está no Finanças.
      { path: "/compras", label: "Requisição de Compra", icon: ShoppingCart, from: "/purchasing", ready: true },
    ],
  },
  {
    label: "Logística",
    items: [
      { path: "/logistica/pos-venda", label: "Rastreio de venda", icon: ShoppingBag, from: "carboze_orders", ready: true },
      { path: "/logistica", label: "Logística", icon: Truck, from: "/logistics", ready: true, end: true },
      { path: "/logistica/viagens", label: "Viagens & PC", icon: Plane, from: "/viagens", ready: true },
      { path: "/logistica/dashboard", label: "Dashboard de Logística", icon: BarChart3, from: "/dashboards/logistica", ready: true },
    ],
  },
  {
    label: "Operação de Campo",
    items: [
      { path: "/campo/os", label: "OS Descarbonização", icon: ClipboardList, from: "/os", ready: true },
      { path: "/campo/agendamentos", label: "Agendamentos", icon: Calendar, from: "/scheduling", ready: true },
      { path: "/campo/maquinas", label: "Máquinas", icon: Cog, from: "/machines", ready: true },
      { path: "/campo/checklists", label: "Checklists", icon: UserCheck, from: "/checklist", ready: true },
      { path: "/campo/alertas", label: "Alertas Operacionais", icon: Bell, from: "/ops/alerts", ready: true },
    ],
  },
  {
    label: "Acompanhamento (Vendas)",
    items: [
      { path: "/acompanhamento/comercial", label: "Dashboard Comercial", icon: TrendingUp, from: "/dashboards/comercial", mirror: true, ready: true },
      { path: "/acompanhamento/metas", label: "Metas de Vendedores", icon: Target, from: "/dashboards/metas/vendedores", mirror: true, ready: true },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  // Domínio migrado para o Carbo Finanças. Mantido aqui (não apagado), porém
  // TRAVADO: cadeado, não clicável e no fim da sidebar. Remover quando o
  // Finanças assumir 100% destas telas.
  // ───────────────────────────────────────────────────────────────────────────
  {
    label: "Financeiro",
    locked: true,
    items: [
      { path: "/financeiro", label: "Financeiro", icon: Wallet, from: "/financeiro", ready: true, locked: true },
      { path: "/financeiro/faturamento", label: "Fila de Faturamento", icon: Receipt, from: "/financeiro/faturamento", ready: true, locked: true },
      { path: "/financeiro/notas-fiscais", label: "Notas Fiscais", icon: FileText, from: "/integrations/bling/nfs", ready: true, locked: true },
      { path: "/financeiro/nfse", label: "NFSe", icon: FileText, from: "/admin/nfse", ready: true, locked: true },
      { path: "/financeiro/dashboard", label: "Dashboard Financeiro", icon: BarChart3, from: "/dashboards/financeiro", ready: true, locked: true },
    ],
  },
  {
    label: "Integrações",
    locked: true,
    items: [
      { path: "/integracoes/bling", label: "Bling ERP", icon: Link2, from: "/integrations/bling", ready: true, locked: true },
    ],
  },
];

// Lista achatada (para gerar rotas no App).
export const OPS_ALL_ITEMS: OpsNavItem[] = OPS_GROUPS.flatMap((g) => g.items);
