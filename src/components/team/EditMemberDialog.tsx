import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Pencil, Loader2, Mail } from "lucide-react";
import { useUpdateUserRole, useUpdateUserDepartment, type TeamMember } from "@/hooks/useTeamMembers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
import { ALL_DEPARTMENTS } from "@/constants/departments";
type DepartmentType = Database["public"]["Enums"]["department_type"];

const DEPARTMENTS = ALL_DEPARTMENTS;

interface EditMemberDialogProps {
  member: TeamMember;
  onUpdated: () => void;
}

export function EditMemberDialog({ member, onUpdated }: EditMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(member.full_name || "");
  const [email, setEmail] = useState(member.email || "");
  const [department, setDepartment] = useState<DepartmentType | "">(member.department || "");
  const [role, setRole] = useState<AppRole>(
    member.roles.includes("admin")
      ? "admin"
      : member.roles.includes("manager")
      ? "manager"
      : member.roles.includes("operator")
      ? "operator"
      : "viewer"
  );
  const [isLoading, setIsLoading] = useState(false);

  const updateRole = useUpdateUserRole();
  const updateDepartment = useUpdateUserDepartment();

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Update name if changed
      if (fullName !== member.full_name) {
        const { error } = await supabase
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", member.id);
        if (error) throw error;
      }

      // Update email if changed
      if (email !== (member.email || "")) {
        const { error } = await supabase
          .from("profiles")
          .update({ email } as any)
          .eq("id", member.id);
        if (error) throw error;
      }

      // Update role if changed
      const currentRole = member.roles.includes("admin")
        ? "admin"
        : member.roles.includes("manager")
        ? "manager"
        : member.roles.includes("operator")
        ? "operator"
        : "viewer";

      if (role !== currentRole) {
        await updateRole.mutateAsync({ userId: member.id, role });
      }

      // Update department if changed
      if (department && department !== member.department) {
        await updateDepartment.mutateAsync({ userId: member.id, department });
      }

      toast.success("Membro atualizado com sucesso!");
      setOpen(false);
      onUpdated();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar membro");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Membro</DialogTitle>
          <DialogDescription>
            Altere as informações do membro da equipe.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome Completo</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome do membro"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@empresa.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role">Cargo</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cargo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Visualizador</SelectItem>
                <SelectItem value="operator">Operador</SelectItem>
                <SelectItem value="manager">Gestor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="department">Departamento</Label>
            <Select value={department} onValueChange={(v) => setDepartment(v as DepartmentType)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o departamento" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((dept) => (
                  <SelectItem key={dept.value} value={dept.value}>
                    {dept.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
