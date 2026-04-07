import React from "react";
import { ORDER_STATUS_LABELS } from "@/hooks/useCarbozeOrders";
import { useParams, useNavigate } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  FileText,
  Calendar,
  Cog,
  ShoppingCart,
  TrendingUp,
  Clock,
  Pencil,
  Ban,
  CheckCircle2,
  ClipboardList,
  Users,
  FlaskConical,
  AlertTriangle,
  Car,
} from "lucide-react";
import { useLicensee, LicenseeStatus } from "@/hooks/useLicensees";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { EditLicenseeDialog } from "@/components/licensees/EditLicenseeDialog";
import { InactivateLicenseeDialog } from "@/components/licensees/InactivateLicenseeDialog";
import { ReactivateLicenseeDialog } from "@/components/licensees/ReactivateLicenseeDialog";
import { LicenseeSubNav } from "@/components/licensees/LicenseeSubNav";
import { LicenseePerformanceCharts } from "@/components/licensees/LicenseePerformanceCharts";
import { LicenseeAccessCard } from "@/components/licensees/LicenseeAccessCard";
import { useLicenseeReagentStock } from "@/hooks/useLicenseeReagentStock";
import { MODALITY_INFO } from "@/hooks/useDescarbSales";
import { PRIORIDADE_CONFIG } from "@/hooks/useOpsAlerts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<LicenseeStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
  suspended: "Suspenso",
};

const STATUS_VARIANTS: Record<LicenseeStatus, "success" | "secondary" | "warning" | "destructive"> = {
  active: "success",
  inactive: "secondary",
  pending: "warning",
  suspended: "destructive",
};

const MACHINE_STATUS_LABELS: Record<string, string> = {
  operational: "Operacional",
  maintenance: "Manutenção",
  offline: "Offline",
  retired: "Desativado",
};

const MACHINE_STATUS_VARIANTS: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
  operational: "success",
  maintenance: "warning",
  offline: "secondary",
  retired: "destructive",
};


const ORDER_STATUS_VARIANTS: Record<string, "success" | "secondary" | "warning" | "destructive" | "default"> = {
  pending: "warning",
  confirmed: "default",
  invoiced: "default",
  shipped: "default",
  delivered: "success",
  cancelled: "destructive",
};

export default function LicenseeDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isInactivateDialogOpen, setIsInactivateDialogOpen] = React.useState(false);
  const [isReactivateDialogOpen, setIsReactivateDialogOpen] = React.useState(false);

  const { data: licensee, isLoading: licenseeLoading } = useLicensee(id);

  // ── Sprint B data ──────────────────────────────────────────────────────────
  const { data: reagentStock } = useLicenseeReagentStock(id);

  const { data: descarbSales = [] } = useQuery({
    queryKey: ["licensee-descarb-sales-360", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await (supabase as any)
        .from("descarb_sales")
        .select(`*, descarb_clients(name), descarb_vehicles(license_plate)`)
        .eq("licensee_id", id)
        .eq("is_pre_sale", false)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: descarbClients = [] } = useQuery({
    queryKey: ["licensee-descarb-clients-count", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await (supabase as any)
        .from("descarb_clients")
        .select("id")
        .eq("licensee_id", id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: openAlerts = [] } = useQuery({
    queryKey: ["licensee-ops-alerts-360", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await (supabase as any)
        .from("ops_alerts")
        .select("*")
        .eq("licensee_id", id)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  // Month sales
  const now = new Date();
  const monthSales = descarbSales.filter((s: any) => {
    const d = new Date(s.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  // Fetch machines for this licensee
  const { data: machines = [], isLoading: machinesLoading } = useQuery({
    queryKey: ["licensee-machines", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("machines")
        .select("*")
        .eq("licensee_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch orders for this licensee
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["licensee-orders", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("carboze_orders_secure")
        .select("*")
        .eq("licensee_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const formatCurrency = (value: number | null) => {
    if (!value) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
  };

  if (licenseeLoading) {
    return (
      <BoardLayout>
        <div className="space-y-6">
          <CarboSkeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <CarboSkeleton key={i} className="h-24" />
            ))}
          </div>
          <CarboSkeleton className="h-64 w-full" />
        </div>
      </BoardLayout>
    );
  }

  if (!licensee) {
    return (
      <BoardLayout>
        <CarboCard>
          <CarboEmptyState
            icon={Building2}
            title="Licenciado não encontrado"
            description="O licenciado solicitado não existe ou foi removido"
            action={{
              label: "Voltar para lista",
              onClick: () => navigate("/licensees"),
            }}
          />
        </CarboCard>
      </BoardLayout>
    );
  }

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <CarboPageHeader
          title={licensee.name}
          description={`Código: ${licensee.code}`}
          icon={Building2}
          actions={
            <>
              <CarboButton variant="outline" onClick={() => navigate("/licensees")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Licenciados
              </CarboButton>
              {isAdmin && licensee.status === "active" && (
                <CarboButton variant="outline" onClick={() => setIsInactivateDialogOpen(true)}>
                  <Ban className="h-4 w-4 mr-1" />
                  Inativar
                </CarboButton>
              )}
              {isAdmin && licensee.status === "inactive" && (
                <CarboButton variant="outline" className="border-success text-success hover:bg-success/10" onClick={() => setIsReactivateDialogOpen(true)}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Reativar
                </CarboButton>
              )}
              {isAdmin && (
                <CarboButton onClick={() => setIsEditDialogOpen(true)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Editar
                </CarboButton>
              )}
            </>
          }
        />

        <LicenseeSubNav />

        {/* Status Badge */}
        <div className="flex items-center gap-4">
          <CarboBadge variant={STATUS_VARIANTS[licensee.status]} dot size="lg">
            {STATUS_LABELS[licensee.status]}
          </CarboBadge>
          {licensee.legal_name && (
            <span className="text-sm text-muted-foreground">
              {licensee.legal_name}
            </span>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CarboKPI
            title="Máquinas"
            value={licensee.total_machines || 0}
            icon={Cog}
            iconColor="green"
            delay={50}
          />
          <CarboKPI
            title="Pedidos"
            value={orders.length}
            icon={ShoppingCart}
            iconColor="blue"
            delay={100}
          />
          <CarboKPI
            title="Receita Total"
            value={formatCurrency(licensee.total_revenue)}
            icon={TrendingUp}
            iconColor="success"
            delay={150}
          />
          <CarboKPI
            title="Performance"
            value={`${licensee.performance_score || 0}%`}
            icon={TrendingUp}
            iconColor="warning"
            delay={200}
          />
        </div>

        {/* Sprint B KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CarboKPI
            title="Atendimentos no Mês"
            value={monthSales.length}
            icon={ClipboardList}
            iconColor="green"
            delay={50}
          />
          <CarboKPI
            title="Clientes Cadastrados"
            value={descarbClients.length}
            icon={Users}
            iconColor="blue"
            delay={100}
          />
          <CarboKPI
            title="Alertas Abertos"
            value={openAlerts.length}
            icon={AlertTriangle}
            iconColor={openAlerts.length > 0 ? "warning" : "success"}
            delay={150}
          />
          <CarboKPI
            title="Reagente Flex"
            value={`${(reagentStock?.qty_flex ?? 0).toFixed(1)} L`}
            icon={FlaskConical}
            iconColor={
              (reagentStock?.qty_flex ?? 0) <= (reagentStock?.min_qty_alert ?? 5)
                ? "warning" : "success"
            }
            delay={200}
          />
        </div>

        {/* Reagente gauges */}
        {reagentStock && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-area-licensee" />
                Estoque de Reagentes
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              <div className="grid sm:grid-cols-3 gap-4">
                {(["flex", "diesel", "normal"] as const).map((type) => {
                  const qty = reagentStock[`qty_${type}` as "qty_flex" | "qty_diesel" | "qty_normal"];
                  const min = reagentStock.min_qty_alert;
                  const pct = min > 0 ? Math.min(100, (qty / (min * 4)) * 100) : 100;
                  const isLow = qty <= min;
                  const colors: Record<string, string> = {
                    flex: "#22c55e", diesel: "#f59e0b", normal: "#3b82f6",
                  };
                  const color = colors[type];
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium capitalize" style={{ color }}>{type}</span>
                        <span className="text-sm font-bold" style={{ color }}>{qty.toFixed(1)} L</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: isLow ? "#ef4444" : color,
                          }}
                        />
                      </div>
                      {isLow && (
                        <p className="text-[10px] text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Abaixo do mínimo ({min} L)
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Open alerts */}
        {openAlerts.length > 0 && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Alertas Abertos ({openAlerts.length})
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="space-y-2">
              {openAlerts.map((a: any) => {
                const cfg = PRIORIDADE_CONFIG[a.prioridade as keyof typeof PRIORIDADE_CONFIG];
                return (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cfg?.color ?? "#ef4444" }}
                    />
                    <p className="flex-1 text-sm text-foreground truncate">{a.titulo}</p>
                    <Badge
                      variant="outline"
                      className="text-[9px] flex-shrink-0"
                      style={{ borderColor: cfg?.color, color: cfg?.color }}
                    >
                      {cfg?.label ?? a.prioridade}
                    </Badge>
                  </div>
                );
              })}
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Recent atendimentos */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Últimos Atendimentos ({descarbSales.length > 10 ? "10+" : descarbSales.length})
            </CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            {descarbSales.length === 0 ? (
              <CarboEmptyState
                icon={ClipboardList}
                title="Nenhum atendimento"
                description="Nenhuma descarbonização registrada ainda"
              />
            ) : (
              <CarboTable>
                <CarboTableHeader>
                  <CarboTableRow>
                    <CarboTableHead>Mod.</CarboTableHead>
                    <CarboTableHead>Cliente</CarboTableHead>
                    <CarboTableHead>Placa</CarboTableHead>
                    <CarboTableHead>Reagente</CarboTableHead>
                    <CarboTableHead>Valor</CarboTableHead>
                    <CarboTableHead>Data</CarboTableHead>
                  </CarboTableRow>
                </CarboTableHeader>
                <CarboTableBody>
                  {descarbSales.map((s: any) => {
                    const mod = MODALITY_INFO[s.modality as keyof typeof MODALITY_INFO];
                    return (
                      <CarboTableRow key={s.id}>
                        <CarboTableCell>
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white font-black text-xs"
                            style={{ backgroundColor: mod?.color ?? "#64748b" }}
                          >
                            {s.modality}
                          </span>
                        </CarboTableCell>
                        <CarboTableCell>{s.descarb_clients?.name ?? "Avulso"}</CarboTableCell>
                        <CarboTableCell>
                          {s.descarb_vehicles?.license_plate ? (
                            <span className="font-mono text-xs">{s.descarb_vehicles.license_plate}</span>
                          ) : "—"}
                        </CarboTableCell>
                        <CarboTableCell>
                          <span className="text-xs capitalize">{s.reagent_type} {s.reagent_qty_used}L</span>
                        </CarboTableCell>
                        <CarboTableCell>
                          <span className="font-medium">R$ {Number(s.total_value).toFixed(2)}</span>
                        </CarboTableCell>
                        <CarboTableCell>
                          {format(new Date(s.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </CarboTableCell>
                      </CarboTableRow>
                    );
                  })}
                </CarboTableBody>
              </CarboTable>
            )}
          </CarboCardContent>
        </CarboCard>

        {/* Performance Charts */}
        {id && <LicenseePerformanceCharts licenseeId={id} />}

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Access Card */}
          <LicenseeAccessCard
            licenseeId={id!}
            licenseeEmail={licensee.email}
            licenseeName={licensee.name}
            licenseeCode={licensee.code}
            isAdmin={isAdmin}
          />

          {/* Contact Info */}
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle>Informações de Contato</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="space-y-4">
              {licensee.address_street && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-sm">{licensee.address_street}</p>
                    <p className="text-sm text-muted-foreground">
                      {licensee.address_city}, {licensee.address_state} - {licensee.address_zip}
                    </p>
                  </div>
                </div>
              )}
              {licensee.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${licensee.email}`} className="text-sm text-primary hover:underline">
                    {licensee.email}
                  </a>
                </div>
              )}
              {licensee.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${licensee.phone}`} className="text-sm text-primary hover:underline">
                    {licensee.phone}
                  </a>
                </div>
              )}
              {licensee.document_number && (
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-mono">{licensee.document_number}</span>
                </div>
              )}
            </CarboCardContent>
          </CarboCard>

          {/* Coverage States */}
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle>Área de Cobertura</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              {(licensee.coverage_states?.length || 0) > 0 || licensee.address_state ? (
                <div className="flex flex-wrap gap-2">
                  {licensee.address_state && (
                    <CarboBadge variant="success">
                      {licensee.address_state} (sede)
                    </CarboBadge>
                  )}
                  {licensee.coverage_states?.filter(s => s !== licensee.address_state).map((state) => (
                    <CarboBadge key={state} variant="secondary">
                      {state}
                    </CarboBadge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma área de cobertura definida</p>
              )}
            </CarboCardContent>
          </CarboCard>

          {/* Contract Info */}
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle>Contrato</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Início do Contrato</p>
                  <p className="text-sm font-medium">{formatDate(licensee.contract_start_date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Fim do Contrato</p>
                  <p className="text-sm font-medium">{formatDate(licensee.contract_end_date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Cadastrado em</p>
                  <p className="text-sm font-medium">{formatDate(licensee.created_at)}</p>
                </div>
              </div>
            </CarboCardContent>
          </CarboCard>

          {/* Notes */}
          {licensee.notes && (
            <CarboCard>
              <CarboCardHeader>
                <CarboCardTitle>Observações</CarboCardTitle>
              </CarboCardHeader>
              <CarboCardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {licensee.notes}
                </p>
              </CarboCardContent>
            </CarboCard>
          )}
        </div>

        {/* Machines Table */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="flex items-center gap-2">
              <Cog className="h-5 w-5" />
              Máquinas ({machines.length})
            </CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            {machinesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <CarboSkeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : machines.length === 0 ? (
              <CarboEmptyState
                icon={Cog}
                title="Nenhuma máquina"
                description="Este licenciado ainda não possui máquinas cadastradas"
              />
            ) : (
              <CarboTable>
                <CarboTableHeader>
                  <CarboTableRow>
                    <CarboTableHead>ID</CarboTableHead>
                    <CarboTableHead>Modelo</CarboTableHead>
                    <CarboTableHead>Localização</CarboTableHead>
                    <CarboTableHead>Status</CarboTableHead>
                    <CarboTableHead>Unidades Dispensadas</CarboTableHead>
                    <CarboTableHead>Última Manutenção</CarboTableHead>
                  </CarboTableRow>
                </CarboTableHeader>
                <CarboTableBody>
                  {machines.map((machine) => (
                    <CarboTableRow 
                      key={machine.id}
                      interactive
                      onClick={() => navigate(`/machines?search=${machine.machine_id}`)}
                    >
                      <CarboTableCell>
                        <span className="font-mono text-sm font-medium text-carbo-green">
                          {machine.machine_id}
                        </span>
                      </CarboTableCell>
                      <CarboTableCell>{machine.model}</CarboTableCell>
                      <CarboTableCell>
                        <div className="text-sm text-muted-foreground">
                          {machine.location_city}, {machine.location_state}
                        </div>
                      </CarboTableCell>
                      <CarboTableCell>
                        <CarboBadge variant={MACHINE_STATUS_VARIANTS[machine.status] || "secondary"} dot>
                          {MACHINE_STATUS_LABELS[machine.status] || machine.status}
                        </CarboBadge>
                      </CarboTableCell>
                      <CarboTableCell>
                        <span className="kpi-number">{machine.total_units_dispensed || 0}</span>
                      </CarboTableCell>
                      <CarboTableCell>{formatDate(machine.last_maintenance_date)}</CarboTableCell>
                    </CarboTableRow>
                  ))}
                </CarboTableBody>
              </CarboTable>
            )}
          </CarboCardContent>
        </CarboCard>

        {/* Orders Table */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Pedidos ({orders.length})
            </CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            {ordersLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <CarboSkeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <CarboEmptyState
                icon={ShoppingCart}
                title="Nenhum pedido"
                description="Este licenciado ainda não possui pedidos registrados"
              />
            ) : (
              <CarboTable>
                <CarboTableHeader>
                  <CarboTableRow>
                    <CarboTableHead>Número</CarboTableHead>
                    <CarboTableHead>Cliente</CarboTableHead>
                    <CarboTableHead>Data</CarboTableHead>
                    <CarboTableHead>Status</CarboTableHead>
                    <CarboTableHead>Total</CarboTableHead>
                  </CarboTableRow>
                </CarboTableHeader>
                <CarboTableBody>
                  {orders.map((order) => (
                    <CarboTableRow 
                      key={order.id}
                      interactive
                      onClick={() => navigate(`/orders?search=${order.order_number}`)}
                    >
                      <CarboTableCell>
                        <span className="font-mono text-sm font-medium text-carbo-green">
                          {order.order_number}
                        </span>
                      </CarboTableCell>
                      <CarboTableCell>{order.customer_name}</CarboTableCell>
                      <CarboTableCell>{formatDate(order.created_at)}</CarboTableCell>
                      <CarboTableCell>
                        <CarboBadge 
                          variant={ORDER_STATUS_VARIANTS[order.status] || "secondary"} 
                          dot
                        >
                          {ORDER_STATUS_LABELS[order.status] || order.status}
                        </CarboBadge>
                      </CarboTableCell>
                      <CarboTableCell>
                        <span className="font-medium">{formatCurrency(order.total)}</span>
                      </CarboTableCell>
                    </CarboTableRow>
                  ))}
                </CarboTableBody>
              </CarboTable>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>

      <EditLicenseeDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        licensee={licensee}
      />

      <InactivateLicenseeDialog
        open={isInactivateDialogOpen}
        onOpenChange={setIsInactivateDialogOpen}
        licensee={licensee}
      />

      <ReactivateLicenseeDialog
        open={isReactivateDialogOpen}
        onOpenChange={setIsReactivateDialogOpen}
        licensee={licensee}
      />
    </BoardLayout>
  );
}
