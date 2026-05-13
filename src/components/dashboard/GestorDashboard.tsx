import { useCarboRoles } from "@/hooks/useCarboRoles";
import { CARBO_ROLE_INFO, CarboRole } from "@/types/carboRoles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Users,
  TrendingUp
} from "lucide-react";

interface GestorDashboardProps {
  role: "gestor_adm" | "gestor_fin" | "gestor_compras";
}

/**
 * Dashboard de Gestores - Visão tática por área
 * - OS do time
 * - KPIs de performance
 * - Alertas do escopo
 */
export function GestorDashboard({ role }: GestorDashboardProps) {
  const info = CARBO_ROLE_INFO[role];
  const { getAccessibleDepartments, getAccessibleMacroFlows } = useCarboRoles();
  
  const accessibleDepts = getAccessibleDepartments();
  const accessibleFlows = getAccessibleMacroFlows();

  // Mock data baseado no role
  const getDashboardData = () => {
    switch (role) {
      case "gestor_adm":
        return {
          title: "Gestão Administrativa",
          subtitle: "Comercial e Pós-Venda",
          kpis: [
            { label: "OP Comerciais", value: 12, icon: <FileText className="h-5 w-5" /> },
            { label: "Aguardando Aprovação", value: 3, icon: <Clock className="h-5 w-5" /> },
            { label: "Concluídas Hoje", value: 5, icon: <CheckCircle2 className="h-5 w-5" /> },
            { label: "Time Ativo", value: 8, icon: <Users className="h-5 w-5" /> },
          ],
          alerts: [
            "2 clientes aguardando retorno há mais de 24h",
            "1 OS próxima do prazo limite"
          ]
        };
      case "gestor_fin":
        return {
          title: "Gestão Financeira",
          subtitle: "Faturamento e Cobrança",
          kpis: [
            { label: "Pedidos a Faturar", value: 8, icon: <FileText className="h-5 w-5" /> },
            { label: "Valor Pendente", value: "R$ 45.2K", icon: <TrendingUp className="h-5 w-5" /> },
            { label: "Faturados Hoje", value: 4, icon: <CheckCircle2 className="h-5 w-5" /> },
            { label: "Inadimplência", value: "2.3%", icon: <AlertCircle className="h-5 w-5" /> },
          ],
          alerts: [
            "5 faturas vencendo amanhã",
            "3 clientes com pagamento atrasado"
          ]
        };
      case "gestor_compras":
        return {
          title: "Gestão de Compras & Logística",
          subtitle: "Preparação e Expedição",
          kpis: [
            { label: "OP em Preparação", value: 6, icon: <FileText className="h-5 w-5" /> },
            { label: "Aguardando Expedição", value: 4, icon: <Clock className="h-5 w-5" /> },
            { label: "Enviadas Hoje", value: 3, icon: <CheckCircle2 className="h-5 w-5" /> },
            { label: "Máquinas Baixo Estoque", value: 5, icon: <AlertCircle className="h-5 w-5" /> },
          ],
          alerts: [
            "2 entregas atrasadas por falta de insumos",
            "3 máquinas precisam de reposição urgente"
          ]
        };
    }
  };

  const data = getDashboardData();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {data.title}
          </h1>
          <p className="text-muted-foreground">
            {data.subtitle}
          </p>
        </div>
        <Badge 
          variant="outline" 
          className="border-primary/30"
          style={{ backgroundColor: `${info.color}15`, color: info.color }}
        >
          {info.icon} {info.shortName}
        </Badge>
      </div>

      {/* Escopo de acesso */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">Seu escopo:</span>
            {accessibleFlows.map((flow) => (
              <Badge key={flow} variant="secondary" className="capitalize">
                {flow.replace("_", " ")}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {data.kpis.map((kpi, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  {kpi.icon}
                </div>
                <div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alertas do escopo */}
      {data.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Atenção Necessária
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.alerts.map((alert, i) => (
                <div key={i} className="p-3 rounded bg-amber-50 dark:bg-amber-900/30 border-l-4 border-l-amber-500">
                  <p className="text-sm text-amber-900 dark:text-amber-200">{alert}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Placeholder para lista de OP do time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">OP do Meu Time</CardTitle>
          <CardDescription>
            Ordens de produção nas etapas do seu escopo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Lista de OP será exibida aqui</p>
            <p className="text-xs">Filtrada por departamentos: {accessibleDepts.join(", ")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
