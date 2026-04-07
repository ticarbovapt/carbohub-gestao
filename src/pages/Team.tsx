import { useState, useMemo } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Users, Shield, Building2, Clock, Network, Mail, Loader2, CheckCheck } from "lucide-react";
import { STATIC_ORG_TREE, getDeptColor, getLevelLabel, useOrgChartFlat, type OrgNode } from "@/hooks/useOrgChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeamMembers, TeamMember } from "@/hooks/useTeamMembers";
import { useNavigate } from "react-router-dom";
import { AddMemberDialog } from "@/components/team/AddMemberDialog";
import { EditMemberDialog } from "@/components/team/EditMemberDialog";
import { DeleteMemberDialog } from "@/components/team/DeleteMemberDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// ── helpers ───────────────────────────────────────────────────────────────────
function flattenTree(nodes: OrgNode[]): OrgNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

function buildParentMap(
  nodes: OrgNode[],
  parent: OrgNode | null = null
): Map<string, OrgNode | null> {
  const map = new Map<string, OrgNode | null>();
  for (const node of nodes) {
    map.set(node.id, parent);
    buildParentMap(node.children, node).forEach((v, k) => map.set(k, v));
  }
  return map;
}

const ALL_ORG_MEMBERS = flattenTree(STATIC_ORG_TREE);
const PARENT_MAP = buildParentMap(STATIC_ORG_TREE);
const DEPT_ORDER = ["Command", "Finance", "Growth & B2B", "Growth", "OPS", "B2B", "Expansão"];

function getInitialsOrg(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ── MemberInfoModal ────────────────────────────────────────────────────────────
interface MemberInfoModalProps {
  member: OrgNode | null;
  profiles: Array<{ id: string; full_name: string | null; email?: string | null; phone?: string | null }>;
  teamMembers: TeamMember[];
  onClose: () => void;
  canEdit: boolean;
  onUpdated: () => void;
}

function MemberInfoModal({
  member,
  profiles,
  teamMembers,
  onClose,
  canEdit,
  onUpdated,
}: MemberInfoModalProps) {
  if (!member) return null;

  const deptColor = getDeptColor(member.department);
  const parent = PARENT_MAP.get(member.id);

  // Enrich from Supabase profiles (match by name)
  const profile = profiles.find(
    (p) =>
      p.full_name?.toLowerCase().trim() === member.full_name.toLowerCase().trim()
  );

  // Try to find matching TeamMember
  const teamMember = teamMembers.find(
    (m) =>
      m.full_name?.toLowerCase().trim() === member.full_name.toLowerCase().trim()
  );

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Colaborador</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 pt-1 pb-2">
          {/* Avatar */}
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-white font-bold text-xl shadow-lg ring-4 ring-offset-2 ring-offset-background"
            style={{
              backgroundColor: deptColor,
              ["--tw-ring-color" as string]: deptColor,
            }}
          >
            {getInitialsOrg(member.full_name)}
          </div>

          {/* Name + title */}
          <div className="text-center">
            <p className="text-lg font-bold text-foreground leading-tight">
              {member.full_name}
            </p>
            {member.job_title && (
              <p className="text-sm text-muted-foreground mt-1">{member.job_title}</p>
            )}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge className="text-white border-0" style={{ backgroundColor: deptColor }}>
              {getLevelLabel(member.hierarchy_level)}
            </Badge>
            {member.department && (
              <Badge variant="outline" style={{ borderColor: deptColor, color: deptColor }}>
                {member.department}
              </Badge>
            )}
            {member.assistant && (
              <Badge variant="outline" className="border-dashed text-muted-foreground">
                Assistente
              </Badge>
            )}
            {member.dual_role && (
              <Badge className="bg-violet-600 text-white border-0 text-[10px]">
                + Head B2B
              </Badge>
            )}
          </div>

          {/* Separator */}
          <div className="w-full h-px bg-border" />

          {/* Info grid */}
          <div className="w-full grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
                Email
              </p>
              <p className="font-medium truncate text-foreground">
                {profile?.email || teamMember?.email || "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
                Telefone
              </p>
              <p className="font-medium text-foreground">
                {(profile as any)?.phone || "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
                Departamento
              </p>
              <p className="font-medium text-foreground">{member.department || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
                Gestor Direto
              </p>
              <p className="font-medium text-foreground">{parent?.full_name || "—"}</p>
            </div>
            {member.dual_role && (
              <div className="col-span-2">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
                  Dupla Função
                </p>
                <p className="font-medium text-foreground">{member.dual_role}</p>
              </div>
            )}
          </div>

          {/* Edit controls — admin/CEO/MasterAdmin only, and only if matched to a TeamMember */}
          {canEdit && teamMember && (
            <div className="w-full flex justify-end gap-2 pt-2 border-t border-border">
              <EditMemberDialog
                member={teamMember}
                onUpdated={() => {
                  onUpdated();
                  onClose();
                }}
              />
              <DeleteMemberDialog
                member={teamMember}
                onDeleted={() => {
                  onUpdated();
                  onClose();
                }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Team page ──────────────────────────────────────────────────────────────────
const Team = () => {
  const { data: members, isLoading: membersLoading, refetch } = useTeamMembers();
  const { data: profiles = [] } = useOrgChartFlat();
  const resendEmail = useResendWelcomeEmail();
  const { isAdmin, isManager, isMasterAdmin, isCeo, isAnyGestor, user } = useAuth();
  const navigate = useNavigate();

  const [selectedMember, setSelectedMember] = useState<OrgNode | null>(null);
  const [confirmEmailMember, setConfirmEmailMember] = useState<TeamMember | null>(null);
  const [emailSentMember, setEmailSentMember] = useState<TeamMember | null>(null);

  const approvedMembers = members?.filter((m) => m.status === "approved") || [];
  const adminCount = approvedMembers.filter((m) => m.roles.includes("admin")).length;
  const uniqueDepartments = new Set(
    approvedMembers.map((m) => m.department).filter(Boolean)
  ).size;
  const pendingAccessCount = approvedMembers.filter((m) => m.password_must_change).length;

  const canEdit = isAdmin || isCeo || isMasterAdmin;
  const canAddMember = isAdmin || isManager || isCeo || isAnyGestor;

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

  // Group org members by department (deterministic order)
  const grouped = useMemo(() => {
    const map = new Map<string, OrgNode[]>();
    DEPT_ORDER.forEach((d) => map.set(d, []));
    ALL_ORG_MEMBERS.forEach((m) => {
      const dept = m.department || "Outros";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(m);
    });
    return Array.from(map.entries()).filter(([, deptMembers]) => deptMembers.length > 0);
  }, []);

  return (
    <BoardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Equipe</h1>
            <p className="mt-1 text-muted-foreground">
              {ALL_ORG_MEMBERS.length} colaboradores — Grupo Carbo
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canAddMember && <AddMemberDialog onMemberAdded={() => refetch()} />}
          </div>
        </div>

        {/* Tab row + Organograma button */}
        <Tabs defaultValue="equipe" className="w-full">
          <div className="flex items-center gap-3">
            <TabsList>
              <TabsTrigger value="equipe" className="gap-2">
                <Users className="h-4 w-4" />
                Equipe
              </TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/org-chart")}
            >
              <Network className="h-4 w-4 mr-1.5" />
              Organograma
            </Button>
          </div>

          <TabsContent value="equipe" className="space-y-6 mt-6">

            {/* Stats row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Users,
                  title: "Colaboradores",
                  value: ALL_ORG_MEMBERS.length.toString(),
                },
                {
                  icon: Shield,
                  title: "Administradores",
                  value: membersLoading ? "—" : adminCount.toString(),
                },
                {
                  icon: Building2,
                  title: "Departamentos",
                  value: uniqueDepartments.toString(),
                  loading: membersLoading,
                },
                {
                  icon: Clock,
                  title: "Aguardando Acesso",
                  value: membersLoading ? "—" : pendingAccessCount.toString(),
                  highlight: pendingAccessCount > 0,
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-border bg-board-surface p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-board-navy/10">
                      <item.icon className="h-5 w-5 text-board-navy" />
                    </div>
                    <div>
                      <p className="text-sm text-board-muted">{item.title}</p>
                      {membersLoading && item.loading ? (
                        <Skeleton className="h-6 w-8" />
                      ) : (
                        <p
                          className={`text-lg font-semibold ${
                            item.highlight ? "text-warning" : "text-board-text"
                          }`}
                        >
                          {item.value}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Dept-grouped card grid */}
            <div className="space-y-8">
              {grouped.map(([dept, deptMembers]) => {
                const color = getDeptColor(dept);
                return (
                  <div key={dept} className="space-y-3">
                    {/* Section header */}
                    <div className="flex items-center gap-3">
                      <div
                        className="h-1 w-6 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <h3
                        className="text-sm font-semibold uppercase tracking-wider"
                        style={{ color }}
                      >
                        {dept}
                      </h3>
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        style={{ borderColor: color, color }}
                      >
                        {deptMembers.length}
                      </Badge>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    {/* Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {deptMembers.map((member) => (
                        <div
                          key={member.id}
                          onClick={() => setSelectedMember(member)}
                          className="flex flex-col items-center gap-2 rounded-xl border border-border bg-board-surface p-4 text-center cursor-pointer hover:border-primary/40 hover:shadow-lg transition-all duration-150"
                        >
                          {/* Avatar */}
                          <div
                            className="flex h-12 w-12 items-center justify-center rounded-full text-white font-bold text-sm ring-2 ring-offset-2 ring-offset-background shadow-md"
                            style={{
                              backgroundColor: color,
                              ["--tw-ring-color" as string]: color,
                            }}
                          >
                            {getInitialsOrg(member.full_name)}
                          </div>

                          {/* Name */}
                          <p className="text-xs font-semibold text-board-text leading-tight">
                            {member.full_name}
                          </p>

                          {/* Job title */}
                          {member.job_title && (
                            <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
                              {member.job_title}
                            </p>
                          )}

                          {/* Level badge */}
                          <Badge
                            className="text-[9px] px-1.5 py-0 text-white border-0"
                            style={{ backgroundColor: color }}
                          >
                            {getLevelLabel(member.hierarchy_level)}
                          </Badge>

                          {/* Assistant chip */}
                          {member.assistant && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 border-dashed"
                            >
                              Assistente
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

          </TabsContent>
        </Tabs>
      </div>

      {/* Member info modal */}
      <MemberInfoModal
        member={selectedMember}
        profiles={profiles || []}
        teamMembers={approvedMembers}
        onClose={() => setSelectedMember(null)}
        canEdit={canEdit}
        onUpdated={() => refetch()}
      />

      {/* Confirmation dialog — resend email */}
      <Dialog
        open={!!confirmEmailMember}
        onOpenChange={(open) => !open && setConfirmEmailMember(null)}
      >
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
                  <span className="text-sm font-medium">
                    {confirmEmailMember.full_name || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">E-mail</span>
                  <span className="text-sm font-medium">
                    {confirmEmailMember.email || "—"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Uma nova senha temporária será gerada e enviada para o e-mail acima.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmEmailMember(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                confirmEmailMember && handleResendEmail(confirmEmailMember)
              }
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

      {/* Success dialog */}
      <Dialog
        open={!!emailSentMember}
        onOpenChange={(open) => !open && setEmailSentMember(null)}
      >
        <DialogContent className="sm:max-w-[380px] text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
              <CheckCheck className="h-7 w-7 text-success" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">E-mail enviado!</h3>
              <p className="text-sm text-muted-foreground">
                O convite foi reenviado para{" "}
                <strong>{emailSentMember?.full_name}</strong>.
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
