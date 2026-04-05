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
  CheckCircle2
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

        {/* Performance Charts */}
        {id && <LicenseePerformanceCharts licenseeId={id} />}

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
