import { useState } from "react";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { useLicenseeStatus, useLicenseeRequests } from "@/hooks/useLicenseePortal";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboTable, CarboTableHeader, CarboTableRow, CarboTableHead, CarboTableBody, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ShoppingCart,
  Zap,
  Truck,
  Clock,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Filter,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { REQUEST_STATUS_INFO, type LicenseeRequest } from "@/types/licenseePortal";
import { cn } from "@/lib/utils";

export default function LicenseeRequests() {
  const { data: licenseeStatus } = useLicenseeStatus();
  const { data: requests, isLoading } = useLicenseeRequests(licenseeStatus?.licensee_id);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const filteredRequests = requests?.filter((req) => {
    const matchesSearch =
      req.requestNumber.toLowerCase().includes(search.toLowerCase()) ||
      req.service?.name?.toLowerCase().includes(search.toLowerCase());

    if (activeTab === "all") return matchesSearch;
    if (activeTab === "active") return matchesSearch && !["completed", "cancelled"].includes(req.status);
    if (activeTab === "completed") return matchesSearch && req.status === "completed";
    if (activeTab === "cancelled") return matchesSearch && req.status === "cancelled";
    return matchesSearch;
  }) || [];

  const stats = {
    total: requests?.length || 0,
    active: requests?.filter((r) => !["completed", "cancelled"].includes(r.status)).length || 0,
    completed: requests?.filter((r) => r.status === "completed").length || 0,
    cancelled: requests?.filter((r) => r.status === "cancelled").length || 0,
  };

  if (isLoading) {
    return (
      <LicenseeLayout>
        <div className="p-6 lg:p-8 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </LicenseeLayout>
    );
  }

  return (
    <LicenseeLayout>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <PageHeader
          title="Meus Pedidos"
          description="Acompanhe suas solicitações e histórico de operações"
          icon={<ShoppingCart className="h-6 w-6 text-carbo-green" />}
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card border rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold font-mono">{stats.total}</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Em andamento</p>
            <p className="text-2xl font-bold font-mono text-blue-500">{stats.active}</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Concluídos</p>
            <p className="text-2xl font-bold font-mono text-green-500">{stats.completed}</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-sm text-muted-foreground">Cancelados</p>
            <p className="text-2xl font-bold font-mono text-red-500">{stats.cancelled}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número ou serviço..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Todos ({stats.total})</TabsTrigger>
            <TabsTrigger value="active">Ativos ({stats.active})</TabsTrigger>
            <TabsTrigger value="completed">Concluídos ({stats.completed})</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelados ({stats.cancelled})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <CarboCard>
              <CarboCardContent className="p-0">
                {filteredRequests.length > 0 ? (
                  <div className="overflow-x-auto">
                    <CarboTable>
                      <CarboTableHeader>
                        <CarboTableRow>
                          <CarboTableHead>Pedido</CarboTableHead>
                          <CarboTableHead>Tipo</CarboTableHead>
                          <CarboTableHead>Serviço</CarboTableHead>
                          <CarboTableHead>Status</CarboTableHead>
                          <CarboTableHead>Data</CarboTableHead>
                          <CarboTableHead>Agendamento</CarboTableHead>
                          <CarboTableHead>Pagamento</CarboTableHead>
                        </CarboTableRow>
                      </CarboTableHeader>
                      <CarboTableBody>
                        {filteredRequests.map((req) => {
                          const statusInfo = REQUEST_STATUS_INFO[req.status];
                          return (
                            <CarboTableRow key={req.id} className="cursor-pointer hover:bg-muted/50">
                              <CarboTableCell>
                                <span className="font-mono font-medium">{req.requestNumber}</span>
                              </CarboTableCell>
                              <CarboTableCell>
                                <div className="flex items-center gap-2">
                                  {req.operationType === "carbo_vapt" ? (
                                    <>
                                      <Zap className="h-4 w-4 text-amber-500" />
                                      <span className="text-xs">VAPT</span>
                                    </>
                                  ) : (
                                    <>
                                      <Truck className="h-4 w-4 text-blue-500" />
                                      <span className="text-xs">Zé</span>
                                    </>
                                  )}
                                </div>
                              </CarboTableCell>
                              <CarboTableCell>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{req.service?.icon}</span>
                                  <span className="text-sm">{req.service?.name || "-"}</span>
                                </div>
                              </CarboTableCell>
                              <CarboTableCell>
                                <Badge variant="outline" className={cn("text-xs", statusInfo.color)}>
                                  {statusInfo.icon} {statusInfo.label}
                                </Badge>
                                {req.slaBreached && (
                                  <Badge variant="destructive" className="ml-1 text-xs">
                                    SLA
                                  </Badge>
                                )}
                              </CarboTableCell>
                              <CarboTableCell>
                                <div className="text-sm">
                                  <p>{format(new Date(req.createdAt), "dd/MM/yyyy")}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(req.createdAt), {
                                      addSuffix: true,
                                      locale: ptBR,
                                    })}
                                  </p>
                                </div>
                              </CarboTableCell>
                              <CarboTableCell>
                                {req.scheduledDate ? (
                                  <div className="flex items-center gap-1 text-sm">
                                    <CalendarDays className="h-3 w-3" />
                                    {format(new Date(req.scheduledDate), "dd/MM HH:mm")}
                                  </div>
                                ) : req.preferredDate ? (
                                  <span className="text-sm text-muted-foreground">
                                    Preferência: {format(new Date(req.preferredDate), "dd/MM")}
                                  </span>
                                ) : (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </CarboTableCell>
                              <CarboTableCell>
                                {req.paymentMethod === "credits" ? (
                                  <span className="text-sm font-mono">-{req.creditsUsed} ₡</span>
                                ) : req.paymentMethod === "plan" ? (
                                  <Badge variant="secondary">Plano</Badge>
                                ) : (
                                  <span className="text-sm font-mono">R$ {req.amountCharged}</span>
                                )}
                              </CarboTableCell>
                            </CarboTableRow>
                          );
                        })}
                      </CarboTableBody>
                    </CarboTable>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-medium text-lg">Nenhum pedido encontrado</h3>
                    <p className="text-muted-foreground mt-1">
                      {search ? "Tente ajustar os filtros" : "Faça sua primeira solicitação"}
                    </p>
                  </div>
                )}
              </CarboCardContent>
            </CarboCard>
          </TabsContent>
        </Tabs>
      </div>
    </LicenseeLayout>
  );
}
