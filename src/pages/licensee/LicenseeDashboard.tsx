import { useLicenseeStatus, useLicenseeWallet, useLicenseeSubscription, useLicenseeRequests } from "@/hooks/useLicenseePortal";
import { useLicenseeRealtimeNotifications } from "@/hooks/useLicenseeNotifications";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { AIRecommendationsCard } from "@/components/licensee/AIRecommendationsCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
  Wallet,
  Zap,
  Truck,
  Clock,
  CalendarDays,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Package,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SLA_LEVEL_INFO, REQUEST_STATUS_INFO } from "@/types/licenseePortal";
import { cn } from "@/lib/utils";

export default function LicenseeDashboard() {
  const { data: licenseeStatus, isLoading: statusLoading } = useLicenseeStatus();
  const licenseeId = licenseeStatus?.licensee_id;
  const licensee = licenseeStatus?.licensee;

  const { data: wallet, isLoading: walletLoading } = useLicenseeWallet(licenseeId);
  const { data: subscription, isLoading: subscriptionLoading } = useLicenseeSubscription(licenseeId);
  const { data: requests, isLoading: requestsLoading } = useLicenseeRequests(licenseeId);

  // Enable real-time notifications
  useLicenseeRealtimeNotifications();

  const plan = subscription?.plan;
  const planInfo = plan ? SLA_LEVEL_INFO[plan.slaLevel] : null;

  // Filtrar solicitações ativas
  const activeRequests = requests?.filter((r) => !["completed", "cancelled"].includes(r.status)) || [];
  const recentRequests = requests?.slice(0, 5) || [];

  // Calcular próximas execuções
  const upcomingExecutions = activeRequests
    .filter((r) => r.scheduledDate)
    .sort((a, b) => new Date(a.scheduledDate!).getTime() - new Date(b.scheduledDate!).getTime())
    .slice(0, 3);

  const isLoading = statusLoading || walletLoading || subscriptionLoading || requestsLoading;

  if (isLoading) {
    return (
      <LicenseeLayout>
        <div className="p-6 lg:p-8 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </LicenseeLayout>
    );
  }

  if (!licensee) {
    return (
      <LicenseeLayout>
        <div className="p-6 lg:p-8">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold">Acesso não autorizado</h2>
            <p className="text-muted-foreground mt-2">
              Sua conta não está vinculada a nenhum licenciado.
            </p>
          </div>
        </div>
      </LicenseeLayout>
    );
  }

  return (
    <LicenseeLayout>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold">
              Olá, <span className="carbo-gradient-text">{licensee.name}</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Bem-vindo ao seu portal de operações
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild className="carbo-gradient">
              <Link to="/portal/vapt">
                <Zap className="h-4 w-4 mr-2" />
                Solicitar CarboVAPT
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/portal/ze">
                <Truck className="h-4 w-4 mr-2" />
                Pedir Insumos
              </Link>
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CarboKPI
            title="Saldo de Créditos"
            value={wallet?.balance || 0}
            icon={Wallet}
            iconColor="green"
            delay={0}
            onClick={() => {}}
          />
          <CarboKPI
            title="OP em Andamento"
            value={activeRequests.length}
            icon={Clock}
            iconColor="blue"
            delay={50}
          />
          <CarboKPI
            title="VAPT Realizados"
            value={subscription?.vaptUsed || 0}
            icon={Zap}
            iconColor="warning"
            delay={100}
            trend={plan?.maxVaptOperations ? {
              value: Math.round((subscription?.vaptUsed || 0) / plan.maxVaptOperations * 100),
              direction: "neutral",
              label: "do plano",
            } : undefined}
          />
          <CarboKPI
            title="Pedidos CarboZé"
            value={subscription?.zeUsed || 0}
            icon={Package}
            iconColor="success"
            delay={150}
          />
        </div>

        {/* AI Recommendations + Plano */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* AI Recommendations */}
          <div className="lg:col-span-2">
            <AIRecommendationsCard licenseeId={licenseeId} />
          </div>

          {/* Plano Ativo */}
          <CarboCard className="lg:col-span-1">
            <CarboCardHeader>
              <CarboCardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Seu Plano
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              {plan ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xl font-bold">{plan.name}</p>
                      <Badge className={cn("mt-1", planInfo?.badge)}>
                        {planInfo?.icon} {planInfo?.name}
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold font-mono">
                      R$ {plan.monthlyPrice}
                      <span className="text-sm font-normal text-muted-foreground">/mês</span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">SLA Resposta</span>
                      <span className="font-medium">{plan.slaResponseHours}h</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">SLA Execução</span>
                      <span className="font-medium">{plan.slaExecutionHours}h</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Créditos Inclusos</span>
                      <span className="font-medium">{plan.includedCredits}</span>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {plan.features.slice(0, 4).map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-carbo-green" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-muted-foreground">Nenhum plano ativo</p>
                  <Button variant="link" className="mt-2">
                    Ver planos disponíveis
                  </Button>
                </div>
              )}
            </CarboCardContent>
          </CarboCard>

          {/* Próximas Execuções */}
          <CarboCard className="lg:col-span-2">
            <CarboCardHeader className="flex flex-row items-center justify-between">
              <CarboCardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Próximas Execuções
              </CarboCardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/portal/pedidos">
                  Ver todos <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CarboCardHeader>
            <CarboCardContent>
              {upcomingExecutions.length > 0 ? (
                <div className="space-y-3">
                  {upcomingExecutions.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center text-lg",
                        req.operationType === "carbo_vapt"
                          ? "bg-amber-100 dark:bg-amber-900"
                          : "bg-blue-100 dark:bg-blue-900"
                      )}>
                        {req.service?.icon || (req.operationType === "carbo_vapt" ? "⚡" : "📦")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{req.service?.name || req.requestNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {req.scheduledDate && format(new Date(req.scheduledDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <CarboBadge variant={req.status === "confirmed" ? "success" : "secondary"}>
                        {REQUEST_STATUS_INFO[req.status].icon} {REQUEST_STATUS_INFO[req.status].label}
                      </CarboBadge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhuma execução agendada</p>
                  <Button asChild variant="link" className="mt-2">
                    <Link to="/portal/vapt">Solicitar agora</Link>
                  </Button>
                </div>
              )}
            </CarboCardContent>
          </CarboCard>
        </div>

        {/* Histórico Recente */}
        <CarboCard>
          <CarboCardHeader className="flex flex-row items-center justify-between">
            <CarboCardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Solicitações Recentes
            </CarboCardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/portal/pedidos">
                Ver histórico <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CarboCardHeader>
          <CarboCardContent>
            {recentRequests.length > 0 ? (
              <div className="space-y-2">
                {recentRequests.map((req) => {
                  const statusInfo = REQUEST_STATUS_INFO[req.status];
                  return (
                    <div
                      key={req.id}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                        {req.operationType === "carbo_vapt" ? (
                          <Zap className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Truck className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{req.requestNumber}</span>
                          <Badge variant="outline" className={cn("text-xs", statusInfo.color)}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {req.service?.name || req.operationType.replace("carbo_", "Carbo")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true, locale: ptBR })}
                        </p>
                        {req.creditsUsed > 0 && (
                          <p className="text-xs font-mono">-{req.creditsUsed} créditos</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhuma solicitação ainda</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Comece solicitando um serviço CarboVAPT ou insumos CarboZé
                </p>
              </div>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>
    </LicenseeLayout>
  );
}
