import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Shield, Users } from "lucide-react";
import { 
  CARBO_ROLES, 
  MACRO_FLOWS, 
  DEPARTMENT_TYPES, 
  type CarboRole, 
  type MacroFlow, 
  type DepartmentType 
} from "@/types/carboRoles";

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string | null;
  roles: {
    id: string;
    role: CarboRole;
    scope_macro_flows: MacroFlow[] | null;
    scope_departments: DepartmentType[] | null;
  }[];
}

export const CarboRolesManager = () => {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<CarboRole | "">("");
  const [selectedMacroFlows, setSelectedMacroFlows] = useState<MacroFlow[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<DepartmentType[]>([]);

  // Fetch users with their Carbo roles
  const { data: usersWithRoles, isLoading } = useQuery({
    queryKey: ["users-with-carbo-roles"],
    queryFn: async () => {
      // First get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");

      if (profilesError) throw profilesError;

      // Get all carbo_user_roles
      const { data: roles, error: rolesError } = await supabase
        .from("carbo_user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      // Get emails from auth.users via a different approach
      // We'll use the profiles and match with roles
      const usersMap = new Map<string, UserWithRoles>();

      profiles?.forEach((profile) => {
        usersMap.set(profile.id, {
          id: profile.id,
          email: "", // We'll need to get this from somewhere else
          full_name: profile.full_name,
          roles: [],
        });
      });

      roles?.forEach((role) => {
        const user = usersMap.get(role.user_id);
        if (user) {
          user.roles.push({
            id: role.id,
            role: role.role as CarboRole,
            scope_macro_flows: role.scope_macro_flows as MacroFlow[] | null,
            scope_departments: role.scope_departments as DepartmentType[] | null,
          });
        }
      });

      return Array.from(usersMap.values()).filter(u => u.full_name);
    },
  });

  // Mutation to add a new role (upsert to handle duplicates)
  const addRoleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId || !selectedRole) {
        throw new Error("Usuário e role são obrigatórios");
      }

      // Check if role already exists for this user
      const { data: existingRole } = await supabase
        .from("carbo_user_roles")
        .select("id")
        .eq("user_id", selectedUserId)
        .eq("role", selectedRole)
        .maybeSingle();

      if (existingRole) {
        // Update existing role with new scopes
        const { error } = await supabase
          .from("carbo_user_roles")
          .update({
            scope_macro_flows: selectedMacroFlows.length > 0 ? selectedMacroFlows : null,
            scope_departments: selectedDepartments.length > 0 ? selectedDepartments : null,
          })
          .eq("id", existingRole.id);

        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase.from("carbo_user_roles").insert({
          user_id: selectedUserId,
          role: selectedRole,
          scope_macro_flows: selectedMacroFlows.length > 0 ? selectedMacroFlows : null,
          scope_departments: selectedDepartments.length > 0 ? selectedDepartments : null,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Role atribuído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["users-with-carbo-roles"] });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atribuir role: ${error.message}`);
    },
  });

  // Mutation to remove a role
  const removeRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from("carbo_user_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role removido com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["users-with-carbo-roles"] });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao remover role: ${error.message}`);
    },
  });

  const resetForm = () => {
    setSelectedUserId("");
    setSelectedRole("");
    setSelectedMacroFlows([]);
    setSelectedDepartments([]);
  };

  const getRoleBadgeVariant = (role: CarboRole) => {
    switch (role) {
      case "ceo":
        return "default";
      case "gestor_adm":
      case "gestor_fin":
      case "gestor_compras":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRoleLabel = (role: CarboRole) => {
    return CARBO_ROLES.find(r => r.id === role)?.name || role;
  };

  const getMacroFlowLabel = (flow: MacroFlow) => {
    return MACRO_FLOWS.find(f => f.id === flow)?.name || flow;
  };

  const getDepartmentLabel = (dept: DepartmentType) => {
    return DEPARTMENT_TYPES.find(d => d.id === dept)?.name || dept;
  };

  const toggleMacroFlow = (flow: MacroFlow) => {
    setSelectedMacroFlows(prev => 
      prev.includes(flow) 
        ? prev.filter(f => f !== flow)
        : [...prev, flow]
    );
  };

  const toggleDepartment = (dept: DepartmentType) => {
    setSelectedDepartments(prev => 
      prev.includes(dept) 
        ? prev.filter(d => d !== dept)
        : [...prev, dept]
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Gestão de Roles Carbo</CardTitle>
              <CardDescription>
                Atribua roles e escopos aos usuários conforme a estrutura organizacional
              </CardDescription>
            </div>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Atribuir Role
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Atribuir Role Carbo</DialogTitle>
                <DialogDescription>
                  Selecione o usuário, role e escopo de atuação
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                {/* User Selection */}
                <div className="space-y-2">
                  <Label>Usuário</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {usersWithRoles?.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name || "Sem nome"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Role Selection */}
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as CarboRole)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um role" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARBO_ROLES.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          <div className="flex flex-col">
                            <span>{role.name}</span>
                            <span className="text-xs text-muted-foreground">{role.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Macro Flows Scope */}
                <div className="space-y-2">
                  <Label>Escopo - Macro Fluxos</Label>
                  <div className="grid grid-cols-1 gap-2 border rounded-md p-3">
                    {MACRO_FLOWS.map((flow) => (
                      <div key={flow.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`flow-${flow.id}`}
                          checked={selectedMacroFlows.includes(flow.id)}
                          onCheckedChange={() => toggleMacroFlow(flow.id)}
                        />
                        <Label 
                          htmlFor={`flow-${flow.id}`} 
                          className="text-sm font-normal cursor-pointer"
                        >
                          {flow.icon} {flow.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Departments Scope */}
                <div className="space-y-2">
                  <Label>Escopo - Departamentos</Label>
                  <div className="grid grid-cols-2 gap-2 border rounded-md p-3">
                    {DEPARTMENT_TYPES.map((dept) => (
                      <div key={dept.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dept-${dept.id}`}
                          checked={selectedDepartments.includes(dept.id)}
                          onCheckedChange={() => toggleDepartment(dept.id)}
                        />
                        <Label 
                          htmlFor={`dept-${dept.id}`} 
                          className="text-sm font-normal cursor-pointer"
                        >
                          {dept.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={() => addRoleMutation.mutate()}
                  disabled={!selectedUserId || !selectedRole || addRoleMutation.isPending}
                >
                  {addRoleMutation.isPending ? "Salvando..." : "Atribuir"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Macro Fluxos</TableHead>
              <TableHead>Departamentos</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersWithRoles?.filter(u => u.roles.length > 0).map((user) => (
              user.roles.map((role, index) => (
                <TableRow key={role.id}>
                  {index === 0 && (
                    <TableCell rowSpan={user.roles.length} className="font-medium">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {user.full_name || "Sem nome"}
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(role.role)}>
                      {getRoleLabel(role.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {role.scope_macro_flows?.map((flow) => (
                        <Badge key={flow} variant="outline" className="text-xs">
                          {getMacroFlowLabel(flow)}
                        </Badge>
                      )) || (
                        <span className="text-sm text-muted-foreground">Todos</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {role.scope_departments?.map((dept) => (
                        <Badge key={dept} variant="outline" className="text-xs">
                          {getDepartmentLabel(dept)}
                        </Badge>
                      )) || (
                        <span className="text-sm text-muted-foreground">Todos</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeRoleMutation.mutate(role.id)}
                      disabled={removeRoleMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ))}
            {(!usersWithRoles || usersWithRoles.filter(u => u.roles.length > 0).length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum usuário com roles Carbo atribuídos
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
