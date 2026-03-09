import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ClipboardList, Lock } from "lucide-react";
import { 
  CARBO_ROLES, 
  DEPARTMENT_TYPES, 
  type CarboRole, 
  type DepartmentType 
} from "@/types/carboRoles";

interface StageAccess {
  id: string;
  department_type: DepartmentType;
  role: CarboRole;
  can_view: boolean;
  can_execute: boolean;
  can_validate: boolean;
}

export const StageAccessManager = () => {
  const queryClient = useQueryClient();

  const { data: stageAccess, isLoading } = useQuery({
    queryKey: ["stage-access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("os_stage_access")
        .select("*")
        .order("department_type");

      if (error) throw error;
      return data as StageAccess[];
    },
  });

  const updateAccessMutation = useMutation({
    mutationFn: async ({ 
      id, 
      field, 
      value 
    }: { 
      id: string; 
      field: "can_view" | "can_execute" | "can_validate"; 
      value: boolean;
    }) => {
      const { error } = await supabase
        .from("os_stage_access")
        .update({ [field]: value })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permissão atualizada!");
      queryClient.invalidateQueries({ queryKey: ["stage-access"] });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const getRoleLabel = (role: CarboRole) => {
    return CARBO_ROLES.find(r => r.id === role)?.name || role;
  };

  const getDepartmentLabel = (dept: DepartmentType) => {
    return DEPARTMENT_TYPES.find(d => d.id === dept)?.name || dept;
  };

  const handleToggle = (
    id: string, 
    field: "can_view" | "can_execute" | "can_validate", 
    currentValue: boolean
  ) => {
    updateAccessMutation.mutate({ id, field, value: !currentValue });
  };

  // Group by department
  const accessByDepartment = stageAccess?.reduce((acc, access) => {
    if (!acc[access.department_type]) {
      acc[access.department_type] = [];
    }
    acc[access.department_type].push(access);
    return acc;
  }, {} as Record<DepartmentType, StageAccess[]>) || {};

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
        <div className="flex items-center gap-3">
          <Lock className="h-6 w-6 text-primary" />
          <div>
            <CardTitle>Matriz de Acesso por Etapa</CardTitle>
            <CardDescription>
              Configure quais roles podem visualizar, executar ou validar cada etapa da OS
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {DEPARTMENT_TYPES.map((dept) => {
          const deptAccess = accessByDepartment[dept.id] || [];
          
          return (
            <div key={dept.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{dept.name}</Badge>
                <span className="text-sm text-muted-foreground">
                  Etapa do fluxo de OS
                </span>
              </div>
              
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Role</TableHead>
                      <TableHead className="text-center">Pode Visualizar</TableHead>
                      <TableHead className="text-center">Pode Executar</TableHead>
                      <TableHead className="text-center">Pode Validar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deptAccess.length > 0 ? (
                      deptAccess.map((access) => (
                        <TableRow key={access.id}>
                          <TableCell className="font-medium">
                            {getRoleLabel(access.role)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={access.can_view}
                              onCheckedChange={() => 
                                handleToggle(access.id, "can_view", access.can_view)
                              }
                              disabled={updateAccessMutation.isPending}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={access.can_execute}
                              onCheckedChange={() => 
                                handleToggle(access.id, "can_execute", access.can_execute)
                              }
                              disabled={updateAccessMutation.isPending}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={access.can_validate}
                              onCheckedChange={() => 
                                handleToggle(access.id, "can_validate", access.can_validate)
                              }
                              disabled={updateAccessMutation.isPending}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell 
                          colSpan={4} 
                          className="text-center text-muted-foreground py-4"
                        >
                          <div className="flex items-center justify-center gap-2">
                            <ClipboardList className="h-4 w-4" />
                            Nenhuma permissão configurada
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
