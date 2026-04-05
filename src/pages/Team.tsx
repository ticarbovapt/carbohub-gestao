import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Users, Shield, Building2, Filter, Mail, Clock, CheckCircle, Loader2, CheckCheck, Network, Upload } from "lucide-react";
import { TeamBulkImport } from "@/components/team/TeamBulkImport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrgChart } from "@/components/team/OrgChart";
import { useOrgChart } from "@/hooks/useOrgChart";
import { useTeamMembers, useUpdateUserRole, useUpdateUserDepartment, TeamMember } from "@/hooks/useTeamMembers";
import { AddMemberDialog } from "@/components/team/AddMemberDialog";
import { EditMemberDialog } from "@/components/team/EditMemberDialog";
import { DeleteMemberDialog } from "@/components/team/DeleteMemberDialog";
import { MasterAdminControls } from "@/components/team/MasterAdminControls";
import { SQUAD_LOGOS } from "@/constants/squadLogos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useResendWelcomeEmail } from "@/hooks/useCreateTeamMember";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type DepartmentType = Database["public"]["Enums"]["department_type"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  operator: "Operador",
  viewer: "Visualizador",
};

import { DEPARTMENT_LABELS, ALL_DEPARTMENTS } from "@/constants/departments";

const DEPARTMENTS = ALL_DEPARTMENTS;

const ROLES: { value: AppRole | "all"; label: string }[] = [
  { value: "all", label: "Todos os Cargos" },
  { value: "admin", label: "Administrador" },
  { value: "manager", label: "Gestor" },
  { value: "operator", label: "Operador" },
  { value: "viewer", label: "Visualizador" },
];

const Team = () => {
  const { data: members, isLoading, refetch } = useTeamMembers();
  const updateRole = useUpdateUserRole();
  const updateDepartment = useUpdateUserDepartment();
  const resendEmail = useResendWelcomeEmail();
  const { isAdmin, isManager, isMasterAdmin, isCeo, isAnyGestor, user } = useAuth();
  const { data: orgTree = [], isLoading: isOrgLoading } = useOrgChart();

  // Filter states
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentType | "all">("all");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [confirmEmailMember, setConfirmEmailMember] = useState<TeamMember | null>(null);
  const [emailSentMember, setEmailSentMember] = useState<TeamMember | null>(null);

  // Filter only approved members (exclude deleted)
  const approvedMembers = members?.filter((m) => m.status === "approved") || [];
  
  // For admins/CEO, show all. For managers/gestores, show members they created
  const canSeeAll = isAdmin || isCeo || isMasterAdmin;
  const visibleMembers = canSeeAll
    ? approvedMembers
    : approvedMembers.filter((m) => m.created_by_manager === user?.id || !m.password_must_change);
  
  // Apply filters
  const filteredMembers = visibleMembers.filter((member) => {
    const matchesDepartment = departmentFilter === "all" || member.department === departmentFilter;
    const matchesRole = roleFilter === "all" || member.roles.includes(roleFilter as AppRole);
    return matchesDepartment && matchesRole;
  });
  
  const adminCount = approvedMembers.filter((m) => m.roles.includes("admin")).length;
  const uniqueDepartments = new Set(approvedMembers.map((m) => m.department).filter(Boolean)).size;
  const pendingAccessCount = approvedMembers.filter((m) => m.password_must_change).length;

  const getMemberStatus = (member: TeamMember): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode } => {
    if (member.password_must_change) {
      return { 
        label: "Aguardando primeiro acesso", 
        variant: "outline",
        icon: <Clock className="h-3 w-3" />
      };
    }
    if (member.last_access) {
      return { 
        label: "Ativo", 
        variant: "default",
        icon: <CheckCircle className="h-3 w-3" />
      };
    }
    return { 
      label: "Ativo", 
      variant: "secondary",
      icon: <CheckCircle className="h-3 w-3" />
    };
  };

  const handleResendEmail = async (member: TeamMember) => {
    if (!member.username) {
      toast.error("Usuário não possui username definido");
      return;
    }
    
    try {
      await resendEmail.mutateAsync({
        userId: member.id,
        email: member.email || undefined,
        fullName: member.full_name || "Usuário",
        username: member.username,
      });
      setConfirmEmailMember(null);
      setEmailSentMember(member);
    } catch (error: any) {
      toast.error(error.message || "Erro ao reenviar e-mail");
      setConfirmEmailMember(null);
    }
  };


  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleDisplay = (roles: AppRole[]) => {
    if (roles.includes("admin")) return ROLE_LABELS.admin;
    if (roles.includes("manager")) return ROLE_LABELS.manager;
    if (roles.includes("operator")) return ROLE_LABELS.operator;
    if (roles.includes("viewer")) return ROLE_LABELS.viewer;
    return "Sem papel";
  };

  const getPrimaryRole = (roles: AppRole[]): AppRole => {
    if (roles.includes("admin")) return "admin";
    if (roles.includes("manager")) return "manager";
    if (roles.includes("operator")) return "operator";
    return "viewer";
  };

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    try {
      await updateRole.mutateAsync({ userId, role: newRole });
      toast.success("Papel atualizado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar papel");
    }
  };

  const handleDepartmentChange = async (userId: string, department: DepartmentType) => {
    try {
      await updateDepartment.mutateAsync({ userId, department });
      toast.success("Departamento atualizado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar departamento");
    }
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Equipe</h1>
            <p className="mt-1 text-muted-foreground">
              Gerenciamento de usuários e permissões da plataforma
            </p>
          </div>
          {(isAdmin || isManager || isCeo || isAnyGestor) && <AddMemberDialog onMemberAdded={() => refetch()} />}
        </div>

        <Tabs defaultValue="equipe" className="w-full">
          <TabsList>
            <TabsTrigger value="equipe" className="gap-2">
              <Users className="h-4 w-4" />
              Equipe
            </TabsTrigger>
            <TabsTrigger value="organograma" className="gap-2">
              <Network className="h-4 w-4" />
              Organograma
            </TabsTrigger>
            <TabsTrigger value="importar" className="gap-2">
              <Upload className="h-4 w-4" />
              Importar Time
            </TabsTrigger>
          </TabsList>

          <TabsContent value="equipe" className="space-y-6 mt-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Users, title: "Total de Membros", value: approvedMembers.length.toString() },
          { icon: Shield, title: "Administradores", value: adminCount.toString() },
          { icon: Building2, title: "Departamentos", value: uniqueDepartments.toString() },
          { icon: Clock, title: "Aguardando Acesso", value: pendingAccessCount.toString(), highlight: pendingAccessCount > 0 },
        ].map((item, index) => (
          <div
            key={index}
            className="rounded-xl border border-border bg-board-surface p-6"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-board-navy/10">
                <item.icon className="h-5 w-5 text-board-navy" />
              </div>
              <div>
                <p className="text-sm text-board-muted">{item.title}</p>
                {isLoading ? (
                  <Skeleton className="h-6 w-8" />
                ) : (
                  <p className="text-lg font-semibold text-board-text">{item.value}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-board-muted" />
          <span className="text-sm text-board-muted">Filtros:</span>
        </div>
        <Select
          value={departmentFilter}
          onValueChange={(value) => setDepartmentFilter(value as DepartmentType | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Departamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Departamentos</SelectItem>
            {DEPARTMENTS.map((dept) => (
              <SelectItem key={dept.value} value={dept.value}>
                {dept.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={roleFilter}
          onValueChange={(value) => setRoleFilter(value as AppRole | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Cargo" />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(departmentFilter !== "all" || roleFilter !== "all") && (
          <button
            onClick={() => {
              setDepartmentFilter("all");
              setRoleFilter("all");
            }}
            className="text-sm text-board-navy hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-board-surface overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-board-text">Membros da Equipe</h2>
        </div>
        <div className="divide-y divide-border">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div>
                    <Skeleton className="h-5 w-32 mb-1" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))
          ) : filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-board-muted">
              <Users className="h-12 w-12 mb-4 opacity-50" />
              <p>Nenhum membro encontrado</p>
              <p className="text-sm">
                {departmentFilter !== "all" || roleFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Adicione membros para começar"}
              </p>
            </div>
          ) : (
            filteredMembers.map((member) => {
              const status = getMemberStatus(member);
              const canManageMember = isAdmin || isCeo || isMasterAdmin || ((isManager || isAnyGestor) && member.created_by_manager === user?.id);
              
              return (
                <div key={member.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="relative h-10 w-10 flex-shrink-0">
                      {member.department && SQUAD_LOGOS[member.department] ? (
                        <img
                          src={SQUAD_LOGOS[member.department]}
                          alt={member.department}
                          className="h-10 w-10 rounded-full object-cover ring-2 ring-border"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-board-navy text-board-surface font-semibold">
                          {getInitials(member.full_name)}
                        </div>
                      )}
                      {member.password_must_change && (
                        <span className="absolute -top-1 -right-1 h-3 w-3 bg-warning rounded-full border-2 border-background" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-board-text">{member.full_name || "Sem nome"}</p>
                        {member.username && (
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {member.username}
                          </code>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-board-muted">
                        {(isAdmin || isCeo) ? (
                          <>
                            <Select
                              value={getPrimaryRole(member.roles)}
                              onValueChange={(value) => handleRoleChange(member.id, value as AppRole)}
                            >
                              <SelectTrigger className="h-7 w-28 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="operator">Operador</SelectItem>
                                <SelectItem value="manager">Gestor</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            <span>•</span>
                            <Select
                              value={member.department || ""}
                              onValueChange={(value) =>
                                handleDepartmentChange(member.id, value as DepartmentType)
                              }
                            >
                              <SelectTrigger className="h-7 w-28 text-xs">
                                <SelectValue placeholder="Departamento" />
                              </SelectTrigger>
                              <SelectContent>
                                {DEPARTMENTS.map((dept) => (
                                  <SelectItem key={dept.value} value={dept.value}>
                                    {dept.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </>
                        ) : (
                          <span>
                            {getRoleDisplay(member.roles)} •{" "}
                            {member.department
                              ? DEPARTMENT_LABELS[member.department]
                              : "Sem departamento"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={status.variant}
                      className={member.password_must_change ? "bg-amber-100 text-amber-700 border-amber-300" : ""}
                    >
                      <span className="flex items-center gap-1">
                        {status.icon}
                        {status.label}
                      </span>
                    </Badge>
                    
                    {member.password_must_change && canManageMember && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmEmailMember(member)}
                            disabled={resendEmail.isPending}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Reenviar e-mail de acesso</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    
                    <Badge variant={member.roles.includes("admin") ? "default" : "secondary"}>
                      {getRoleDisplay(member.roles)}
                    </Badge>
                    
                    {(isAdmin || isCeo) && (
                      <>
                        <EditMemberDialog member={member} onUpdated={() => refetch()} />
                        <DeleteMemberDialog member={member} onDeleted={() => refetch()} />
                      </>
                    )}

                    {/* MasterAdmin exclusive controls */}
                    {isMasterAdmin && (
                      <MasterAdminControls member={member} onUpdated={() => refetch()} />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
          </TabsContent>

          <TabsContent value="organograma" className="mt-6">
            <div className="rounded-xl border border-border bg-board-surface p-6">
              <OrgChart tree={orgTree} isLoading={isOrgLoading} />
            </div>
          </TabsContent>

          <TabsContent value="importar" className="mt-6">
            <TeamBulkImport />
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmEmailMember} onOpenChange={(open) => !open && setConfirmEmailMember(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Reenviar e-mail de acesso
            </DialogTitle>
            <DialogDescription>
              Confirme o reenvio do convite com as credenciais temporárias.
            </DialogDescription>
          </DialogHeader>
          {confirmEmailMember && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Nome</span>
                  <span className="text-sm font-medium">{confirmEmailMember.full_name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Usuário</span>
                  <code className="text-sm font-mono bg-background px-1.5 py-0.5 rounded">{confirmEmailMember.username || "—"}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">E-mail</span>
                  <span className="text-sm font-medium">{confirmEmailMember.email || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Cargo</span>
                  <span className="text-sm">{getRoleDisplay(confirmEmailMember.roles)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Departamento</span>
                  <span className="text-sm">{confirmEmailMember.department ? DEPARTMENT_LABELS[confirmEmailMember.department] || confirmEmailMember.department : "—"}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Uma nova senha temporária será gerada e enviada para o e-mail acima.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEmailMember(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => confirmEmailMember && handleResendEmail(confirmEmailMember)}
              disabled={resendEmail.isPending}
            >
              {resendEmail.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Enviar convite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={!!emailSentMember} onOpenChange={(open) => !open && setEmailSentMember(null)}>
        <DialogContent className="sm:max-w-[380px] text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
              <CheckCheck className="h-7 w-7 text-success" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">E-mail enviado!</h3>
              <p className="text-sm text-muted-foreground">
                O convite de acesso foi reenviado com sucesso para{" "}
                <strong>{emailSentMember?.full_name}</strong> no e-mail{" "}
                <strong>{emailSentMember?.email || "cadastrado"}</strong>.
              </p>
            </div>
            <Button onClick={() => setEmailSentMember(null)} className="mt-2">
              Entendido
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </BoardLayout>
  );
};

export default Team;
