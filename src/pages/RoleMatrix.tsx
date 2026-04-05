import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Shield, Eye, Wrench, CheckCircle, XCircle } from "lucide-react";

// ─── Role definitions ──────────────────────────────────────────────────────

const ROLES = [
  { key: "ceo",            label: "CEO",               color: "bg-purple-500",   desc: "Acesso total ao sistema" },
  { key: "gestor_adm",     label: "Gestor ADM",        color: "bg-blue-500",     desc: "Gestão administrativa e comercial" },
  { key: "gestor_fin",     label: "Gestor Financeiro", color: "bg-emerald-500",  desc: "Financeiro, comissões, faturamento" },
  { key: "gestor_compras", label: "Gestor Compras/Ops",color: "bg-amber-500",    desc: "Suprimentos, produção, logística" },
  { key: "operador_fiscal",label: "Operador Fiscal",   color: "bg-cyan-500",     desc: "Emissão NF, expedição, rastreio" },
  { key: "vendedor",       label: "Vendedor",          color: "bg-carbo-green",  desc: "Criar pedidos, ver leads B2B" },
  { key: "operador",       label: "Operador",          color: "bg-gray-500",     desc: "Executar etapas operacionais" },
] as const;

type RoleKey = typeof ROLES[number]["key"];

// ─── Feature/Page access matrix ────────────────────────────────────────────

type Access = "full" | "read" | "none" | "own";

interface FeatureRow {
  module: string;
  feature: string;
  ceo: Access;
  gestor_adm: Access;
  gestor_fin: Access;
  gestor_compras: Access;
  operador_fiscal: Access;
  vendedor: Access;
  operador: Access;
}

const MATRIX: FeatureRow[] = [
  // Dashboard & Home
  { module: "Dashboard",      feature: "Home / KPIs gerais",           ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"read",  operador_fiscal:"read", vendedor:"read", operador:"read" },
  { module: "Dashboard",      feature: "Cockpit Estratégico",          ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  // Pedidos / RV
  { module: "Pedidos",        feature: "Ver lista de pedidos",         ceo:"full", gestor_adm:"full",  gestor_fin:"full",  gestor_compras:"read",  operador_fiscal:"read", vendedor:"own",  operador:"none" },
  { module: "Pedidos",        feature: "Criar pedido (RV)",            ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none" },
  { module: "Pedidos",        feature: "Editar / alterar status",      ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"read",  operador_fiscal:"full", vendedor:"none", operador:"none" },
  { module: "Pedidos",        feature: "Ver comissão e dados fiscais", ceo:"full", gestor_adm:"full",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"full", vendedor:"own",  operador:"none" },
  // B2B / Funil
  { module: "Funil B2B",      feature: "Ver leads",                    ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none" },
  { module: "Funil B2B",      feature: "Criar / avançar lead",         ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none" },
  { module: "Funil B2B",      feature: "Converter lead em pedido",     ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none" },
  // Metas
  { module: "Metas",          feature: "Ver metas de vendas",          ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"own",  operador:"none" },
  { module: "Metas",          feature: "Criar / editar metas",         ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  // Produção
  { module: "Produção (OP)",  feature: "Ver Ordens de Produção",       ceo:"full", gestor_adm:"read",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full" },
  { module: "Produção (OP)",  feature: "Criar / confirmar OP",         ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full" },
  // OS
  { module: "Serviços (OS)",  feature: "Ver Ordens de Serviço",        ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full" },
  { module: "Serviços (OS)",  feature: "Criar / executar OS",          ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full" },
  // Suprimentos
  { module: "Suprimentos",    feature: "Ver estoque",                  ceo:"full", gestor_adm:"read",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"read" },
  { module: "Suprimentos",    feature: "Movimentar estoque",           ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full" },
  { module: "Suprimentos",    feature: "Política de estoque mínimo",   ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  // Compras
  { module: "Compras",        feature: "Requisições de compra",        ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"full",  operador_fiscal:"read", vendedor:"none", operador:"none" },
  { module: "Compras",        feature: "Aprovar RC / emitir PO",       ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Compras",        feature: "Receber e dar entrada NF",     ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"full", vendedor:"none", operador:"full" },
  // Financeiro
  { module: "Financeiro",     feature: "Ver relatórios financeiros",   ceo:"full", gestor_adm:"read",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"read", vendedor:"none", operador:"none" },
  { module: "Financeiro",     feature: "Lançar / aprovar pagamentos",  ceo:"full", gestor_adm:"none",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  // Licenciados
  { module: "Licenciados",    feature: "Ver rede de licenciados",      ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none" },
  { module: "Licenciados",    feature: "Criar / editar licenciados",   ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  // Time / Admin
  { module: "Time & Admin",   feature: "Gerenciar membros",            ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Time & Admin",   feature: "Importar time em massa",       ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Time & Admin",   feature: "Matriz de permissões",         ceo:"full", gestor_adm:"read",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  // Integrações
  { module: "Integrações",    feature: "Bling ERP",                    ceo:"full", gestor_adm:"full",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Governança",     feature: "Log de auditoria / governança",ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
];

const ACCESS_ICON: Record<Access, React.ReactNode> = {
  full: <CheckCircle className="h-4 w-4 text-carbo-green mx-auto" />,
  read: <Eye className="h-4 w-4 text-carbo-blue mx-auto" />,
  own:  <Wrench className="h-4 w-4 text-warning mx-auto" />,
  none: <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />,
};

const ACCESS_LABEL: Record<Access, string> = {
  full: "Acesso total",
  read: "Somente leitura",
  own:  "Apenas próprios",
  none: "Sem acesso",
};

export default function RoleMatrix() {
  // Group rows by module
  const modules = [...new Set(MATRIX.map((r) => r.module))];

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Matriz de Autorização"
          description="Permissões por cargo em cada módulo do sistema"
          icon={Shield}
        />

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(ACCESS_LABEL).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              {ACCESS_ICON[key as Access]}
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {ROLES.map((r) => (
            <CarboCard key={r.key}>
              <CarboCardContent className="p-3">
                <div className={`w-2 h-2 rounded-full ${r.color} mb-2`} />
                <p className="font-semibold text-sm">{r.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
              </CarboCardContent>
            </CarboCard>
          ))}
        </div>

        {/* Matrix Table */}
        <CarboCard padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left p-3 font-medium w-28">Módulo</th>
                  <th className="text-left p-3 font-medium">Funcionalidade</th>
                  {ROLES.map((r) => (
                    <th key={r.key} className="p-3 font-medium text-center whitespace-nowrap w-28">
                      <div className={`inline-block w-2 h-2 rounded-full ${r.color} mr-1`} />
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((mod) => {
                  const rows = MATRIX.filter((r) => r.module === mod);
                  return rows.map((row, i) => (
                    <tr key={`${mod}-${i}`} className="border-b hover:bg-muted/20 transition-colors">
                      {i === 0 && (
                        <td className="p-3 align-top" rowSpan={rows.length}>
                          <CarboBadge variant="secondary" className="text-[10px] whitespace-nowrap">{mod}</CarboBadge>
                        </td>
                      )}
                      <td className="p-3 text-muted-foreground">{row.feature}</td>
                      {ROLES.map((r) => (
                        <td key={r.key} className="p-3 text-center" title={ACCESS_LABEL[row[r.key as keyof FeatureRow] as Access]}>
                          {ACCESS_ICON[row[r.key as keyof FeatureRow] as Access]}
                        </td>
                      ))}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </CarboCard>

        {/* Notes */}
        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="text-sm font-medium mb-2">Observações importantes:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>Próprios</strong> = o usuário acessa apenas os registros que ele mesmo criou (ex: vendedor vê seus pedidos)</li>
              <li>• <strong>Somente leitura</strong> = visualiza mas não pode criar, editar ou excluir</li>
              <li>• <strong>Acesso total</strong> = criar, editar, excluir e aprovar</li>
              <li>• Permissões são reforçadas pelo RLS (Row Level Security) no banco — não apenas no frontend</li>
              <li>• O <strong>CEO</strong> é o único com acesso à Governança e Cockpit Estratégico</li>
            </ul>
          </CarboCardContent>
        </CarboCard>
      </div>
    </BoardLayout>
  );
}
