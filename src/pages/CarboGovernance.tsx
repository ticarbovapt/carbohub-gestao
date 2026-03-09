import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CarboRolesManager } from "@/components/admin/CarboRolesManager";
import { StageAccessManager } from "@/components/admin/StageAccessManager";
import { Shield, Lock, Users, Settings, KeyRound, UserPlus, Building2, Store, ClipboardCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard } from "@/components/ui/carbo-card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function GovernanceActionButton({ 
  label, icon: Icon, isMasterAdmin, actionType, resourceType 
}: { 
  label: string; 
  icon: React.ComponentType<{ className?: string }>; 
  isMasterAdmin: boolean; 
  actionType: string; 
  resourceType: string;
}) {
  const navigate = useNavigate();
  
  const handleAction = async () => {
    if (isMasterAdmin) {
      // Direct action
      if (actionType === "create_user") navigate("/team?action=add");
      else if (actionType === "reset_password") navigate("/team");
      else if (actionType === "manage_roles") navigate("/governance?tab=roles");
      else if (actionType === "create_licensee") navigate("/licensee/new");
      else if (actionType === "create_pdv") navigate("/team");
      else if (actionType === "audit") navigate("/governance?tab=access");
    } else {
      // Request action
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("pending_actions").insert({
        requested_by: user.user!.id,
        action_type: actionType,
        resource_type: resourceType,
        payload: {},
      } as any);
      if (error) {
        toast.error("Erro ao solicitar ação");
      } else {
        toast.success("Solicitação enviada para aprovação");
      }
    }
  };

  return (
    <CarboButton
      variant={isMasterAdmin ? "default" : "outline"}
      className="justify-start gap-2 h-auto py-3"
      onClick={handleAction}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span>{isMasterAdmin ? label : `Solicitar: ${label}`}</span>
    </CarboButton>
  );
}

const CarboGovernance = () => {
  const { isCeo, isMasterAdmin, canAccessGovernance } = useAuth();

  // MasterAdmin gets full access, CEO gets read-only governance
  if (!isCeo && !canAccessGovernance) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              Governança Carbo
            </h1>
            <p className="text-muted-foreground">
              Gerencie roles, permissões e ações críticas do sistema
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2"><Users className="h-5 w-5 text-primary" /></div>
              <div><p className="text-sm text-muted-foreground">Roles Disponíveis</p><p className="text-2xl font-bold">6</p></div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2"><Lock className="h-5 w-5 text-primary" /></div>
              <div><p className="text-sm text-muted-foreground">Macro Fluxos</p><p className="text-2xl font-bold">3</p></div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2"><Settings className="h-5 w-5 text-primary" /></div>
              <div><p className="text-sm text-muted-foreground">Departamentos</p><p className="text-2xl font-bold">5</p></div>
            </div>
          </div>
        </div>

        {/* Governance Actions */}
        <CarboCard>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Ações de Governança
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <GovernanceActionButton label="Criar usuário (Equipe)" icon={UserPlus} isMasterAdmin={isMasterAdmin} actionType="create_user" resourceType="user" />
            <GovernanceActionButton label="Reset senha padrão" icon={KeyRound} isMasterAdmin={isMasterAdmin} actionType="reset_password" resourceType="user" />
            <GovernanceActionButton label="Gerenciar Roles" icon={Shield} isMasterAdmin={isMasterAdmin} actionType="manage_roles" resourceType="role" />
            <GovernanceActionButton label="Criar/editar Licenciado" icon={Building2} isMasterAdmin={isMasterAdmin} actionType="create_licensee" resourceType="licensee" />
            <GovernanceActionButton label="Criar/editar PDV" icon={Store} isMasterAdmin={isMasterAdmin} actionType="create_pdv" resourceType="pdv" />
            <GovernanceActionButton label="Auditoria" icon={ClipboardCheck} isMasterAdmin={isMasterAdmin} actionType="audit" resourceType="audit" />
          </div>
        </CarboCard>

        {/* Tabs */}
        <Tabs defaultValue="roles" className="space-y-4">
          <TabsList>
            <TabsTrigger value="roles" className="gap-2"><Users className="h-4 w-4" />Atribuição de Roles</TabsTrigger>
            <TabsTrigger value="access" className="gap-2"><Lock className="h-4 w-4" />Matriz de Acesso</TabsTrigger>
          </TabsList>
          <TabsContent value="roles"><CarboRolesManager /></TabsContent>
          <TabsContent value="access"><StageAccessManager /></TabsContent>
        </Tabs>
      </div>
    </BoardLayout>
  );
};

export default CarboGovernance;
