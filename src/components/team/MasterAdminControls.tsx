import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Shield,
  Sliders,
  KeyRound,
  UserCheck,
  UserX,
  Building2,
  Users,
  MoreVertical,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TeamMember } from "@/hooks/useTeamMembers";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type DepartmentType = Database["public"]["Enums"]["department_type"];

interface MasterAdminControlsProps {
  member: TeamMember;
  onUpdated: () => void;
}

import { ALL_DEPARTMENTS } from "@/constants/departments";

const DEPARTMENTS = ALL_DEPARTMENTS;

type DialogType =
  | "role"
  | "scope"
  | "reset-password"
  | "toggle-active"
  | "delegate"
  | "transfer"
  | null;

export function MasterAdminControls({ member, onUpdated }: MasterAdminControlsProps) {
  const [openDialog, setOpenDialog] = useState<DialogType>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Role change state
  const [newRole, setNewRole] = useState<AppRole>(
    member.roles.includes("admin") ? "admin" :
    member.roles.includes("manager") ? "manager" :
    member.roles.includes("operator") ? "operator" : "viewer"
  );

  // Department delegation state
  const [newDepartment, setNewDepartment] = useState<DepartmentType | "">(member.department || "");

  const logCriticalAction = async (actionType: string, details: Record<string, unknown>) => {
    try {
      await supabase.from("governance_audit_log").insert({
        action_type: actionType,
        resource_type: "profile",
        resource_id: member.id,
        details: { ...details, target_username: member.username, target_name: member.full_name },
      });
    } catch {
      // silent
    }
  };

  const handleRoleChange = async () => {
    setIsLoading(true);
    try {
      // Delete existing roles
      await supabase.from("user_roles").delete().eq("user_id", member.id);
      // Insert new role
      const { error } = await supabase.from("user_roles").insert({ user_id: member.id, role: newRole });
      if (error) throw error;
      await logCriticalAction("role_changed", { new_role: newRole, previous_roles: member.roles });
      toast.success("Role alterada com sucesso!");
      setOpenDialog(null);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar role");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ password_must_change: true })
        .eq("id", member.id);
      if (error) throw error;
      await logCriticalAction("password_reset_forced", { actor: "master_admin" });
      toast.success("Senha resetada — usuário deverá trocar no próximo acesso.");
      setOpenDialog(null);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || "Erro ao resetar senha");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async () => {
    setIsLoading(true);
    const newStatus = member.status === "approved" ? "rejected" : "approved";
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: newStatus })
        .eq("id", member.id);
      if (error) throw error;
      await logCriticalAction("user_status_changed", { new_status: newStatus });
      toast.success(newStatus === "approved" ? "Usuário ativado!" : "Usuário desativado!");
      setOpenDialog(null);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar status");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelegateDepartment = async () => {
    if (!newDepartment) return;
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ department: newDepartment })
        .eq("id", member.id);
      if (error) throw error;
      await logCriticalAction("department_delegated", { new_department: newDepartment });
      toast.success("Departamento delegado com sucesso!");
      setOpenDialog(null);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || "Erro ao delegar departamento");
    } finally {
      setIsLoading(false);
    }
  };

  const isActive = member.status === "approved";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-primary font-semibold uppercase tracking-wider">
            Master Admin
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpenDialog("role")}>
            <Shield className="mr-2 h-4 w-4" />
            Alterar Role
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenDialog("scope")}>
            <Sliders className="mr-2 h-4 w-4" />
            Definir Escopo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenDialog("reset-password")}>
            <KeyRound className="mr-2 h-4 w-4" />
            Resetar Senha
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenDialog("delegate")}>
            <Building2 className="mr-2 h-4 w-4" />
            Delegar Departamento
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenDialog("transfer")}>
            <Users className="mr-2 h-4 w-4" />
            Transferir Subordinação
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setOpenDialog("toggle-active")}
            className={isActive ? "text-destructive focus:text-destructive" : "text-emerald-600 focus:text-emerald-600"}
          >
            {isActive ? (
              <><UserX className="mr-2 h-4 w-4" />Desativar Usuário</>
            ) : (
              <><UserCheck className="mr-2 h-4 w-4" />Ativar Usuário</>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog: Alterar Role */}
      <Dialog open={openDialog === "role"} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Alterar Role — {member.full_name}
            </DialogTitle>
            <DialogDescription>
              Selecione a nova role para este usuário. Ação registrada em auditoria.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Nova Role</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Visualizador</SelectItem>
                <SelectItem value="operator">Operador</SelectItem>
                <SelectItem value="manager">Gestor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancelar</Button>
            <Button onClick={handleRoleChange} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Definir Escopo */}
      <Dialog open={openDialog === "scope"} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              Definir Escopo — {member.full_name}
            </DialogTitle>
            <DialogDescription>
              O escopo de acesso é gerenciado via módulo de Roles Carbo. Utilize a seção de Governança no painel Admin.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">
            Departamento atual: <strong>{member.department || "Global"}</strong>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Resetar Senha */}
      <Dialog open={openDialog === "reset-password"} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-warning" />
              Resetar Senha — {member.full_name}
            </DialogTitle>
            <DialogDescription>
              O usuário será forçado a trocar a senha no próximo login. Esta ação é registrada em auditoria.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={isLoading} variant="destructive">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Forçar Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ativar / Desativar */}
      <Dialog open={openDialog === "toggle-active"} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isActive
                ? <UserX className="h-5 w-5 text-destructive" />
                : <UserCheck className="h-5 w-5 text-success" />}
              {isActive ? "Desativar" : "Ativar"} Usuário — {member.full_name}
            </DialogTitle>
            <DialogDescription>
              {isActive
                ? "O usuário perderá acesso à plataforma. Ação registrada em auditoria."
                : "O usuário recuperará acesso à plataforma. Ação registrada em auditoria."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancelar</Button>
            <Button
              onClick={handleToggleActive}
              disabled={isLoading}
              variant={isActive ? "destructive" : "default"}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isActive ? "Desativar" : "Ativar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delegar Departamento */}
      <Dialog open={openDialog === "delegate"} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Delegar Departamento — {member.full_name}
            </DialogTitle>
            <DialogDescription>
              Altere o departamento associado a este usuário.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Departamento</Label>
            <Select value={newDepartment} onValueChange={(v) => setNewDepartment(v as DepartmentType)}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancelar</Button>
            <Button onClick={handleDelegateDepartment} disabled={isLoading || !newDepartment}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Transferir Subordinação */}
      <Dialog open={openDialog === "transfer"} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Transferir Subordinação — {member.full_name}
            </DialogTitle>
            <DialogDescription>
              Esta funcionalidade permite reatribuir o gestor responsável por este usuário. Disponível via módulo Admin Avançado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

