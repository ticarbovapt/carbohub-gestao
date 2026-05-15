import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DEPARTMENTS, SCREEN_GROUPS } from "@/constants/functionAccessConfig";
import { useDepartmentFunctions, useCreateDepartmentFunction } from "@/hooks/useDepartmentFunctions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Save, Loader2, Shield, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";

type AccessMap = Record<string, Set<string>>; // key = "dept|funcKey", value = Set<screenId>

function buildKey(dept: string, funcKey: string) {
  return `${dept}|${funcKey}`;
}

export function FunctionAccessTab() {
  const { user, isAdmin, isMasterAdmin, isAnyGestor } = useAuth();
  const qc = useQueryClient();
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0].key);
  const [selectedFunc, setSelectedFunc] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(SCREEN_GROUPS.map(g => g.id)));
  const [localAccess, setLocalAccess] = useState<AccessMap>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const canManageFunctions = isAdmin || isMasterAdmin || isAnyGestor;
  const createFn = useCreateDepartmentFunction();
  const [addFnOpen, setAddFnOpen] = useState(false);
  const [newFn, setNewFn] = useState({ label: "", hierarchy_order: 99, reports_to_key: "" });

  const { data: deptFunctions, isLoading: loadingFns } = useDepartmentFunctions(selectedDept);
  const filteredFns = (deptFunctions || []).filter(f => f.department === selectedDept);

  const handleCreateFunction = async () => {
    if (!newFn.label.trim()) return;
    const function_key = newFn.label.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    await createFn.mutateAsync({
      department: selectedDept,
      function_key,
      label: newFn.label.trim(),
      hierarchy_order: newFn.hierarchy_order,
      reports_to_key: newFn.reports_to_key || null,
    });
    setAddFnOpen(false);
    setNewFn({ label: "", hierarchy_order: 99, reports_to_key: "" });
  };

  const { data: dbData, isLoading } = useQuery({
    queryKey: ["function-screen-access"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("function_screen_access")
        .select("department, function_key, screen_ids");
      if (error) throw error;
      return (data || []) as { department: string; function_key: string; screen_ids: string[] }[];
    },
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
    const groupScreenIds = group.screens.map(s => s.id);
    const allEnabled = groupScreenIds.every(id => currentScreens.has(id));
    updateScreens(prev => {
      const next = new Set(prev);
      if (allEnabled) {
        groupScreenIds.forEach(id => next.delete(id));
      } else {
        groupScreenIds.forEach(id => next.add(id));
      }
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
      const screenIds = Array.from(currentScreens);
      await (supabase as any)
        .from("function_screen_access")
        .upsert({
          department: selectedDept,
          function_key: selectedFunc,
          screen_ids: screenIds,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        }, { onConflict: "department,function_key" });
      qc.invalidateQueries({ queryKey: ["function-screen-access"] });
      toast.success("Configuração salva!");
      setDirty(false);
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const currentDept = DEPARTMENTS.find(d => d.key === selectedDept);

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-700 dark:text-amber-400">
          <strong>Modo configuração:</strong> as alterações aqui são salvas para organização futura e <strong>não afetam os acessos reais</strong> até ativação oficial.
        </p>
      </div>

      {/* 3-panel layout */}
      <div className="grid grid-cols-[160px_180px_1fr] border rounded-lg overflow-hidden min-h-[520px]">
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
                {filteredFns.map(fn => {
                  const key = buildKey(selectedDept, fn.function_key);
                  const count = (localAccess[key] || new Set()).size;
                  const reportsTo = filteredFns.find(f => f.function_key === fn.reports_to_key);
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
                      <span className="block">{fn.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {reportsTo ? `↳ responde a ${reportsTo.label}` : "Nível superior"}
                        {count > 0 && ` · ${count} tela${count !== 1 ? "s" : ""}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              {canManageFunctions && (
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

        {/* Panel 3 — Screens */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 border-b bg-muted/40 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Telas de acesso
              {selectedFunc && currentDept && (
                <span className="ml-2 normal-case font-normal text-foreground">
                  — {currentDept.label} / {filteredFns.find(f => f.function_key === selectedFunc)?.label}
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
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {SCREEN_GROUPS.map(group => {
                const groupScreenIds = group.screens.map(s => s.id);
                const enabledCount = groupScreenIds.filter(id => currentScreens.has(id)).length;
                const allEnabled = enabledCount === groupScreenIds.length;
                const someEnabled = enabledCount > 0 && !allEnabled;
                const expanded = expandedGroups.has(group.id);

                return (
                  <div key={group.id} className="border border-border rounded-lg overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                      <button
                        onClick={() => toggleGroupExpand(group.id)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        {expanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                        <span className="text-sm font-medium">{group.label}</span>
                        <span className={cn(
                          "text-[11px] ml-1",
                          allEnabled ? "text-carbo-green" : someEnabled ? "text-warning" : "text-muted-foreground"
                        )}>
                          {enabledCount}/{groupScreenIds.length}
                        </span>
                      </button>
                      {/* Group toggle */}
                      <Switch
                        checked={allEnabled}
                        onCheckedChange={() => toggleGroup(group.id)}
                        className="scale-75"
                      />
                    </div>

                    {/* Individual screens */}
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
          )}
        </div>
      </div>
      {/* Dialog: criar nova função */}
      <Dialog open={addFnOpen} onOpenChange={setAddFnOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Função — {DEPARTMENTS.find(d => d.key === selectedDept)?.label}</DialogTitle>
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
              <Label>Ordem hierárquica (1 = mais alto)</Label>
              <Input
                type="number"
                min={1}
                value={newFn.hierarchy_order}
                onChange={e => setNewFn(p => ({ ...p, hierarchy_order: Number(e.target.value) }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Funções existentes: {filteredFns.map(f => `${f.hierarchy_order}=${f.label}`).join(", ")}
              </p>
            </div>
            <div>
              <Label>Responde a (superior direto)</Label>
              <Select
                value={newFn.reports_to_key}
                onValueChange={v => setNewFn(p => ({ ...p, reports_to_key: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Nenhum (nível superior) —</SelectItem>
                  {filteredFns.map(f => (
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
              {createFn.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
