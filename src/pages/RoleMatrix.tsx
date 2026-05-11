import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Shield, Eye, Wrench, CheckCircle, XCircle, ChevronDown, ChevronRight, Users, LayoutGrid, Pencil, Save, X, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { AccessConfigDialog } from "@/components/team/AccessConfigDialog";
import type { TeamMember } from "@/hooks/useTeamMembers";
import {
  ROLES, MATRIX, MODULES, ROLE_KEY_MAP, PRIORITY, ACCESS_LABEL, getEffectiveAccess,
  type RoleKey, type Access, type FeatureRow,
} from "@/lib/role-matrix-constants";

function getAccessIcon(access: Access, size = "h-4 w-4") {
  switch (access) {
    case "full": return <CheckCircle className={`${size} text-carbo-green mx-auto`} />;
    case "read": return <Eye         className={`${size} text-carbo-blue mx-auto`} />;
    case "own":  return <Wrench      className={`${size} text-warning mx-auto`} />;
    case "none": return <XCircle     className={`${size} text-muted-foreground/30 mx-auto`} />;
  }
}

// ─── Collaborator data type ────────────────────────────────────────────────

interface CollabUser {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  app_roles: string[];     // user_roles (operator/manager/admin)
  carbo_roles: string[];   // carbo_user_roles (gestor_adm etc.)
  allowed_interfaces: string[];
}

// ─── Collaborator row ──────────────────────────────────────────────────────

function CollaboratorRow({
  user,
  moduleOverrides,
  onEdit,
}: {
  user: CollabUser;
  moduleOverrides: Record<string, string>;
  onEdit: (u: CollabUser) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Effective access is calculated from carbo_roles (functional roles)
  const roleKeys: RoleKey[] = user.carbo_roles
    .map((r) => ROLE_KEY_MAP[r])
    .filter(Boolean) as RoleKey[];

  const initials = (user.full_name || user.email || "?")
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <>
      <tr
        className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Name */}
        <td className="p-2 pl-3 sticky left-0 bg-background z-10 border-r min-w-[180px]">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.full_name || "—"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.email || ""}</p>
            </div>
            {expanded
              ? <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
            }
          </div>
        </td>
        {/* Module effective access (override wins over role-based) */}
        {MODULES.map((mod) => {
          const override = moduleOverrides[mod];
          let best: Access;
          if (override) {
            best = override as Access;
          } else {
            const rows = MATRIX.filter((r) => r.module === mod);
            best = "none";
            for (const row of rows) {
              const a = getEffectiveAccess(roleKeys, row);
              if (PRIORITY[a] > PRIORITY[best]) best = a;
            }
          }
          return (
            <td key={mod} className={`p-2 text-center w-16 ${override ? "bg-primary/5" : ""}`}
                title={override ? `Override: ${ACCESS_LABEL[best]}` : ACCESS_LABEL[best]}>
              {getAccessIcon(best, "h-3.5 w-3.5")}
              {override && <div className="w-1 h-1 rounded-full bg-primary mx-auto mt-0.5" title="Override ativo" />}
            </td>
          );
        })}
        {/* Edit button */}
        <td className="p-2 text-center">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs font-medium gap-1 border-primary/40 text-primary hover:bg-primary/10 hover:border-primary"
            onClick={(e) => { e.stopPropagation(); onEdit(user); }}
          >
            <Settings className="h-3 w-3" />
            Acesso
          </Button>
        </td>
      </tr>

      {/* Expanded: roles badges + per-feature detail */}
      {expanded && (
        <tr className="bg-muted/10 border-b">
          <td className="p-3 pl-10" colSpan={MODULES.length + 2}>
            {/* App role badge */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-xs text-muted-foreground font-medium">Nível:</span>
              {user.app_roles.length > 0
                ? user.app_roles.map((r) => (
                    <span key={r} className="text-[10px] font-semibold bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full capitalize">{r}</span>
                  ))
                : <span className="text-xs text-muted-foreground italic">Sem nível de acesso</span>
              }
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs text-muted-foreground font-medium">Funções:</span>
              {user.carbo_roles.length > 0
                ? user.carbo_roles.map((r) => (
                    <span key={r} className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{r}</span>
                  ))
                : <span className="text-xs text-muted-foreground italic">Sem funções atribuídas — sem acesso ao Carbo Controle</span>
              }
            </div>
            {/* Feature breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {MATRIX.map((row, i) => {
                const access = getEffectiveAccess(roleKeys, row);
                if (access === "none") return null;
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1">
                    {getAccessIcon(access, "h-3 w-3")}
                    <span className="truncate">{row.feature}</span>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Access cell with optional dropdown ────────────────────────────────────

function AccessCell({
  access, editMode, onChange,
}: { access: Access; editMode: boolean; onChange?: (v: Access) => void }) {
  if (!editMode) return <>{getAccessIcon(access)}</>;
  return (
    <Select value={access} onValueChange={(v) => onChange?.(v as Access)}>
      <SelectTrigger className="h-7 w-32 text-xs border-dashed">
        <div className="flex items-center gap-1.5">
          {getAccessIcon(access, "h-3 w-3")}
          <span>{ACCESS_LABEL[access]}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {(Object.entries(ACCESS_LABEL) as [Access, string][]).map(([k, label]) => (
          <SelectItem key={k} value={k}>
            <div className="flex items-center gap-2">
              {getAccessIcon(k, "h-3.5 w-3.5")}
              <span>{label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function RoleMatrix() {
  const { isMasterAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"cargos" | "colaboradores">("cargos");

  // ── Matrix config (overrides persistidos) ────────────────────────────────
  const { data: configData } = useQuery({
    queryKey: ["role-matrix-config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("role_matrix_config" as any)
        .select("id, overrides")
        .order("updated_at" as any, { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string; overrides: Record<string, Access> } | null;
    },
  });

  const [overrides,      setOverrides]      = useState<Record<string, Access>>({});
  const [editMode,       setEditMode]       = useState(false);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, Access>>({});
  const [saving,         setSaving]         = useState(false);

  useEffect(() => {
    if (configData?.overrides) setOverrides(configData.overrides as Record<string, Access>);
  }, [configData]);

  // Retorna o acesso efetivo (override > padrão)
  const getAccess = (row: FeatureRow, role: RoleKey): Access => {
    const key = `${row.module}|${row.feature}|${role}`;
    const src = editMode ? draftOverrides : overrides;
    return src[key] ?? row[role];
  };

  const handleStartEdit = () => {
    setDraftOverrides({ ...overrides });
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setDraftOverrides({});
  };

  const handleCellChange = (row: FeatureRow, role: RoleKey, value: Access) => {
    const key = `${row.module}|${row.feature}|${role}`;
    setDraftOverrides((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Mescla overrides anteriores com rascunho, removendo entradas iguais ao padrão
      const merged: Record<string, Access> = { ...overrides, ...draftOverrides };
      for (const key of Object.keys(merged)) {
        const [mod, feat, role] = key.split("|");
        const row = MATRIX.find((r) => r.module === mod && r.feature === feat);
        if (row && row[role as RoleKey] === merged[key]) delete merged[key];
      }
      if (configData?.id) {
        await (supabase as any).from("role_matrix_config").update({
          overrides: merged, updated_by: user?.id, updated_at: new Date().toISOString(),
        }).eq("id", configData.id);
      } else {
        await (supabase as any).from("role_matrix_config").insert({
          overrides: merged, updated_by: user?.id,
        });
      }
      setOverrides(merged);
      queryClient.invalidateQueries({ queryKey: ["role-matrix-config"] });
      toast.success("Matriz de acesso salva!");
      setEditMode(false);
      setDraftOverrides({});
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Colaboradores: profiles (base) + user_roles + carbo_user_roles ────────
  const [accessMember, setAccessMember] = useState<TeamMember | null>(null);

  const { data: collabData, isLoading: loadingCollabs } = useQuery({
    queryKey: ["collab-matrix-data"],
    queryFn: async () => {
      const [
        { data: profiles },
        { data: appRolesData },
        { data: carboRolesData },
      ] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, department, allowed_interfaces").eq("status", "approved"),
        supabase.from("user_roles" as any).select("user_id, role"),
        supabase.from("carbo_user_roles" as any).select("user_id, role"),
      ]);

      // Build maps
      const appRolesByUser = new Map<string, string[]>();
      for (const r of (appRolesData || []) as any[]) {
        if (!appRolesByUser.has(r.user_id)) appRolesByUser.set(r.user_id, []);
        appRolesByUser.get(r.user_id)!.push(r.role);
      }
      const carboRolesByUser = new Map<string, string[]>();
      for (const r of (carboRolesData || []) as any[]) {
        if (!carboRolesByUser.has(r.user_id)) carboRolesByUser.set(r.user_id, []);
        carboRolesByUser.get(r.user_id)!.push(r.role);
      }

      return (profiles || []).map((p: any): CollabUser => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        department: p.department,
        app_roles: appRolesByUser.get(p.id) || [],
        carbo_roles: carboRolesByUser.get(p.id) || [],
        allowed_interfaces: p.allowed_interfaces || [],
      }));
    },
    enabled: tab === "colaboradores",
  });

  const collaborators = (collabData || []).slice().sort((a, b) =>
    (a.full_name || "").localeCompare(b.full_name || "")
  );

  // ── Per-user module overrides ─────────────────────────────────────────────
  const { data: allOverridesData } = useQuery({
    queryKey: ["all-user-module-overrides"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_module_overrides")
        .select("user_id, module_key, access");
      return data as { user_id: string; module_key: string; access: string }[] | null;
    },
    enabled: tab === "colaboradores",
  });

  const overridesByUser = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const o of (allOverridesData || [])) {
      if (!map.has(o.user_id)) map.set(o.user_id, {});
      map.get(o.user_id)![o.module_key] = o.access;
    }
    return map;
  }, [allOverridesData]);

  // Converte CollabUser → TeamMember para o AccessConfigDialog
  const toTeamMember = (u: CollabUser): TeamMember => ({
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    avatar_url: null,
    department: u.department as any,
    status: "approved",
    requested_role: null,
    roles: u.app_roles as any[],
    carbo_roles: u.carbo_roles,
    username: null,
    password_must_change: false,
    created_by_manager: null,
    last_access: null,
    temp_password_sent_at: null,
    allowed_interfaces: u.allowed_interfaces,
  });

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Matriz de Autorização"
          description="Permissões por cargo em cada módulo do sistema"
          icon={Shield}
        />

        {/* Tab toggle + Editar Matriz (global) */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
            <button
              onClick={() => setTab("cargos")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                tab === "cargos"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              Por Cargo
            </button>
            <button
              onClick={() => setTab("colaboradores")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                tab === "colaboradores"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="h-4 w-4" />
              Por Colaborador
            </button>
          </div>

          {/* Editar Matriz — visível apenas na aba Por Cargo (Por Colaborador tem "Acesso" por linha) */}
          {isMasterAdmin && tab === "cargos" && (
            <div className="flex items-center gap-2">
              {editMode ? (
                <>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={saving}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                    Salvar Alterações
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={handleStartEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar Matriz
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(ACCESS_LABEL).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              {getAccessIcon(key as Access)}
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        {/* ── ABA: POR CARGO ─────────────────────────────────── */}
        {tab === "cargos" && (
          <>
            {/* Role Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {ROLES.map((r) => (
                <CarboCard key={r.key}>
                  <CarboCardContent className="p-3">
                    <div className={`w-2 h-2 rounded-full ${r.color} mb-2`} />
                    <p className="font-semibold text-sm">{r.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
                  </CarboCardContent>
                </CarboCard>
              ))}
            </div>

            {/* Matrix Table */}
            <CarboCard padding="none">
              {/* Status bar de edição */}
              {editMode && (
                <div className="flex items-center gap-2 px-4 py-2 border-b bg-amber-500/5 border-amber-500/20">
                  <Pencil className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Modo edição — clique em qualquer célula para alterar o nível de acesso
                  </p>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-3 font-medium w-28">Módulo</th>
                      <th className="text-left p-3 font-medium">Funcionalidade</th>
                      {ROLES.map((r) => (
                        <th key={r.key} className={cn("p-3 font-medium text-center whitespace-nowrap", editMode ? "w-36" : "w-28")}>
                          <div className={`inline-block w-2 h-2 rounded-full ${r.color} mr-1`} />
                          {r.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((mod) => {
                      const rows = MATRIX.filter((r) => r.module === mod);
                      return rows.map((row, i) => (
                        <tr key={`${mod}-${i}`} className={cn("border-b transition-colors", editMode ? "hover:bg-amber-50/10" : "hover:bg-muted/20")}>
                          {i === 0 && (
                            <td className="p-3 align-top" rowSpan={rows.length}>
                              <CarboBadge variant="secondary" className="text-[10px] whitespace-nowrap">{mod}</CarboBadge>
                            </td>
                          )}
                          <td className="p-3 text-muted-foreground">{row.feature}</td>
                          {ROLES.map((r) => {
                            const access = getAccess(row, r.key);
                            const isChanged = editMode && (draftOverrides[`${row.module}|${row.feature}|${r.key}`] !== undefined);
                            return (
                              <td key={r.key} className={cn("p-2 text-center", isChanged && "bg-amber-500/10")}
                                  title={!editMode ? ACCESS_LABEL[access] : undefined}>
                                <AccessCell
                                  access={access}
                                  editMode={editMode}
                                  onChange={(v) => handleCellChange(row, r.key, v)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </CarboCard>
          </>
        )}

        {/* ── ABA: POR COLABORADOR ───────────────────────────── */}
        {tab === "colaboradores" && (
          <CarboCard padding="none">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <CarboCardTitle className="text-base">Acesso efetivo por colaborador</CarboCardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clique em <span className="font-semibold text-primary">Acesso</span> em cada linha para configurar roles, interfaces e <span className="font-semibold">permissões por módulo</span> individualmente. Um ponto azul indica override ativo.
                </p>
              </div>
            </div>
            {loadingCollabs ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Carregando colaboradores...</div>
            ) : collaborators.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Nenhum colaborador ativo encontrado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-2 pl-3 font-medium min-w-[200px] sticky left-0 bg-muted/40 z-10 border-r">
                        Colaborador
                      </th>
                      {MODULES.map((mod) => (
                        <th key={mod} className="p-2 font-medium text-center w-16">
                          <span className="text-[10px] leading-tight block">{mod}</span>
                        </th>
                      ))}
                      <th className="p-2 font-medium text-center w-20">Acesso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collaborators.map((u) => (
                      <CollaboratorRow
                        key={u.id}
                        user={u}
                        moduleOverrides={overridesByUser.get(u.id) ?? {}}
                        onEdit={(collab) => setAccessMember(toTeamMember(collab))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CarboCard>
        )}

        {/* AccessConfigDialog — configurar acesso diretamente pela matrix */}
        <AccessConfigDialog
          member={accessMember}
          open={!!accessMember}
          onOpenChange={(v) => {
            if (!v) {
              setAccessMember(null);
              queryClient.invalidateQueries({ queryKey: ["collab-matrix-data"] });
            }
          }}
        />

        {/* Notes */}
        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="text-sm font-medium mb-2">Observações importantes:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>Próprios</strong> = o usuário acessa apenas os registros que ele mesmo criou</li>
              <li>• <strong>Somente leitura</strong> = visualiza mas não pode criar, editar ou excluir</li>
              <li>• <strong>Acesso total</strong> = criar, editar, excluir e aprovar</li>
              <li>• Permissões são reforçadas pelo RLS no banco — não apenas no frontend</li>
              <li>• O <strong>CEO</strong> é o único com acesso à Governança e Cockpit Estratégico</li>
            </ul>
          </CarboCardContent>
        </CarboCard>
      </div>
    </BoardLayout>
  );
}
