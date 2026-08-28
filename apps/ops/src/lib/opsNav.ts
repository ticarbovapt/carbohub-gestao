import {
  LayoutDashboard, Factory, BarChart3, Package, Boxes, Layers, Building2,
  ShoppingCart, PackagePlus, Truck,
  Plane, ClipboardList, Calendar, Cog, Bell, Target, ShoppingBag,
  Repeat,
  type LucideIcon,
  PackageCheck, MessagesSquare,
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
      // ⚠️ UMA entrada para as quatro telas de cadastro (Produtos, SKUs, Lotes,
      // Fornecedores). Elas viraram abas dentro de `/producao/mrp/:aba` — as
      // telas não mudaram, só deixaram de ocupar quatro linhas da sidebar para
      // responder à mesma pergunta ("o que existe no cadastro").
      //
      // Os caminhos antigos continuam vivos como redirect no App.tsx: link
      // colado no chat e favorito de quem já usava não podem morrer por causa
      // de uma reorganização de menu.
      { path: "/producao/mrp", label: "MRP", icon: Package, from: "/mrp/products", ready: true },
    ],
  },
  {
    // As telas por hub saíram: a de Suprimentos mostra o mesmo saldo e ainda
    // traz movimentações, transferências e estatísticas — é superconjunto,
    // não equivalente. Cinco entradas na sidebar para um dado que já cabe
    // numa só era ruído.
    label: "Suprimentos",
    items: [
      { path: "/suprimentos", label: "Suprimentos", icon: PackagePlus, from: "/suprimentos", ready: true },
      { path: "/suprimentos/vendedores", label: "Estoque dos Vendedores", icon: PackageCheck, from: "/suprimentos/vendedores", ready: true },
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
      { path: "/logistica/recorrencias", label: "Vendas de Recorrência", icon: Repeat, from: "carboze_orders", ready: true },
      // Espelho da tela do admin — arquivos byte a byte idênticos aos de lá.
      { path: "/logistica/esteira", label: "Esteira do On-line", icon: PackageCheck, from: "bling2_esteira", ready: true },
      { path: "/logistica", label: "Logística", icon: Truck, from: "/logistics", ready: true, end: true },
      { path: "/logistica/viagens", label: "Viagens & PC", icon: Plane, from: "/viagens", ready: true },
    ],
  },
  {
    label: "Operação de Campo",
    items: [
      { path: "/campo/os", label: "OS Descarbonização", icon: ClipboardList, from: "/os", ready: true },
      { path: "/campo/agendamentos", label: "Agendamentos", icon: Calendar, from: "/scheduling", ready: true },
      { path: "/campo/maquinas", label: "Máquinas", icon: Cog, from: "/machines", ready: true },
      { path: "/campo/alertas", label: "Alertas Operacionais", icon: Bell, from: "/ops/alerts", ready: true },
    ],
  },
  {
    label: "Acompanhamento (Vendas)",
    items: [
      { path: "/acompanhamento/metas", label: "Metas de Vendedores", icon: Target, from: "/dashboards/metas/vendedores", mirror: true, ready: true },
    ],
  },
];

// Lista achatada (para gerar rotas no App).
export const OPS_ALL_ITEMS: OpsNavItem[] = OPS_GROUPS.flatMap((g) => g.items);
