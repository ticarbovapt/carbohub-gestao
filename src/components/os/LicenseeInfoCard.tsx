import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle
} from "lucide-react";
import { ServiceOrder, DEPARTMENT_ORDER, DEPARTMENT_INFO, getDepartmentIndex, DepartmentType } from "@/types/os";
import { Link } from "react-router-dom";

interface LicenseeInfoCardProps {
  order: ServiceOrder;
  stageHistory: {
    id: string;
    department: string;
    status: string;
    completed_at: string | null;
  }[];
}

export function LicenseeInfoCard({ order, stageHistory }: LicenseeInfoCardProps) {
  const customer = order.customer;
  const currentIndex = getDepartmentIndex(order.current_department);
  const totalStages = DEPARTMENT_ORDER.length;
  const completedStages = stageHistory.filter(s => s.status === "completed").length;
  const progressPercent = order.status === "completed" 
    ? 100 
    : Math.round((completedStages / totalStages) * 100);

  // Calculate stage stats
  const stageStats = DEPARTMENT_ORDER.map(dept => {
    const history = stageHistory.find(h => h.department === dept);
    const isCurrent = dept === order.current_department && order.status !== "completed";
    const isCompleted = history?.status === "completed" || 
      (order.status === "completed") ||
      getDepartmentIndex(dept) < currentIndex;
    const isPending = getDepartmentIndex(dept) > currentIndex;

    return {
      department: dept,
      info: DEPARTMENT_INFO[dept],
      status: isCompleted ? "completed" : isCurrent ? "current" : "pending",
      completedAt: history?.completed_at
    };
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            Dados do Licenciado
          </CardTitle>
          {customer && (
            <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs">
              <Link to={`/customers/${customer.id}`}>
                Ver Perfil
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {customer ? (
          <>
            {/* Customer Info */}
            <div className="grid gap-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{customer.name}</p>
                  {customer.company && (
                    <p className="text-sm text-muted-foreground truncate">{customer.company}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-2 text-sm">
                {customer.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{customer.phone}</span>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />
          </>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum licenciado vinculado</p>
            <Button variant="link" size="sm" className="mt-1">
              Vincular Licenciado
            </Button>
          </div>
        )}

        {/* Progress Dashboard */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Progresso Geral</span>
            <Badge variant={progressPercent === 100 ? "default" : "secondary"}>
              {progressPercent}%
            </Badge>
          </div>
          
          <Progress value={progressPercent} className="h-2" />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{completedStages} de {totalStages} etapas</span>
            <span>
              {order.status === "completed" 
                ? "Concluído" 
                : `Etapa atual: ${DEPARTMENT_INFO[order.current_department].name}`
              }
            </span>
          </div>
        </div>

        <Separator />

        {/* Stage Progress List */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Etapas do Processo</p>
          <div className="space-y-1.5">
            {stageStats.map((stage, index) => (
              <div 
                key={stage.department}
                className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                  stage.status === "current" 
                    ? "bg-primary/5 border border-primary/20" 
                    : stage.status === "completed"
                    ? "bg-muted/50"
                    : ""
                }`}
              >
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs flex-shrink-0 ${
                  stage.status === "completed" 
                    ? "bg-success text-success-foreground" 
                    : stage.status === "current"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {stage.status === "completed" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : stage.status === "current" ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${
                    stage.status === "current" 
                      ? "font-medium text-foreground" 
                      : stage.status === "completed"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}>
                    {stage.info.name}
                  </p>
                </div>

                {stage.status === "completed" && (
                  <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/20">
                    Concluído
                  </Badge>
                )}
                {stage.status === "current" && (
                  <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                    Em Andamento
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
