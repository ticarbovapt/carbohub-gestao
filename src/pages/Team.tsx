import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import {
  Users, Shield, Building2, Clock, Network, Mail, Loader2, CheckCheck,
  GitBranch, UserCheck, Map as MapIcon, Link2, Lock, ChevronRight,
  Pencil, X, Save, UserPlus, KeyRound,
} from "lucide-react";
import { STATIC_ORG_TREE, getDeptColor, getLevelLabel, useOrgChartFlat, useUpdateOrgChartNode, type OrgNode } from "@/hooks/useOrgChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeamMembers, TeamMember } from "@/hooks/useTeamMembers";
import { useNavigate } from "react-router-dom";
import { AddMemberDialog } from "@/components/team/AddMemberDialog";
import { DeleteMemberDialog } from "@/components/team/DeleteMemberDialog";
import { AccessConfigDialog } from "@/components/team/AccessConfigDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
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
import { ALL_DEPARTMENTS, DEPARTMENT_LABELS } from "@/constants/departments";
// ── Carbo role labels ────────────────────────────────────────────────────────
const CARBO_ROLE_BADGE: Record<string, string> = {
  ceo:             "CEO",
  gestor_adm:      "Gestor ADM",
  gestor_fin:      "Gestor Fin.",
  gestor_compras:  "Gestor Compras",
  operador_fiscal: "Op. Fiscal",
  operador:        "Operador",
  licensed_user:   "Licenciado",
};

// ── Mapeamento dept org_chart → profiles ────────────────────────────────────
const DEPT_TO_PROFILE_DEPT: Record<string, string> = {
  Command: "command", OPS: "ops", Finance: "finance",
  Growth: "growth", "Growth & B2B": "growth", B2B: "b2b", Expansão: "expansao",
};

// Prefixo do username por departamento (maiúsculo, 3 chars)
const DEPT_USERNAME_PREFIX: Record<string, string> = {
  ops: "OPS", finance: "FIN", growth: "GRO", b2b: "B2B", command: "COM", expansao: "EXP",
};

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

// ── MemberInfoModal ─────────────────────────────────────────────────────────
interface MemberInfoModalProps {
  member: OrgNode | null;
  profiles: Array<{ id: string; full_name: string | null; email?: string | null; phone?: string | null; reports_to?: string | null; hierarchy_level?: number }>;
  teamMembers: TeamMember[];
  onClose: () => void;
  canEdit: boolean;
  isMasterAdmin: boolean;
  onUpdated: () => void;
}

function MemberInfoModal({ member, profiles, teamMembers, onClose, canEdit, isMasterAdmin, onUpdated }: MemberInfoModalProps) {
  const updateNode  = useUpdateOrgChartNode();
  const resendEmail = useResendWelcomeEmail();
  const [editing, setEditing] = useState(false);

  // edit form state — reset when member changes
  const [formName,       setFormName]       = useState("");
  const [formTitle,      setFormTitle]       = useState("");
  const [formDept,       setFormDept]        = useState("");
  const [formLevel,      setFormLevel]       = useState(6);
  const [formEmail,      setFormEmail]       = useState("");
  const [formPhone,      setFormPhone]       = useState("");
  const [formDualRole,   setFormDualRole]    = useState("");
  const [formAssistant,  setFormAssistant]   = useState(false);
  const [formUsername,   setFormUsername]    = useState("");
  const [formEscopo,     setFormEscopo]      = useState("");
  // gestor direto (master admin only)
  const [formReportsTo, setFormReportsTo] = useState("");

  // Open edit mode — seed from current member
  const openEdit = () => {
    if (!member) return;
    setFormName(member.full_name);
    setFormTitle(member.job_title || "");
    // OrgNode.department stores display values ("OPS", "Command"…) but the Select
    // uses lowercase profile enum values ("ops", "command"…) — normalise here.
    const rawDept = member.department || "";
    const normalizedDept = DEPT_TO_PROFILE_DEPT[rawDept] ?? rawDept.toLowerCase();
    setFormDept(normalizedDept);
    setFormLevel(member.hierarchy_level);
    // Primary: link by user_id (set on org_chart_nodes). Fallback: email then name.
    const orgNode = profiles.find((p) => (p as any).user_id && (p as any).user_id === member.user_id)
      ?? profiles.find((p) => p.id === member.id);
    const authMember = member.user_id
      ? teamMembers.find((m) => m.id === member.user_id)
      : teamMembers.find((m) => m.email && (orgNode as any)?.email && m.email === (orgNode as any).email);
    const email = (orgNode as any)?.email || authMember?.email || "";
    setFormEmail(email);
    setFormPhone((orgNode as any)?.phone || "");
    setFormDualRole(member.dual_role || "");
    setFormAssistant(member.assistant || false);
    // seed username + escopo from linked team member (if any)
    const linked = teamMembers.find((m) => m.email && email && m.email.toLowerCase() === email.toLowerCase());
    setFormUsername((linked?.username || "").toUpperCase());
    setFormEscopo(linked?.escopo || "");
    // seed gestor direto from flat profiles list
    const flatNode = profiles.find((p) => p.id === member.id);
    setFormReportsTo((flatNode as any)?.reports_to || "");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!member) return;

    // formDept is the profile enum value (lowercase, e.g. "ops").
    // org_chart_nodes expects display values (e.g. "OPS"), so reverse-map here.
    const orgDept = DEPARTMENT_LABELS[formDept] || formDept || null;

    await updateNode.mutateAsync({
      id: member.id,
      full_name:       formName,
      job_title:       formTitle || null,
      department:      orgDept,
      hierarchy_level: formLevel,
      email:           formEmail || null,
      phone:           formPhone || null,
      dual_role:       formDualRole || null,
      assistant:       formAssistant,
      ...(isMasterAdmin ? { reports_to: formReportsTo || null } : {}),
    });

    // Find linked auth profile: by user_id (primary) then email (fallback)
    const linked = (member.user_id ? teamMembers.find((m) => m.id === member.user_id) : null)
      ?? teamMembers.find((m) => m.email && formEmail && m.email.toLowerCase() === formEmail.toLowerCase());
    if (linked) {
      // Resolve manager_user_id: find the profile whose org_chart_node matches formReportsTo
      let managerProfileId: string | null = null;
      if (isMasterAdmin && formReportsTo) {
        const managerNode = (profiles as any[]).find((p: any) => p.id === formReportsTo);
        const managerLinked = managerNode?.email
          ? teamMembers.find((m) => m.email?.toLowerCase() === managerNode.email.toLowerCase())
          : null;
        managerProfileId = managerLinked?.id || null;
      }

      // validate username uniqueness if changed
      const usernameChanged = formUsername && formUsername !== linked.username;
      if (usernameChanged) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", formUsername)
          .neq("id", linked.id)
          .maybeSingle();
        if (existing) {
          toast.error("Username já está em uso por outro colaborador.");
          return;
        }
      }

      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({
          full_name:  formName,
          department: formDept as any,
          phone:      formPhone || null,
          funcao:     formTitle || null,
          escopo:     formEscopo || null,
          ...(usernameChanged ? { username: formUsername } : {}),
          ...(isMasterAdmin ? { manager_user_id: managerProfileId } : {}),
        } as any)
        .eq("id", linked.id);
      if (profileUpdateError) {
        toast.error("Dados salvos no organograma, mas houve um erro ao atualizar o perfil: " + profileUpdateError.message);
      } else {
        toast.success("Colaborador atualizado!");
      }
    }

    onUpdated();
    setEditing(false);
    onClose();
  };

  const handleResendToLinked = async (m: typeof teamMembers[0]) => {
    if (!m.username) { toast.error("Usuário sem username."); return; }
    await resendEmail.mutateAsync({
      userId: m.id,
      email: m.email,
      fullName: m.full_name || "Colaborador",
      username: m.username,
    });
  };

  if (!member) return null;

  const deptColor = getDeptColor(member.department);
  const memberNode = profiles.find((p) => p.id === member.id);
  const parent = memberNode?.reports_to
    ? (profiles.find((p) => p.id === memberNode.reports_to) ?? PARENT_MAP.get(member.id))
    : PARENT_MAP.get(member.id);
  const norm = (s?: string | null) =>
    (s ?? "").toLowerCase().trim().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const memberNorm = norm(member.full_name);
  const profile   = profiles.find((p) => p.id === member.id);
  const teamMember = member.user_id
    ? teamMembers.find((m) => m.id === member.user_id)
    : teamMembers.find((m) => norm(m.full_name) === memberNorm);

  return (
    <Dialog open={!!member} onOpenChange={(open) => { if (!open) { setEditing(false); onClose(); } }}>
      <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{editing ? "Editar Colaborador" : "Colaborador"}</DialogTitle>
            {canEdit && !editing && (
              <Button variant="ghost" size="icon" className="h-8 w-8 mr-6" onClick={openEdit}>
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* ── VIEW MODE ───────────────────────────────────────────────────── */}
        {!editing && (
          <div className="flex flex-col items-center gap-4 pt-1 pb-2">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full text-white font-bold text-xl shadow-lg ring-4 ring-offset-2 ring-offset-background"
              style={{ backgroundColor: deptColor, ["--tw-ring-color" as string]: deptColor }}
            >
              {getInitialsOrg(member.full_name)}
            </div>

            <div className="text-center">
              <p className="text-lg font-bold text-foreground leading-tight">{member.full_name}</p>
              {member.job_title && <p className="text-sm text-muted-foreground mt-1">{member.job_title}</p>}
            </div>

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
                <Badge variant="outline" className="border-dashed text-muted-foreground">Assistente</Badge>
              )}
              {member.dual_role && (
                <Badge className="bg-violet-600 text-white border-0 text-[10px]">+ Head B2B</Badge>
              )}
            </div>

            <div className="w-full h-px bg-border" />

            <div className="w-full grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[
                { label: "Email",        value: (profile as any)?.email || teamMember?.email || "—" },
                { label: "Telefone",     value: (profile as any)?.phone || "—" },
                { label: "Departamento", value: member.department || "—" },
                { label: "Gestor Direto",value: parent?.full_name || "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="font-medium truncate text-foreground">{value}</p>
                </div>
              ))}
              {member.dual_role && (
                <div className="col-span-2">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Dupla Função</p>
                  <p className="font-medium text-foreground">{member.dual_role}</p>
                </div>
              )}
            </div>

            {canEdit && teamMember && (
              <div className="w-full flex justify-end pt-2 border-t border-border">
                <DeleteMemberDialog member={teamMember} onDeleted={() => { onUpdated(); onClose(); }} />
              </div>
            )}
          </div>
        )}

        {/* ── EDIT MODE ───────────────────────────────────────────────────── */}
        {editing && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nome Completo</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Cargo / Função</Label>
                <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="ex: Coordenadora Administrativa" />
              </div>
              <div className="space-y-1">
                <Label>Departamento</Label>
                <Select value={formDept} onValueChange={setFormDept}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {ALL_DEPARTMENTS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nível Hierárquico</Label>
                <Select value={String(formLevel)} onValueChange={(v) => setFormLevel(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — CEO</SelectItem>
                    <SelectItem value="2">2 — Diretor(a)</SelectItem>
                    <SelectItem value="3">3 — Gerente</SelectItem>
                    <SelectItem value="4">4 — Coordenador(a)</SelectItem>
                    <SelectItem value="5">5 — Supervisor(a)</SelectItem>
                    <SelectItem value="6">6 — Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="email@empresa.com" />
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="(11) 9 0000-0000" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Dupla Função (opcional)</Label>
                <Input value={formDualRole} onChange={(e) => setFormDualRole(e.target.value)} placeholder="ex: Head — Desenvolvimento de Negócios" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="assistant-check"
                  checked={formAssistant}
                  onChange={(e) => setFormAssistant(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="assistant-check" className="cursor-pointer">Assistente executivo(a)</Label>
              </div>

              {/* Username — editável por admin para definir o login do colaborador */}
              {(() => {
                const linkedAcc = member.user_id
                  ? teamMembers.find((m) => m.id === member.user_id)
                  : teamMembers.find((m) => m.email && formEmail && m.email.toLowerCase() === formEmail.toLowerCase());
                return linkedAcc ? (
                  <div className="col-span-2 space-y-1">
                    <Label className="flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                      Username (login)
                    </Label>
                    <Input
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value.replace(/\s/g, "").toUpperCase())}
                      onFocus={() => {
                        if (!formUsername && formDept) {
                          const prefix = DEPT_USERNAME_PREFIX[formDept];
                          if (prefix) setFormUsername(prefix);
                        }
                      }}
                      placeholder={
                        formDept && DEPT_USERNAME_PREFIX[formDept]
                          ? `${DEPT_USERNAME_PREFIX[formDept]}0001`
                          : "OPS0001"
                      }
                    />
                  </div>
                ) : null;
              })()}

              <div className="col-span-2 space-y-1">
                <Label>Escopo / Responsabilidades</Label>
                <Input value={formEscopo} onChange={(e) => setFormEscopo(e.target.value)} placeholder="Principais atividades e áreas de atuação" />
              </div>

              {/* Gestor Direto — somente master admin pode alterar */}
              {isMasterAdmin && (
                <div className="col-span-2 space-y-1">
                  <Label className="flex items-center gap-1.5">
                    Gestor Direto
                    <span className="text-[10px] bg-amber-500/15 text-amber-600 px-1.5 py-0.5 rounded font-medium">master admin</span>
                  </Label>
                  <Select
                    value={formReportsTo || "_none"}
                    onValueChange={(v) => setFormReportsTo(v === "_none" ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Sem gestor direto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Sem gestor direto —</SelectItem>
                      {(profiles as any[])
                        .filter((p) => p.id !== member?.id)
                        .sort((a, b) => (a.hierarchy_level || 6) - (b.hierarchy_level || 6))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name} ({getLevelLabel(p.hierarchy_level || 6)})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateNode.isPending}>
                {updateNode.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  : <Save className="h-4 w-4 mr-1" />}
                Salvar
              </Button>
            </div>

            {/* ── ACESSO AO SISTEMA ─────────────────────────────────────────── */}
            {(() => {
              const linkedAccount = member.user_id
                ? teamMembers.find((m) => m.id === member.user_id)
                : teamMembers.find((m) => m.email && formEmail && m.email.toLowerCase() === formEmail.toLowerCase());
              return (
                <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" /> Acesso ao Sistema
                  </p>
                  {linkedAccount ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="text-xs">Conta ativa</Badge>
                      {linkedAccount.username && (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{linkedAccount.username}</code>
                      )}
                      <span className="text-xs text-muted-foreground truncate">{linkedAccount.email}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Sem conta de acesso. Use <strong>Criar Nova Conta</strong> para adicionar ao sistema.
                    </p>
                  )}
                  {linkedAccount && (
                    <p className="text-xs text-muted-foreground">
                      Configure interfaces e permissões via botão <strong>Acesso</strong> na lista de usuários.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
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
  const [accessMember, setAccessMember] = useState<TeamMember | null>(null);
  const [confirmEmailMember, setConfirmEmailMember] = useState<TeamMember | null>(null);
  const [emailSentMember, setEmailSentMember] = useState<TeamMember | null>(null);
  const [isBulkSending, setIsBulkSending] = useState(false);

  const approvedMembers = members?.filter((m) => m.status === "approved") || [];
  const adminCount = approvedMembers.filter((m) => m.roles.includes("admin")).length;
  const uniqueDepartments = new Set(
    approvedMembers.map((m) => m.department).filter(Boolean)
  ).size;
  const pendingAccessCount = approvedMembers.filter((m) => m.password_must_change).length;

  const canEdit = isAdmin || isCeo || isMasterAdmin;
  const canAddMember = isAdmin;

  const handleBulkResendAll = async () => {
    const pending = approvedMembers.filter((m) => m.password_must_change && m.username);
    if (pending.length === 0) return;
    setIsBulkSending(true);
    let sent = 0;
    for (const m of pending) {
      try {
        await resendEmail.mutateAsync({
          userId: m.id,
          email: m.email || undefined,
          fullName: m.full_name || "Usuário",
          username: m.username!,
        });
        sent++;
      } catch {
        // continue even if one fails
      }
    }
    setIsBulkSending(false);
    toast.success(`${sent} e-mail${sent !== 1 ? "s" : ""} de acesso enviado${sent !== 1 ? "s" : ""}!`);
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
            {canAddMember && pendingAccessCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkResendAll}
                disabled={isBulkSending}
                className="gap-2"
              >
                {isBulkSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                {isBulkSending
                  ? "Enviando..."
                  : `Enviar acesso para todos (${pendingAccessCount})`}
              </Button>
            )}
            {canAddMember && <AddMemberDialog onMemberAdded={() => refetch()} />}
          </div>
        </div>

        {/* Ferramentas de Gestão — visible to admins/CEO */}
        {canEdit && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Ferramentas de Gestão</h2>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { href: "/org-chart",         label: "Organograma",        icon: Network,   color: "text-blue-500",   bg: "bg-blue-500/10"   },
                { href: "/governance",         label: "Governança",         icon: GitBranch, color: "text-violet-500", bg: "bg-violet-500/10" },
                { href: "/role-matrix",        label: "Matriz de Acesso",   icon: Lock,      color: "text-amber-500",  bg: "bg-amber-500/10"  },
                { href: "/admin/approval",     label: "Aprovações",         icon: UserCheck, color: "text-green-500",  bg: "bg-green-500/10"  },
                { href: "/responsibility-map", label: "Mapa de Responsab.", icon: MapIcon,    color: "text-cyan-500",   bg: "bg-cyan-500/10"   },
                { href: "/integrations/bling", label: "Integrações Bling",  icon: Link2,     color: "text-orange-500", bg: "bg-orange-500/10" },
              ].map((tool) => (
                <button
                  key={tool.href}
                  onClick={() => navigate(tool.href)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/60 hover:border-primary/30 transition-all duration-150 group"
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${tool.bg}`}>
                    <tool.icon className={`h-4 w-4 ${tool.color}`} />
                  </div>
                  <span className="text-sm font-medium text-foreground leading-tight flex-1 min-w-0">
                    {tool.label}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab row */}
        <Tabs defaultValue="acesso" className="w-full">
          <div className="flex items-center gap-3">
            <TabsList>
              <TabsTrigger value="acesso" className="gap-2">
                <UserCheck className="h-4 w-4" />
                Usuários com Acesso
              </TabsTrigger>
              <TabsTrigger value="organograma" className="gap-2">
                <Network className="h-4 w-4" />
                Organograma
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── ABA: Usuários com Acesso ── */}
          <TabsContent value="acesso" className="mt-6">
            {/* Hint bar */}
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span>Use o botão <span className="font-semibold text-primary">Acesso</span> em cada linha para configurar nível, funções e interfaces de cada colaborador.</span>
            </div>
            {membersLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : approvedMembers.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <UserCheck className="h-8 w-8 mx-auto mb-3 opacity-30" />
                Nenhum usuário com acesso ativo.
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-2.5 bg-muted/50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>Colaborador</span>
                  <span className="text-right w-24">Nível</span>
                  <span className="text-right w-40">Funções</span>
                  <span className="w-32 text-right">Configurar</span>
                </div>
                {/* Rows */}
                {approvedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3 border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                  >
                    {/* Name + dept */}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{member.full_name || "—"}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {member.email && (
                          <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                        )}
                        {member.department && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {member.department}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* app roles */}
                    <div className="flex gap-1 w-24 justify-end flex-wrap">
                      {member.roles.length > 0 ? (
                        member.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 capitalize">
                            {r}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* carbo_roles */}
                    <div className="flex gap-1 w-40 justify-end flex-wrap">
                      {member.carbo_roles.length > 0 ? (
                        member.carbo_roles.map((r) => (
                          <Badge
                            key={r}
                            className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
                            variant="outline"
                          >
                            {CARBO_ROLE_BADGE[r] ?? r}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 justify-end w-32">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground"
                        title="Editar dados do colaborador"
                        onClick={() => {
                          // Primary: find org node by user_id. Fallback: email match.
                          const node = profiles.find((n) => (n as any).user_id === member.id)
                            ?? profiles.find((n) => n.email && member.email && n.email === member.email);
                          if (node) {
                            setSelectedMember(node);
                          } else {
                            // Fallback: construct minimal OrgNode from TeamMember
                            setSelectedMember({
                              id: member.id,
                              full_name: member.full_name || "—",
                              avatar_url: member.avatar_url,
                              hierarchy_level: 5,
                              reports_to: null,
                              department: member.department as string | null,
                              job_title: null,
                              job_category: null,
                              carbo_role: null,
                              email: member.email ?? null,
                              children: [],
                            });
                          }
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs font-medium border-primary/40 text-primary hover:bg-primary/10 hover:border-primary gap-1"
                        title="Configurar acesso e funções"
                        onClick={() => setAccessMember(member)}
                      >
                        <Shield className="h-3 w-3" />
                        Acesso
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── ABA: Organograma ── */}
          <TabsContent value="organograma" className="space-y-6 mt-6">

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

      {/* Access config modal */}
      <AccessConfigDialog
        member={accessMember}
        open={!!accessMember}
        onOpenChange={(v) => { if (!v) setAccessMember(null); }}
      />

      {/* Member info modal */}
      <MemberInfoModal
        member={selectedMember}
        profiles={profiles || []}
        teamMembers={approvedMembers}
        onClose={() => setSelectedMember(null)}
        canEdit={canEdit}
        isMasterAdmin={isMasterAdmin}
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
