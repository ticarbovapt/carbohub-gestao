import { BoardLayout } from "@/components/layouts/BoardLayout";
import { useTeamMembers, useApproveUser, useRejectUser } from "@/hooks/useTeamMembers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, Loader2, Clock, UserCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  operator: "Operador",
  viewer: "Visualizador",
};

import { DEPARTMENT_LABELS } from "@/constants/departments";

export default function AdminApproval() {
  const { data: members, isLoading } = useTeamMembers();
  const approveUser = useApproveUser();
  const rejectUser = useRejectUser();
  const [selectedRoles, setSelectedRoles] = useState<Record<string, AppRole>>({});

  const pendingMembers = members?.filter((m) => m.status === "pending") || [];
  const approvedCount = members?.filter((m) => m.status === "approved").length || 0;
  const rejectedCount = members?.filter((m) => m.status === "rejected").length || 0;

  const handleApprove = async (userId: string) => {
    const role = selectedRoles[userId] || "operator";
    try {
      await approveUser.mutateAsync({ userId, role });
      toast.success("Usuário aprovado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao aprovar usuário");
    }
  };

  const handleReject = async (userId: string) => {
    try {
      await rejectUser.mutateAsync(userId);
      toast.success("Usuário rejeitado.");
    } catch (error: any) {
      toast.error(error.message || "Erro ao rejeitar usuário");
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

  return (
    <BoardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-board-text">
          Aprovação de Usuários
        </h1>
        <p className="mt-1 text-board-muted">
          Gerencie solicitações de acesso pendentes
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-board-muted">
              Pendentes
            </CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-board-text">
              {pendingMembers.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-board-muted">
              Aprovados
            </CardTitle>
            <UserCheck className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-board-text">
              {approvedCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-board-muted">
              Rejeitados
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-board-text">
              {rejectedCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals Table */}
      <Card>
        <CardHeader>
          <CardTitle>Solicitações Pendentes</CardTitle>
          <CardDescription>
            Usuários aguardando aprovação para acessar o sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-board-navy" />
            </div>
          ) : pendingMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-board-muted">
              <UserCheck className="h-12 w-12 mb-4 opacity-50" />
              <p>Nenhuma solicitação pendente</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Cargo Solicitado</TableHead>
                  <TableHead>Cargo Final</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-board-navy text-white font-semibold">
                          {getInitials(member.full_name)}
                        </div>
                        <div>
                          <p className="font-medium text-board-text">
                            {member.full_name || "Sem nome"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.department ? (
                        <Badge variant="outline">
                          {DEPARTMENT_LABELS[member.department] || member.department}
                        </Badge>
                      ) : (
                        <span className="text-board-muted">Não definido</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {member.requested_role === "manager" ? "Gestor" : "Operador"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={selectedRoles[member.id] || (member.requested_role as AppRole) || "operator"}
                        onValueChange={(value) =>
                          setSelectedRoles((prev) => ({
                            ...prev,
                            [member.id]: value as AppRole,
                          }))
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="operator">Operador</SelectItem>
                          <SelectItem value="manager">Gestor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => handleReject(member.id)}
                          disabled={rejectUser.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="bg-success hover:bg-success/90"
                          onClick={() => handleApprove(member.id)}
                          disabled={approveUser.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </BoardLayout>
  );
}
