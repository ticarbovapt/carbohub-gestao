import { useCarboRoles } from "@/hooks/useCarboRoles";
import { CARBO_ROLE_INFO } from "@/types/carboRoles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
  FileText, Clock, CheckCircle2, AlertCircle, Users, TrendingUp, DollarSign,
  ShoppingCart, Wallet, Receipt, ArrowRight,
} from "lucide-react";
import { useGestorDashboard, type GestorMetrics } from "@/hooks/useRoleDashboard";

interface GestorDashboardProps {
  role: "gestor_adm" | "gestor_fin" | "gestor_compras";
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Kpi = { label: string; value: string | number; icon: JSX.Element };

/**
 * Dashboard de Gestores — visão tática por área, com dados REAIS do Supabase.
 */
export function GestorDashboard({ role }: GestorDashboardProps) {
  const info = CARBO_ROLE_INFO[role];
  const { getAccessibleFlows: _f, getAccessibleMacroFlows, getAccessibleDepartments } = useCarboRoles() as any;
  const accessibleFlows = getAccessibleMacroFlows?.() ?? [];
  const { data: m, isLoading } = useGestorDashboard();

  const titles: Record<GestorDashboardProps["role"], { title: string; subtitle: string }> = {
    gestor_adm:     { title: "Gestão Administrativa", subtitle: "Comercial e Pós-Venda" },
    gestor_fin:     { title: "Gestão Financeira",     subtitle: "Faturamento e Cobrança" },
    gestor_compras: { title: "Gestão de Compras & Logística", subtitle: "Suprimentos e Expedição" },
  };

  const buildKpis = (d: GestorMetrics): Kpi[] => {
    switch (role) {
      case "gestor_adm":
        return [
          { label: "Vendas no mês",     value: d.vendasMes,            icon: <ShoppingCart className="h-5 w-5" /> },
          { label: "Faturamento no mês",value: brl(d.faturamentoMes),  icon: <TrendingUp className="h-5 w-5" /> },
          { label: "Aguardando NF",     value: d.aguardandoNF,         icon: <Receipt className="h-5 w-5" /> },
          { label: "OS abertas",        value: d.osAbertas,            icon: <FileText className="h-5 w-5" /> },
        ];
      case "gestor_fin":
        return [
          { label: "Aguardando NF",       value: d.aguardandoNF,            icon: <Receipt className="h-5 w-5" /> },
          { label: "A pagar",             value: brl(d.aPagar),             icon: <Wallet className="h-5 w-5" /> },
          { label: "Pagamentos atrasados",value: d.pagamentosAtrasados,     icon: <AlertCircle className="h-5 w-5" /> },
          { label: "RC pendentes",        value: d.rcPendentes,             icon: <Clock className="h-5 w-5" /> },
        ];
      case "gestor_compras":
        return [
          { label: "RC pendentes",       value: d.rcPendentes,           icon: <Clock className="h-5 w-5" /> },
          { label: "OC abertas",         value: d.ocAbertas,             icon: <FileText className="h-5 w-5" /> },
          { label: "Total comprometido", value: brl(d.totalComprometido),icon: <DollarSign className="h-5 w-5" /> },
          { label: "A pagar",            value: brl(d.aPagar),           icon: <Wallet className="h-5 w-5" /> },
        ];
    }
  };

  const t = titles[role];
  const kpis = m ? buildKpis(m) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.title}</h1>
          <p className="text-muted-foreground">{t.subtitle}</p>
        </div>
        <Badge variant="outline" className="border-primary/30"
          style={{ backgroundColor: `${info.color}15`, color: info.color }}>
          {info.icon} {info.shortName}
        </Badge>
      </div>

      {/* Escopo de acesso */}
      {accessibleFlows.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">Seu escopo:</span>
              {accessibleFlows.map((flow: string) => (
                <Badge key={flow} variant="secondary" className="capitalize">
                  {flow.replace("_", " ")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs reais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
            ))
          : kpis.map((kpi, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">{kpi.icon}</div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{kpi.value}</p>
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Atalhos para as telas do escopo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Acessos rápidos</CardTitle>
          <CardDescription>Telas da sua área</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(role === "gestor_adm"
              ? [{ to: "/vendas", label: "Vendas" }, { to: "/orders", label: "Pedidos" }, { to: "/os", label: "Ordens de Serviço" }]
              : role === "gestor_fin"
              ? [{ to: "/financeiro", label: "Financeiro" }, { to: "/financeiro/faturamento", label: "Faturamento" }, { to: "/dashboards/financeiro", label: "Dashboard Financeiro" }]
              : [{ to: "/financeiro", label: "Compras (RC)" }, { to: "/suprimentos", label: "Suprimentos" }, { to: "/logistics", label: "Logística" }]
            ).map((l) => (
              <Link key={l.to} to={l.to}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm hover:border-primary/40 hover:bg-primary/5 transition-colors">
                <span>{l.label}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
