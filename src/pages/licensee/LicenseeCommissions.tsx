import React from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  FileText,
  ChevronRight,
} from "lucide-react";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLicenseeStatus } from "@/hooks/useLicenseePortal";
import { useLicenseeCommissions, useCommissionStatements, useCommissionSummary } from "@/hooks/useLicenseeCommissions";
import { COMMISSION_STATUS_INFO, COMMISSION_TYPE_INFO } from "@/types/commission";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function LicenseeCommissions() {
  const { data: licenseeStatus } = useLicenseeStatus();
  const licenseeId = licenseeStatus?.licensee?.id;
  
  const { data: commissions, isLoading: commissionsLoading } = useLicenseeCommissions(licenseeId);
  const { data: statements, isLoading: statementsLoading } = useCommissionStatements(licenseeId);
  const { data: summary, isLoading: summaryLoading } = useCommissionSummary(licenseeId);

  const isLoading = commissionsLoading || statementsLoading || summaryLoading;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getMonthName = (month: number) => {
    return format(new Date(2024, month - 1, 1), "MMMM", { locale: ptBR });
  };

  if (isLoading) {
    return (
      <LicenseeLayout>
        <div className="p-6 space-y-6">
          <CarboSkeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            <CarboSkeleton className="h-28" />
            <CarboSkeleton className="h-28" />
            <CarboSkeleton className="h-28" />
            <CarboSkeleton className="h-28" />
          </div>
        </div>
      </LicenseeLayout>
    );
  }

  return (
    <LicenseeLayout>
    <div className="p-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Comissões"
        description="Acompanhe seus ganhos e histórico de comissões"
        icon={<DollarSign className="h-6 w-6 text-carbo-green" />}
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Previsto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(summary?.currentMonth.pending || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Aguardando validação
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Aprovado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(summary?.currentMonth.approved || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              A receber este mês
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Pago este Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary?.currentMonth.paid || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Já creditado
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-carbo-green/10 to-carbo-blue/10 border-carbo-green/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total Acumulado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(summary?.totalPaidAllTime || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Desde o início
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="commissions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="statements">Extratos Mensais</TabsTrigger>
        </TabsList>

        {/* Commissions List */}
        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Comissões</CardTitle>
            </CardHeader>
            <CardContent>
              {commissions && commissions.length > 0 ? (
                <div className="space-y-3">
                  {commissions.map((commission) => {
                    const statusInfo = COMMISSION_STATUS_INFO[commission.status];
                    const typeInfo = COMMISSION_TYPE_INFO[commission.commissionType];
                    
                    return (
                      <motion.div
                        key={commission.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-muted rounded-lg">
                            <DollarSign className="h-5 w-5 text-carbo-green" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {typeInfo.label}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {getMonthName(commission.referenceMonth)} {commission.referenceYear}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-foreground">
                              {formatCurrency(commission.totalAmount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(commission.commissionRate * 100).toFixed(1)}% de {formatCurrency(commission.baseAmount)}
                            </p>
                          </div>
                          <Badge className={statusInfo.color}>
                            {statusInfo.icon} {statusInfo.label}
                          </Badge>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma comissão registrada ainda.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statements */}
        <TabsContent value="statements">
          <Card>
            <CardHeader>
              <CardTitle>Extratos Mensais</CardTitle>
            </CardHeader>
            <CardContent>
              {statements && statements.length > 0 ? (
                <div className="space-y-3">
                  {statements.map((statement) => (
                    <motion.div
                      key={statement.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-muted rounded-lg">
                          <FileText className="h-5 w-5 text-carbo-blue" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground capitalize">
                            {getMonthName(statement.periodMonth)} {statement.periodYear}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {statement.totalOrders} pedidos
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-bold text-foreground">
                            {formatCurrency(statement.grossTotal)}
                          </p>
                          <Badge 
                            variant="outline"
                            className={
                              statement.status === 'paid' 
                                ? 'border-green-500 text-green-600' 
                                : statement.status === 'closed'
                                  ? 'border-blue-500 text-blue-600'
                                  : 'border-yellow-500 text-yellow-600'
                            }
                          >
                            {statement.status === 'paid' ? 'Pago' : statement.status === 'closed' ? 'Fechado' : 'Em Aberto'}
                          </Badge>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum extrato disponível ainda.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </LicenseeLayout>
  );
}
