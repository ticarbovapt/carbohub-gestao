import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { useLicenseeStatus, useLicenseeWallet, useCreditTransactions } from "@/hooks/useLicenseePortal";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Wallet,
  Coins,
  TrendingUp,
  TrendingDown,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Gift,
  RefreshCw,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TRANSACTION_TYPE_INFO: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = {
  purchase: { label: "Compra", icon: ArrowUpRight, color: "text-green-500" },
  consumption: { label: "Consumo", icon: ArrowDownRight, color: "text-red-500" },
  refund: { label: "Reembolso", icon: RefreshCw, color: "text-blue-500" },
  bonus: { label: "Bônus", icon: Gift, color: "text-purple-500" },
  expiry: { label: "Expirado", icon: Clock, color: "text-gray-500" },
};

export default function LicenseeCredits() {
  const { data: licenseeStatus } = useLicenseeStatus();
  const { data: wallet, isLoading: walletLoading } = useLicenseeWallet(licenseeStatus?.licensee_id);
  const { data: transactions, isLoading: transactionsLoading } = useCreditTransactions(wallet?.id);

  const isLoading = walletLoading || transactionsLoading;

  if (isLoading) {
    return (
      <LicenseeLayout>
        <div className="p-6 lg:p-8 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </LicenseeLayout>
    );
  }

  return (
    <LicenseeLayout>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <PageHeader
          title="Créditos"
          description="Gerencie seu saldo e histórico de transações"
          icon={<Wallet className="h-6 w-6 text-carbo-green" />}
          actions={
            <Button className="carbo-gradient">
              <Plus className="h-4 w-4 mr-2" />
              Comprar Créditos
            </Button>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CarboKPI
            title="Saldo Atual"
            value={wallet?.balance || 0}
            icon={Coins}
            iconColor="green"
            highlight
          />
          <CarboKPI
            title="Total Adquirido"
            value={wallet?.totalEarned || 0}
            icon={TrendingUp}
            iconColor="success"
          />
          <CarboKPI
            title="Total Utilizado"
            value={wallet?.totalSpent || 0}
            icon={TrendingDown}
            iconColor="blue"
          />
        </div>

        {/* Saldo destacado */}
        <CarboCard>
          <CarboCardContent className="p-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-gradient-to-br from-carbo-green/20 to-carbo-blue/20 mb-4">
                <Wallet className="h-10 w-10 text-carbo-green" />
              </div>
              <p className="text-muted-foreground mb-2">Seu saldo disponível</p>
              <p className="text-5xl font-bold font-mono carbo-gradient-text">
                {wallet?.balance || 0}
              </p>
              <p className="text-muted-foreground mt-1">créditos</p>
              <div className="mt-6 flex justify-center gap-4">
                <Button className="carbo-gradient">
                  <Plus className="h-4 w-4 mr-2" />
                  Comprar Mais
                </Button>
                <Button variant="outline">
                  Ver Planos
                </Button>
              </div>
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* Histórico de Transações */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Histórico de Transações
            </CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            {transactions && transactions.length > 0 ? (
              <div className="space-y-2">
                {transactions.map((tx) => {
                  const typeInfo = TRANSACTION_TYPE_INFO[tx.type] || TRANSACTION_TYPE_INFO.consumption;
                  const Icon = typeInfo.icon;
                  const isPositive = tx.amount > 0;

                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center",
                        isPositive ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"
                      )}>
                        <Icon className={cn("h-5 w-5", typeInfo.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{typeInfo.label}</p>
                          <Badge variant="secondary" className="text-xs">
                            {tx.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {tx.description || "Transação de créditos"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-mono font-bold text-lg",
                          isPositive ? "text-green-500" : "text-red-500"
                        )}>
                          {isPositive ? "+" : ""}{tx.amount}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Saldo: {tx.balanceAfter}
                        </p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground hidden md:block">
                        <p>{format(new Date(tx.createdAt), "dd/MM/yyyy")}</p>
                        <p className="text-xs">
                          {formatDistanceToNow(new Date(tx.createdAt), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Coins className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium text-lg">Nenhuma transação</h3>
                <p className="text-muted-foreground mt-1">
                  Seu histórico de créditos aparecerá aqui
                </p>
              </div>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>
    </LicenseeLayout>
  );
}
