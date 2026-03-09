import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { OSProgressBar } from "@/components/os/OSProgressBar";
import { LicenseeInfoCard } from "@/components/os/LicenseeInfoCard";
import { OSChatDrawer } from "@/components/os/chat";
import { FlowBlockAlert } from "@/components/os/FlowBlockAlert";
import { OSLogisticsSection } from "@/components/logistics/OSLogisticsSection";
import { SlaIndicator } from "@/components/os/SlaIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  ArrowRight, 
  Calendar, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle,
  MessageSquare,
  Loader2,
  AlertTriangle,
  MessageCircle,
  ShieldCheck,
  Lock
} from "lucide-react";
import { ServiceOrder, DepartmentType, DEPARTMENT_INFO, getNextDepartment, OsChecklist } from "@/types/os";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOsFlowValidation, useValidateStage, useLogFlowBlock, FlowValidationResult } from "@/hooks/useOsFlowValidation";

export default function OSDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isManager, profile } = useAuth();

  const [isAdvanceDialogOpen, setIsAdvanceDialogOpen] = useState(false);
  const [advanceNotes, setAdvanceNotes] = useState("");
  
  // Flow validation hooks
  const { data: flowValidation, isLoading: isLoadingValidation } = useOsFlowValidation(id);
  const validateStageMutation = useValidateStage();
  const logFlowBlockMutation = useLogFlowBlock();
  
  // Extended ServiceOrder type with new fields
  type ExtendedServiceOrder = ServiceOrder & {
    stage_sla_deadline?: string | null;
    checklist_completed?: boolean;
    stage_validated_at?: string | null;
    stage_validated_by?: string | null;
  };

  // Fetch OS details with new SLA fields
  const { data: order, isLoading } = useQuery({
    queryKey: ["service-order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select(`
          *,
          customer:customers(*)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as ExtendedServiceOrder;
    },
    enabled: !!id,
  });

  // Fetch stage history
  const { data: stageHistory = [] } = useQuery({
    queryKey: ["os-stage-history", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("os_stage_history")
        .select("*")
        .eq("service_order_id", id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch checklist for current department
  const { data: currentChecklist } = useQuery({
    queryKey: ["os-checklist", id, order?.current_department],
    queryFn: async () => {
      if (!order) return null;
      
      const { data, error } = await supabase
        .from("os_checklists")
        .select("*")
        .eq("service_order_id", id)
        .eq("department", order.current_department)
        .single();

      if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
      if (!data) return null;
      
      // Transform the data to match OsChecklist type
      return {
        ...data,
        items: (data.items as unknown as OsChecklist["items"]) || [],
      } as OsChecklist;
    },
    enabled: !!id && !!order,
  });

  // Advance OS mutation with flow validation
  const advanceMutation = useMutation({
    mutationFn: async () => {
      if (!order || !user) throw new Error("Dados inválidos");

      // Re-check flow validation before advancing
      if (flowValidation && !flowValidation.can_advance) {
        // Log blocked attempt
        await logFlowBlockMutation.mutateAsync({
          actionType: "advance_blocked",
          resourceType: "service_order",
          resourceId: order.id,
          reason: flowValidation.block_reason || "Validação de fluxo falhou",
          department: order.current_department,
          severity: "warning",
        });
        throw new Error(flowValidation.block_reason || "Não é possível avançar esta OP");
      }

      const nextDept = getNextDepartment(order.current_department);
      if (!nextDept) throw new Error("Esta é a última etapa");

      // Create stage history entry for completed stage
      await supabase.from("os_stage_history").insert({
        service_order_id: order.id,
        department: order.current_department,
        status: "completed",
        started_at: order.started_at,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        notes: advanceNotes || null,
        sla_deadline: order.stage_sla_deadline,
        sla_breached: flowValidation?.sla_status === "breached",
        checklist_completed: true,
      });

      // Get SLA config for next department
      const { data: slaConfig } = await supabase
        .from("department_sla_config")
        .select("*")
        .eq("department_type", nextDept)
        .single();

      const newSlaDeadline = slaConfig
        ? new Date(Date.now() + (slaConfig.default_sla_hours || 24) * 60 * 60 * 1000).toISOString()
        : null;

      // Update OS to next department with new SLA
      const { error } = await supabase
        .from("service_orders")
        .update({
          current_department: nextDept,
          status: "active",
          stage_sla_deadline: newSlaDeadline,
          stage_started_at: new Date().toISOString(),
          checklist_completed: false,
          stage_validated_at: null,
          stage_validated_by: null,
        })
        .eq("id", order.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("OS avançada para próxima etapa!");
      queryClient.invalidateQueries({ queryKey: ["service-order", id] });
      queryClient.invalidateQueries({ queryKey: ["os-stage-history", id] });
      queryClient.invalidateQueries({ queryKey: ["os-flow-validation", id] });
      setIsAdvanceDialogOpen(false);
      setAdvanceNotes("");
    },
    onError: (error: Error) => {
      toast.error("Erro ao avançar OS: " + error.message);
    },
  });

  // Complete OS mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!order || !user) throw new Error("Dados inválidos");

      // Create final stage history entry
      await supabase.from("os_stage_history").insert({
        service_order_id: order.id,
        department: order.current_department,
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        notes: advanceNotes || null,
      });

      // Update OS to completed
      const { error } = await supabase
        .from("service_orders")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("OP concluída com sucesso! 🎉");
      queryClient.invalidateQueries({ queryKey: ["service-order", id] });
      setIsAdvanceDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Erro ao concluir OS: " + error.message);
    },
  });

  if (isLoading) {
    return (
      <BoardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </BoardLayout>
    );
  }

  if (!order) {
    return (
      <BoardLayout>
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground">OS não encontrada</h2>
          <Button variant="link" onClick={() => navigate("/os")}>
            Voltar ao Kanban
          </Button>
        </div>
      </BoardLayout>
    );
  }

  const deptInfo = DEPARTMENT_INFO[order.current_department];
  const nextDept = getNextDepartment(order.current_department);
  const isLastStage = !nextDept;
  const completedDepartments = stageHistory
    .filter((s) => s.status === "completed")
    .map((s) => s.department as DepartmentType);

  // Check if user can advance (manager or assigned operator)
  const canAdvance = isManager || order.assigned_to === user?.id || profile?.department === order.current_department;

  return (
    <BoardLayout>
      <div className="space-y-4 lg:space-y-6 max-w-6xl mx-auto">
        {/* Back button */}
        <Button variant="ghost" onClick={() => navigate("/os")} className="mb-2 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Kanban
        </Button>

        {/* Header with progress bar */}
        <Card>
          <CardHeader className="pb-3 lg:pb-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3 lg:gap-4">
                  <div
                    className="flex h-12 w-12 lg:h-14 lg:w-14 items-center justify-center rounded-xl text-xl lg:text-2xl flex-shrink-0"
                    style={{ backgroundColor: deptInfo.color + "20" }}
                  >
                    {deptInfo.icon}
                  </div>
                    <div className="min-w-0 flex-1">
                    <p className="text-xs lg:text-sm font-medium text-muted-foreground">{order.os_number}</p>
                    <CardTitle className="text-lg lg:text-xl leading-tight">{order.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge
                        variant={order.status === "completed" ? "default" : order.status === "active" ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {order.status === "completed" ? "Concluída" : order.status === "active" ? "Ativa" : order.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{deptInfo.name}</Badge>
                      
                      {/* SLA Indicator */}
                      {order.stage_sla_deadline && order.status !== "completed" && flowValidation && (
                        <SlaIndicator
                          deadline={order.stage_sla_deadline}
                          status={flowValidation.sla_status}
                          size="sm"
                        />
                      )}
                      
                      {/* Checklist status */}
                      {!flowValidation?.checklist_complete && order.status === "active" && (
                        <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">
                          <Lock className="h-3 w-3 mr-1" />
                          Checklist pendente
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 sm:flex-shrink-0">
                  {/* Chat Drawer Button */}
                  <OSChatDrawer 
                    serviceOrderId={order.id} 
                    osNumber={order.os_number}
                    currentDepartment={deptInfo.name}
                    onCompleteStage={() => setIsAdvanceDialogOpen(true)}
                  >
                    <Button variant="outline" size="sm" className="gap-2">
                      <MessageCircle className="h-4 w-4" />
                      <span className="hidden sm:inline">Chat</span>
                    </Button>
                  </OSChatDrawer>

                  {order.status !== "completed" && canAdvance && (
                    <Button
                      onClick={() => setIsAdvanceDialogOpen(true)}
                      className="gap-2"
                      size="sm"
                      disabled={!flowValidation?.can_advance}
                      title={!flowValidation?.can_advance ? flowValidation?.block_reason || "Não é possível avançar" : undefined}
                    >
                      {!flowValidation?.can_advance && <Lock className="h-4 w-4" />}
                      {isLastStage ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="truncate">Concluir OS</span>
                        </>
                      ) : (
                        <>
                          <span className="truncate hidden sm:inline">Avançar para {DEPARTMENT_INFO[nextDept!].name}</span>
                          <span className="sm:hidden">Avançar</span>
                          <ArrowRight className="h-4 w-4 flex-shrink-0" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <OSProgressBar
              currentDepartment={order.current_department}
              completedDepartments={completedDepartments}
            />
          </CardContent>
        </Card>

        {/* Flow Block Alert */}
        {flowValidation && !flowValidation.can_advance && order.status === "active" && (
          <FlowBlockAlert
            validation={flowValidation}
            onValidate={flowValidation.checklist_complete ? () => {
              validateStageMutation.mutate({ osId: order.id });
            } : undefined}
            isValidating={validateStageMutation.isPending}
          />
        )}

        {/* Main content grid */}
        <div className="grid gap-4 lg:gap-6 lg:grid-cols-3">
          {/* Left column - Details & History */}
          <div className="lg:col-span-2 space-y-4 lg:space-y-6">
            {/* Main info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base lg:text-lg">Detalhes da OP</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {order.description && (
                  <div>
                    <p className="text-xs lg:text-sm font-medium text-muted-foreground mb-1">Descrição</p>
                    <p className="text-sm lg:text-base text-foreground">{order.description}</p>
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs lg:text-sm font-medium text-muted-foreground mb-1">Criado em</p>
                    <p className="text-sm text-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">
                        {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </p>
                  </div>

                  {order.due_date && (
                    <div>
                      <p className="text-xs lg:text-sm font-medium text-muted-foreground mb-1">Prazo</p>
                      <p className="text-sm text-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">
                          {format(new Date(order.due_date), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Stage history */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base lg:text-lg">Histórico de Etapas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stageHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum histórico ainda</p>
                  ) : (
                    stageHistory.map((stage) => {
                      const stageInfo = DEPARTMENT_INFO[stage.department as DepartmentType];
                      return (
                        <div key={stage.id} className="flex gap-3">
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-full text-sm flex-shrink-0"
                            style={{ backgroundColor: stageInfo.color + "20" }}
                          >
                            {stageInfo.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{stageInfo.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {stage.completed_at
                                ? formatDistanceToNow(new Date(stage.completed_at), {
                                    locale: ptBR,
                                    addSuffix: true,
                                  })
                                : "Em andamento"}
                            </p>
                            {stage.notes && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                                <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                <span className="break-words">{stage.notes}</span>
                              </p>
                            )}
                          </div>
                          {stage.status === "completed" && (
                            <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Checklist section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                  <span>{deptInfo.icon}</span> Checklist - {deptInfo.name}
                </CardTitle>
                <CardDescription className="text-xs lg:text-sm">
                  Complete o checklist desta etapa antes de avançar
                </CardDescription>
              </CardHeader>
              <CardContent>
                {currentChecklist ? (
                  <div className="space-y-2">
                    {/* Display checklist items here */}
                    <p className="text-muted-foreground text-sm">Checklist carregado</p>
                  </div>
                ) : (
                  <div className="text-center py-6 lg:py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhum checklist configurado para esta etapa</p>
                    {isManager && (
                      <Button variant="link" className="mt-2 text-xs lg:text-sm">
                        Criar template de checklist
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Logistics section */}
            {id && <OSLogisticsSection serviceOrderId={id} />}
          </div>

          {/* Right column - Licensee info */}
          <div className="lg:col-span-1">
            <LicenseeInfoCard 
              order={order} 
              stageHistory={stageHistory.map(s => ({
                id: s.id,
                department: s.department,
                status: s.status,
                completed_at: s.completed_at
              }))} 
            />
          </div>
        </div>
      </div>

      {/* Advance Dialog */}
      <Dialog open={isAdvanceDialogOpen} onOpenChange={setIsAdvanceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {isLastStage ? "Concluir Ordem de Produção" : "Avançar para Próxima Etapa"}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {isLastStage
                ? "Esta ação irá marcar a OP como concluída."
                : `A OP será movida para ${DEPARTMENT_INFO[nextDept!].name}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Observações (opcional)</label>
              <Textarea
                placeholder="Adicione observações sobre esta etapa..."
                value={advanceNotes}
                onChange={(e) => setAdvanceNotes(e.target.value)}
                rows={3}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsAdvanceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => isLastStage ? completeMutation.mutate() : advanceMutation.mutate()}
              disabled={advanceMutation.isPending || completeMutation.isPending}
            >
              {advanceMutation.isPending || completeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : isLastStage ? (
                "Concluir OS"
              ) : (
                "Avançar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BoardLayout>
  );
}
