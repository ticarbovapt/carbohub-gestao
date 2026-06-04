import { useCarboRoles } from "@/hooks/useCarboRoles";
import { CARBO_ROLE_INFO } from "@/types/carboRoles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
  FileText, Clock, CheckCircle2, ClipboardList, Receipt, Link2, Factory, ArrowRight,
} from "lucide-react";
import { useOperadorDashboard, type OperadorMetrics } from "@/hooks/useRoleDashboard";

interface OperadorDashboardProps {
  role: "operador" | "operador_fiscal";
}

type Kpi = { label: string; value: string | number; icon: JSX.Element; color: string };

/**
 * Dashboard de Operadores — visão operacional, com dados REAIS do Supabase.
 */
export function OperadorDashboard({ role }: OperadorDashboardProps) {
  const info = CARBO_ROLE_INFO[role];
  const { getAccessibleDepartments } = useCarboRoles() as any;
  const accessibleDepts: string[] = getAccessibleDepartments?.() ?? [];
  const { data: m, isLoading } = useOperadorDashboard();

  const header = role === "operador_fiscal"
    ? { title: "Documentação Fiscal", subtitle: "Faturamento e Notas Fiscais" }
    : { title: "Minhas Atividades", subtitle: "Produção, Preparação e Expedição" };

  const buildKpis = (d: OperadorMetrics): Kpi[] => {
    if (role === "operador_fiscal") {
      return [
        { label: "A faturar",      value: d.aFaturar,      icon: <Receipt className="h-7 w-7" />,      color: "text-amber-500" },
        { label: "NFs sem vínculo",value: d.nfsSemVinculo, icon: <Link2 className="h-7 w-7" />,        color: "text-red-500" },
        { label: "NFs vinculadas", value: d.nfsVinculadas, icon: <CheckCircle2 className="h-7 w-7" />, color: "text-green-500" },
        { label: "OS abertas",     value: d.osAbertas,     icon: <FileText className="h-7 w-7" />,     color: "text-blue-500" },
      ];
    }
    return [
      { label: "OS abertas",       value: d.osAbertas,        icon: <Clock className="h-7 w-7" />,       color: "text-amber-500" },
      { label: "OPs em produção",  value: d.opEmProducao,     icon: <Factory className="h-7 w-7" />,     color: "text-blue-500" },
      { label: "OS concluídas hoje",value: d.osConcluidasHoje,icon: <CheckCircle2 className="h-7 w-7" />, color: "text-green-500" },
      { label: "Aguardando NF",    value: d.aFaturar,         icon: <Receipt className="h-7 w-7" />,     color: "text-purple-500" },
    ];
  };

  const kpis = m ? buildKpis(m) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{header.title}</h1>
          <p className="text-muted-foreground">{header.subtitle}</p>
        </div>
        <Badge variant="outline" style={{ backgroundColor: `${info.color}15`, color: info.color }}>
          {info.icon} {info.shortName}
        </Badge>
      </div>

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
                    <span className={kpi.color}>{kpi.icon}</span>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{kpi.value}</p>
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Ordens de Serviço abertas (reais) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Ordens de Serviço abertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (m?.recentOs.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma OS aberta no momento. ✅</p>
          ) : (
            <div className="space-y-2">
              {m!.recentOs.map((os) => (
                <Link key={os.id} to={`/os/${os.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-blue-100 text-blue-700">{os.status === "active" ? "Ativa" : "Rascunho"}</Badge>
                    <span className="font-medium text-sm">{os.label}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Escopo de acesso */}
      {accessibleDepts.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">Seu escopo:</span>
              {accessibleDepts.map((dept) => (
                <Badge key={dept} variant="secondary" className="capitalize">{dept.replace("_", " ")}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
