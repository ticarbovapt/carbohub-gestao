import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Shield, Eye, Wrench, CheckCircle, XCircle, ChevronDown, ChevronRight, Users, LayoutGrid, Pencil, Save, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// ─── Role definitions ──────────────────────────────────────────────────────

const ROLES = [
  { key: "ceo",            label: "CEO",               color: "bg-purple-500",   desc: "Acesso total ao sistema" },
  { key: "gestor_adm",     label: "Gestor ADM",        color: "bg-blue-500",     desc: "Gestão administrativa e comercial" },
  { key: "gestor_fin",     label: "Gestor Financeiro", color: "bg-emerald-500",  desc: "Financeiro, comissões, faturamento" },
  { key: "gestor_compras", label: "Gestor Compras/Ops",color: "bg-amber-500",    desc: "Suprimentos, produção, logística" },
  { key: "operador_fiscal",label: "Operador Fiscal",   color: "bg-cyan-500",     desc: "Emissão NF, expedição, rastreio" },
  { key: "vendedor",       label: "Vendedor",          color: "bg-carbo-green",  desc: "Criar pedidos, ver leads B2B" },
  { key: "operador",       label: "Operador",          color: "bg-gray-500",     desc: "Executar etapas operacionais" },
] as const;

type RoleKey = typeof ROLES[number]["key"];

// Mapeia CarboRole (DB) → RoleKey da MATRIX estática
const ROLE_KEY_MAP: Record<string, RoleKey> = {
  "ceo":              "ceo",
  "gestor_adm":       "gestor_adm",
  "gestor_fin":       "gestor_fin",
  "gestor_compras":   "gestor_compras",
  "operador_fiscal":  "operador_fiscal",
  "vendedor":         "vendedor",
  "operador":         "operador",
  // Aliases exibidos no CarboRolesManager
  "Admin Estratégico (CEO)":    "ceo",
  "Gestor Administrativo":      "gestor_adm",
  "Gestor Financeiro":          "gestor_fin",
  "Gestor Compras & Logística": "gestor_compras",
  "Operador Fiscal":            "operador_fiscal",
  "Operador":                   "operador",
};

// ─── Feature/Page access matrix ────────────────────────────────────────────

type Access = "full" | "read" | "none" | "own";

interface FeatureRow {
  module: string;
  feature: string;
  ceo: Access;
  gestor_adm: Access;
  gestor_fin: Access;
  gestor_compras: Access;
  operador_fiscal: Access;
  vendedor: Access;
  operador: Access;
}

const MATRIX: FeatureRow[] = [
  { module: "Dashboard",      feature: "Home / KPIs gerais",           ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"read",  operador_fiscal:"read", vendedor:"read", operador:"read" },
  { module: "Dashboard",      feature: "Cockpit Estratégico",          ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Pedidos",        feature: "Ver lista de pedidos",         ceo:"full", gestor_adm:"full",  gestor_fin:"full",  gestor_compras:"read",  operador_fiscal:"read", vendedor:"own",  operador:"none" },
  { module: "Pedidos",        feature: "Criar pedido (RV)",            ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none" },
  { module: "Pedidos",        feature: "Editar / alterar status",      ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"read",  operador_fiscal:"full", vendedor:"none", operador:"none" },
  { module: "Pedidos",        feature: "Ver comissão e dados fiscais", ceo:"full", gestor_adm:"full",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"full", vendedor:"own",  operador:"none" },
  { module: "Funil B2B",      feature: "Ver leads",                    ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none" },
  { module: "Funil B2B",      feature: "Criar / avançar lead",         ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none" },
  { module: "Funil B2B",      feature: "Converter lead em pedido",     ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none" },
  { module: "Metas",          feature: "Ver metas de vendas",          ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"own",  operador:"none" },
  { module: "Metas",          feature: "Criar / editar metas",         ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Produção (OP)",  feature: "Ver Ordens de Produção",       ceo:"full", gestor_adm:"read",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full" },
  { module: "Produção (OP)",  feature: "Criar / confirmar OP",         ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full" },
  { module: "Serviços (OS)",  feature: "Ver Ordens de Serviço",        ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full" },
  { module: "Serviços (OS)",  feature: "Criar / executar OS",          ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full" },
  { module: "Suprimentos",    feature: "Ver estoque",                  ceo:"full", gestor_adm:"read",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"read" },
  { module: "Suprimentos",    feature: "Movimentar estoque",           ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"full" },
  { module: "Suprimentos",    feature: "Política de estoque mínimo",   ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Compras",        feature: "Requisições de compra",        ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"full",  operador_fiscal:"read", vendedor:"none", operador:"none" },
  { module: "Compras",        feature: "Aprovar RC / emitir PO",       ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Compras",        feature: "Receber e dar entrada NF",     ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"full",  operador_fiscal:"full", vendedor:"none", operador:"full" },
  { module: "Financeiro",     feature: "Ver relatórios financeiros",   ceo:"full", gestor_adm:"read",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"read", vendedor:"none", operador:"none" },
  { module: "Financeiro",     feature: "Lançar / aprovar pagamentos",  ceo:"full", gestor_adm:"none",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Licenciados",    feature: "Ver rede de licenciados",      ceo:"full", gestor_adm:"full",  gestor_fin:"read",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"full", operador:"none" },
  { module: "Licenciados",    feature: "Criar / editar licenciados",   ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Time & Admin",   feature: "Gerenciar membros",            ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Time & Admin",   feature: "Importar time em massa",       ceo:"full", gestor_adm:"full",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Time & Admin",   feature: "Matriz de permissões",         ceo:"full", gestor_adm:"read",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Integrações",    feature: "Bling ERP",                    ceo:"full", gestor_adm:"full",  gestor_fin:"full",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
  { module: "Governança",     feature: "Log de auditoria / governança",ceo:"full", gestor_adm:"none",  gestor_fin:"none",  gestor_compras:"none",  operador_fiscal:"none", vendedor:"none", operador:"none" },
];

const MODULES = [...new Set(MATRIX.map((r) => r.module))];

function getAccessIcon(access: Access, size = "h-4 w-4") {
  switch (access) {
    case "full": return <CheckCircle className={`${size} text-carbo-green mx-auto`} />;
    case "read": return <Eye         className={`${size} text-carbo-blue mx-auto`} />;
    case "own":  return <Wrench      className={`${size} text-warning mx-auto`} />;
    case "none": return <XCircle     className={`${size} text-muted-foreground/30 mx-auto`} />;
  }
}

const ACCESS_LABEL: Record<Access, string> = {
  full: "Acesso total",
  read: "Somente leitura",
  own:  "Apenas próprios",
  none: "Sem acesso",
};

const PRIORITY: Record<Access, number> = { full: 3, own: 2, read: 1, none: 0 };

function getEffectiveAccess(roleKeys: RoleKey[], feature: FeatureRow): Access {
  let best: Access = "none";
  for (const rk of roleKeys) {
    const a = feature[rk] as Access;
    if (PRIORITY[a] > PRIORITY[best]) best = a;
  }
  return best;
}

// ─── Collaborator row ──────────────────────────────────────────────────────

function CollaboratorRow({ user }: { user: { id: string; full_name: string | null; email: string | null; roles: string[] } }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const roleKeys: RoleKey[] = user.roles
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
        {/* Module effective access */}
        {MODULES.map((mod) => {
          const rows = MATRIX.filter((r) => r.module === mod);
          // best access across all features in the module
          let best: Access = "none";
          for (const row of rows) {
            const a = getEffectiveAccess(roleKeys, row);
            if (PRIORITY[a] > PRIORITY[best]) best = a;
          }
          return (
            <td key={mod} className="p-2 text-center w-16">
              {getAccessIcon(best, "h-3.5 w-3.5")}
            </td>
          );
        })}
        {/* Edit button */}
        <td className="p-2 text-center">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={(e) => { e.stopPropagation(); navigate("/governance"); }}
          >
            Editar
          </Button>
        </td>
      </tr>

      {/* Expanded: roles badges + per-feature detail */}
      {expanded && (
        <tr className="bg-muted/10 border-b">
          <td className="p-3 pl-10" colSpan={MODULES.length + 2}>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs text-muted-foreground font-medium">Roles:</span>
              {user.roles.length > 0
                ? user.roles.map((r) => (
                    <span key={r} className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{r}</span>
                  ))
                : <span className="text-xs text-muted-foreground italic">Sem roles atribuídos</span>
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

  // ── Colaboradores: query em 2 etapas (fix JOIN) ───────────────────────────
  const { data: userRolesData, isLoading: loadingCollabs } = useQuery({
    queryKey: ["carbo-user-roles-matrix"],
    queryFn: async () => {
      // Etapa 1: pegar todos os roles
      const { data: rolesData, error: e1 } = await supabase
        .from("carbo_user_roles" as any)
        .select("user_id, role");
      if (e1) throw e1;

      // Etapa 2: pegar profiles dos user_ids únicos
      const ids = [...new Set((rolesData || []).map((r: any) => r.user_id as string))];
      if (ids.length === 0) return [] as Array<{ user_id: string; role: string }>;

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);

      const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

      return (rolesData || []).map((r: any) => ({
        user_id: r.user_id as string,
        role: r.role as string,
        profile: profileMap.get(r.user_id) as { id: string; full_name: string | null; email: string | null } | undefined,
      }));
    },
    enabled: tab === "colaboradores",
  });

  // Agrupa roles por colaborador
  const collaborators = (() => {
    if (!userRolesData) return [];
    const map = new Map<string, { id: string; full_name: string | null; email: string | null; roles: string[] }>();
    for (const row of (userRolesData as any[])) {
      const p = row.profile;
      if (!p) continue;
      if (!map.has(p.id)) map.set(p.id, { id: p.id, full_name: p.full_name, email: p.email, roles: [] });
      map.get(p.id)!.roles.push(row.role as string);
    }
    return [...map.values()].sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  })();

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Matriz de Autorização"
          description="Permissões por cargo em cada módulo do sistema"
          icon={Shield}
        />

        {/* Tab toggle */}
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
              {/* Toolbar de edição */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  {editMode
                    ? "Modo edição — clique em qualquer célula para alterar o nível de acesso"
                    : "Clique em Editar para personalizar as permissões por cargo"}
                </p>
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
                  ) : isMasterAdmin ? (
                    <Button size="sm" variant="outline" onClick={handleStartEdit}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar Matriz
                    </Button>
                  ) : null}
                </div>
              </div>

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
                  Calculado a partir dos roles atribuídos. Clique na linha para ver detalhes.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => window.location.href = "/governance"}>
                Gerenciar Roles
              </Button>
            </div>
            {loadingCollabs ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Carregando colaboradores...</div>
            ) : collaborators.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Nenhum colaborador com roles atribuídos. <br />
                <a href="/governance" className="text-primary underline text-xs">Atribuir roles →</a>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-2 pl-3 font-medium min-w-[180px] sticky left-0 bg-muted/40 z-10 border-r">
                        Colaborador
                      </th>
                      {MODULES.map((mod) => (
                        <th key={mod} className="p-2 font-medium text-center w-16">
                          <span className="text-[10px] leading-tight block">{mod}</span>
                        </th>
                      ))}
                      <th className="p-2 font-medium text-center w-16">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collaborators.map((user) => (
                      <CollaboratorRow key={user.id} user={user} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CarboCard>
        )}

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
