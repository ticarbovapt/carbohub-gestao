import { useCarboRoles } from "@/hooks/useCarboRoles";
import { CARBO_ROLE_INFO, CarboRole } from "@/types/carboRoles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  ClipboardList,
  Calendar,
  Target
} from "lucide-react";

interface OperadorDashboardProps {
  role: "operador" | "operador_fiscal";
}

/**
 * Dashboard de Operadores - Visão operacional individual
 * - Minhas tarefas
 * - Checklists pendentes
 * - Próximas atividades
 */
export function OperadorDashboard({ role }: OperadorDashboardProps) {
  const info = CARBO_ROLE_INFO[role];
  const { getAccessibleDepartments } = useCarboRoles();
  
  const accessibleDepts = getAccessibleDepartments();

  // Mock data baseado no role
  const getDashboardData = () => {
    switch (role) {
      case "operador":
        return {
          title: "Minhas Atividades",
          subtitle: "Preparação, Expedição e Operação",
          stats: {
            pending: 4,
            inProgress: 2,
            completedToday: 6,
            weeklyGoal: 75
          },
          tasks: [
            { id: 1, title: "OS-2024-00145 - Preparação", status: "in_progress", priority: "high" },
            { id: 2, title: "OS-2024-00147 - Expedição", status: "pending", priority: "medium" },
            { id: 3, title: "OS-2024-00142 - Operação", status: "pending", priority: "low" },
          ],
          checklists: [
            { name: "Checklist de Preparação", items: 8, completed: 5 },
            { name: "Verificação de Equipamentos", items: 12, completed: 12 },
          ]
        };
      case "operador_fiscal":
        return {
          title: "Documentação Fiscal",
          subtitle: "Expedição e Pós-Venda",
          stats: {
            pending: 8,
            inProgress: 3,
            completedToday: 12,
            weeklyGoal: 85
          },
          tasks: [
            { id: 1, title: "NF-e Pedido #2024-00234", status: "in_progress", priority: "high" },
            { id: 2, title: "CT-e Remessa LIC-045", status: "pending", priority: "high" },
            { id: 3, title: "Declaração de Transporte", status: "pending", priority: "medium" },
          ],
          checklists: [
            { name: "Conferência de Documentos", items: 6, completed: 4 },
            { name: "Validação Fiscal", items: 10, completed: 10 },
          ]
        };
    }
  };

  const data = getDashboardData();
  const priorityColors = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-blue-100 text-blue-700 border-blue-200"
  };
  const statusColors = {
    pending: "bg-gray-100 text-gray-700",
    in_progress: "bg-blue-100 text-blue-700"
  };

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
          style={{ backgroundColor: `${info.color}15`, color: info.color }}
        >
          {info.icon} {info.shortName}
        </Badge>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{data.stats.pending}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{data.stats.inProgress}</p>
                <p className="text-xs text-muted-foreground">Em Andamento</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{data.stats.completedToday}</p>
                <p className="text-xs text-muted-foreground">Concluídas Hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Target className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{data.stats.weeklyGoal}%</p>
                <p className="text-xs text-muted-foreground">Meta Semanal</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Minhas tarefas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Minhas Tarefas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.tasks.map((task) => (
              <div 
                key={task.id} 
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Badge className={statusColors[task.status as keyof typeof statusColors]}>
                    {task.status === "in_progress" ? "Em andamento" : "Pendente"}
                  </Badge>
                  <span className="font-medium">{task.title}</span>
                </div>
                <Badge variant="outline" className={priorityColors[task.priority as keyof typeof priorityColors]}>
                  {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Checklists */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Meus Checklists
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.checklists.map((checklist, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{checklist.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {checklist.completed}/{checklist.items}
                  </span>
                </div>
                <Progress value={(checklist.completed / checklist.items) * 100} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Escopo de acesso */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">Seu escopo:</span>
            {accessibleDepts.map((dept) => (
              <Badge key={dept} variant="secondary" className="capitalize">
                {dept.replace("_", " ")}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
