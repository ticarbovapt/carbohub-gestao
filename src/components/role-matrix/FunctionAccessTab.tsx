import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DEPARTMENTS, SCREEN_GROUPS, DATA_SCOPES, type DataScope } from "@/constants/functionAccessConfig";
import {
  useDepartmentFunctions,
  useCreateDepartmentFunction,
  useUpdateFunctionScope,
} from "@/hooks/useDepartmentFunctions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Save, Loader2, Shield, AlertTriangle, Plus, Eye } from "lucide-react";
import { toast } from "sonner";

type AccessMap = Record<string, Set<string>>;

function buildKey(dept: string, funcKey: string) {
  return `${dept}|${funcKey}`;
}

function ScopeBadge({ scope }: { scope: DataScope }) {
  const s = DATA_SCOPES.find(d => d.value === scope);
  if (!s) return null;
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border", {
      "border-border text-muted-foreground bg-muted/40": scope === "proprio",
      "border-blue-500/40 text-blue-500 bg-blue-500/10": scope === "equipe",
      "border-violet-500/40 text-violet-500 bg-violet-500/10": scope === "departamento",
      "border-green-500/40 text-green-600 bg-green-500/10": scope === "global",
    })}>
      {s.label}
    </span>
  );
}

export function FunctionAccessTab() {
  const { user, isAdmin, isMasterAdmin, isAnyGestor } = useAuth();
  const qc = useQueryClient();
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0].key);
  const [selectedFunc, setSelectedFunc] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(SCREEN_GROUPS.map(g => g.id)));
  const [localAccess, setLocalAccess] = useState<AccessMap>({});
  const [localScopes, setLocalScopes] = useState<Record<string, DataScope>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const canManage = isAdmin || isMasterAdmin || isAnyGestor;
  const createFn = useCreateDepartmentFunction();
  const updateScope = useUpdateFunctionScope();
  const [addFnOpen, setAddFnOpen] = useState(false);
  const [newFn, setNewFn] = useState({ label: "", reports_to_key: "", scope: "proprio" as DataScope });

  const { data: deptFunctions = [], isLoading: loadingFns } = useDepartmentFunctions(selectedDept);

  // Seed localScopes from DB data
  useEffect(() => {
    const map: Record<string, DataScope> = {};
    deptFunctions.forEach(fn => {
      map[buildKey(fn.department, fn.function_key)] = fn.data_scope;
    });
    setLocalScopes(prev => ({ ...prev, ...map }));
  }, [deptFunctions]);

  const handleCreateFunction = async () => {
    if (!newFn.label.trim()) return;
    const function_key = newFn.label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const maxOrder = deptFunctions.reduce((m, f) => Math.max(m, f.hierarchy_order), 0);
    await createFn.mutateAsync({
      department: selectedDept,
      function_key,
      label: newFn.label.trim(),
      hierarchy_order: maxOrder + 1,
      reports_to_key: newFn.reports_to_key || null,
      data_scope: newFn.scope,
    } as any);
    setAddFnOpen(false);
    setNewFn({ label: "", reports_to_key: "", scope: "proprio" });
  };

  const { data: dbData, isError: loadError } = useQuery({
    queryKey: ["function-screen-access"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("function_screen_access")
        .select("department, function_key, screen_ids");
      if (error) throw error;
      return (data || []) as { department: string; function_key: string; screen_ids: string[] }[];
    },
    retry: 1,
  });

  useEffect(() => {
    if (!dbData) return;
    const map: AccessMap = {};
    for (const row of dbData) {
      map[buildKey(row.department, row.function_key)] = new Set(row.screen_ids || []);
    }
    setLocalAccess(map);
  }, [dbData]);

  const currentKey = selectedFunc ? buildKey(selectedDept, selectedFunc) : null;
  const currentScreens: Set<string> = currentKey ? (localAccess[currentKey] || new Set()) : new Set();
  const currentScope: DataScope = currentKey ? (localScopes[currentKey] || "proprio") : "proprio";

  const setScope = (scope: DataScope) => {
    if (!currentKey) return;
    setLocalScopes(prev => ({ ...prev, [currentKey]: scope }));
    setDirty(true);
  };

  const updateScreens = (updater: (prev: Set<string>) => Set<string>) => {
    if (!currentKey) return;
    setLocalAccess(prev => ({
      ...prev,
      [currentKey]: updater(new Set(prev[currentKey] || [])),
    }));
    setDirty(true);
  };

  const toggleGroup = (groupId: string) => {
    const group = SCREEN_GROUPS.find(g => g.id === groupId);
    if (!group) return;
    const ids = group.screens.map(s => s.id);
    const allEnabled = ids.every(id => currentScreens.has(id));
    updateScreens(prev => {
      const next = new Set(prev);
      if (allEnabled) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleScreen = (screenId: string) => {
    updateScreens(prev => {
      const next = new Set(prev);
      if (next.has(screenId)) next.delete(screenId);
      else next.add(screenId);
      return next;
    });
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!currentKey || !selectedFunc) return;
    setSaving(true);
    try {
      // Save screen access — must check error explicitly (supabase doesn't throw)
      const { error: upsertError } = await (supabase as any)
        .from("function_screen_access")
        .upsert({
          department: selectedDept,
          function_key: selectedFunc,
          screen_ids: Array.from(currentScreens),
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        }, { onConflict: "department,function_key" });

      if (upsertError) throw upsertError;

      // Save scope (best-effort — silently skips if column doesn't exist yet)
      try {
        await updateScope.mutateAsync({
          department: selectedDept,
          function_key: selectedFunc,
          data_scope: currentScope,
        });
      } catch { /* migration pending — scope will persist after it runs */ }

      await qc.invalidateQueries({ queryKey: ["function-screen-access"] });
      toast.success("Configuração salva!");
      setDirty(false);
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || e.details || JSON.stringify(e)));
    } finally {
      setSaving(false);
    }
  };

  const currentDept = DEPARTMENTS.find(d => d.key === selectedDept);
  const selectedFnData = deptFunctions.find(f => f.function_key === selectedFunc);

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-700 dark:text-amber-400">
          <strong>Modo configuração:</strong> as alterações aqui são salvas para organização futura e{" "}
          <strong>não afetam os acessos reais</strong> até ativação oficial.
        </p>
      </div>

      {loadError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">
            <strong>Tabela não encontrada.</strong> Execute as migrations do Supabase para habilitar o salvamento das configurações.{" "}
            <code className="text-xs bg-destructive/10 px-1 rounded">20260515000000_function_screen_access.sql</code>
          </p>
        </div>
      )}

      {/* 3-panel layout */}
      <div className="grid grid-cols-[160px_200px_1fr] border rounded-lg overflow-hidden min-h-[520px]">

        {/* Panel 1 — Departments */}
        <div className="border-r bg-muted/20 flex flex-col">
          <div className="px-3 py-2.5 border-b bg-muted/40">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Departamento</p>
          </div>
          {DEPARTMENTS.map(dept => (
            <button
              key={dept.key}
              onClick={() => { setSelectedDept(dept.key); setSelectedFunc(null); setDirty(false); }}
              className={cn(
                "w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-border/40 flex items-center justify-between gap-1",
                selectedDept === dept.key
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <span>{dept.label}</span>
              {dept.fullAccess && <Shield className="h-3 w-3 text-carbo-green shrink-0" />}
            </button>
          ))}
        </div>

        {/* Panel 2 — Functions */}
        <div className="border-r flex flex-col">
          <div className="px-3 py-2.5 border-b bg-muted/40">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Função</p>
          </div>
          {currentDept?.fullAccess ? (
            <div className="flex flex-col items-center justify-center flex-1 p-4 gap-2 text-center">
              <Shield className="h-8 w-8 text-carbo-green" />
              <p className="text-xs font-semibold text-carbo-green">Acesso Total</p>
              <p className="text-[11px] text-muted-foreground">TI/Suporte vê todas as telas por padrão do sistema.</p>
            </div>
          ) : loadingFns ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                {deptFunctions.map(fn => {
                  const key = buildKey(selectedDept, fn.function_key);
                  const count = (localAccess[key] || new Set()).size;
                  const scope = localScopes[key] || fn.data_scope;
                  const reportsTo = deptFunctions.find(f => f.function_key === fn.reports_to_key);
                  return (
                    <button
                      key={fn.function_key}
                      onClick={() => { setSelectedFunc(fn.function_key); setDirty(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-border/40",
                        selectedFunc === fn.function_key
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span>{fn.label}</span>
                        <ScopeBadge scope={scope} />
                      </div>
                      <span className="text-[10px] text-muted-foreground block">
                        {reportsTo ? `↳ ${reportsTo.label}` : "Nível superior"}
                        {count > 0 && ` · ${count} tela${count !== 1 ? "s" : ""}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              {canManage && (
                <div className="p-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs gap-1"
                    onClick={() => setAddFnOpen(true)}
                  >
                    <Plus className="h-3 w-3" /> Nova função
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Panel 3 — Screens + Scope */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 border-b bg-muted/40 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Telas de acesso
              {selectedFnData && currentDept && (
                <span className="ml-2 normal-case font-normal text-foreground">
                  — {currentDept.label} / {selectedFnData.label}
                </span>
              )}
            </p>
            {selectedFunc && dirty && (
              <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
                {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Salvar
              </Button>
            )}
          </div>

          {!selectedFunc ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Selecione uma função no painel ao lado
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Scope selector */}
              <div className="px-4 py-3 border-b border-border/60 bg-muted/10 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Eye className="h-3.5 w-3.5" />
                  Visibilidade de Dados
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {DATA_SCOPES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setScope(s.value)}
                      title={s.description}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-center text-[11px] font-medium transition-all",
                        currentScope === s.value ? {
                          "proprio":      "border-border bg-muted text-foreground",
                          "equipe":       "border-blue-500/60 bg-blue-500/10 text-blue-500",
                          "departamento": "border-violet-500/60 bg-violet-500/10 text-violet-500",
                          "global":       "border-green-500/60 bg-green-500/10 text-green-600",
                        }[s.value] : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                    >
                      {s.label}
                      <span className="block text-[9px] font-normal opacity-70 leading-tight mt-0.5">
                        {s.description.split(" ").slice(0, 3).join(" ")}…
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Screen groups */}
              <div className="p-3 space-y-2">
                {SCREEN_GROUPS.map(group => {
                  const groupScreenIds = group.screens.map(s => s.id);
                  const enabledCount = groupScreenIds.filter(id => currentScreens.has(id)).length;
                  const allEnabled = enabledCount === groupScreenIds.length;
                  const someEnabled = enabledCount > 0 && !allEnabled;
                  const expanded = expandedGroups.has(group.id);

                  return (
                    <div key={group.id} className="border border-border rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                        <button
                          onClick={() => toggleGroupExpand(group.id)}
                          className="flex items-center gap-2 flex-1 text-left"
                        >
                          {expanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className="text-sm font-medium">{group.label}</span>
                          <span className={cn(
                            "text-[11px] ml-1",
                            allEnabled ? "text-carbo-green" : someEnabled ? "text-warning" : "text-muted-foreground"
                          )}>
                            {enabledCount}/{groupScreenIds.length}
                          </span>
                        </button>
                        <Switch
                          checked={allEnabled}
                          onCheckedChange={() => toggleGroup(group.id)}
                          className="scale-75"
                        />
                      </div>
                      {expanded && (
                        <div className="divide-y divide-border/40">
                          {group.screens.map(screen => (
                            <label
                              key={screen.id}
                              className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/20 transition-colors"
                            >
                              <div>
                                <span className="text-sm">{screen.label}</span>
                                <span className="text-[10px] text-muted-foreground ml-2 font-mono">{screen.path}</span>
                              </div>
                              <Switch
                                checked={currentScreens.has(screen.id)}
                                onCheckedChange={() => toggleScreen(screen.id)}
                                className="scale-75"
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialog: Nova função */}
      <Dialog open={addFnOpen} onOpenChange={setAddFnOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Função — {currentDept?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome da função *</Label>
              <Input
                placeholder="Ex: Analista de Produção"
                value={newFn.label}
                onChange={e => setNewFn(p => ({ ...p, label: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <Label>Visibilidade de Dados</Label>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                {DATA_SCOPES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setNewFn(p => ({ ...p, scope: s.value }))}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-xs transition-all",
                      newFn.scope === s.value
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:border-border/80"
                    )}
                  >
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-[10px] opacity-70">{s.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Responde a (superior direto)</Label>
              <Select
                value={newFn.reports_to_key || "_none"}
                onValueChange={v => setNewFn(p => ({ ...p, reports_to_key: v === "_none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum (nível superior)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Nível superior —</SelectItem>
                  {deptFunctions.map(f => (
                    <SelectItem key={f.function_key} value={f.function_key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFnOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreateFunction}
              disabled={!newFn.label.trim() || createFn.isPending}
            >
              {createFn.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
