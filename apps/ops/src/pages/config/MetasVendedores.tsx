import { useMemo, useState } from "react";
import { format, startOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Target, Settings, Save } from "lucide-react";
import {
  useMetasVendedores, useMetaDefaultsStartingAt,
  useSetMetaDefault, useRemoveMetaDefault, useSetMetaMes, useRemoveMetaMes,
  type MetaVendedor,
} from "@/hooks/useMetas";
import { ECOM_PLATFORMS, brl } from "../ecommerce/platforms";

// ─────────────────────────────────────────────────────────────────────────────
// Configurar Metas (Carbo Ops). Vendedores: meta PADRÃO com vigência (a partir do
// mês selecionado, vale daí pra frente) + EXCEÇÃO por mês. Histórico não muda:
// uma padrão nova só vale do mês escolhido em diante. E-commerce: port visual.
// ─────────────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

type Tab = "vendedores" | "ecommerce";
type Scope = "default" | "month";

export default function MetasVendedoresConfig() {
  const [tab, setTab]     = useState<Tab>("vendedores");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const weekStart = useMemo(() => new Date(), []);

  const { data: metas = [], isLoading } = useMetasVendedores(month, weekStart);
  const { data: defaultsAt = new Set<string>() } = useMetaDefaultsStartingAt(month);
  const setDefault    = useSetMetaDefault();
  const removeDefault = useRemoveMetaDefault();
  const setMes        = useSetMetaMes();
  const removeMes     = useRemoveMetaMes();
  const saving = setDefault.isPending || setMes.isPending || removeDefault.isPending || removeMes.isPending;

  // Navegação: até 24 meses à frente.
  const maxMonth = useMemo(() => startOfMonth(addMonths(startOfMonth(new Date()), 24)), []);
  const canNext = month < maxMonth;
  const ano = month.getFullYear(); const mes = month.getMonth() + 1;

  // Dialog
  const [dialogOpen, setDialog] = useState(false);
  const [editTarget, setEdit]   = useState<MetaVendedor | null>(null);
  const [editScope, setEditScope] = useState<Scope>("default");
  const [vendedorId, setVendedorId]     = useState("");
  const [targetDigits, setTargetDigits] = useState("");

  const openNew = () => { setEdit(null); setEditScope("default"); setVendedorId(""); setTargetDigits(""); setDialog(true); };
  const openEditDefault = (m: MetaVendedor) => {
    setEdit(m); setEditScope("default"); setVendedorId(m.vendedor_id);
    setTargetDigits(m.source === "padrao" ? String(Math.round(Number(m.target_amount || 0))) : "");
    setDialog(true);
  };
  const openEditMonth = (m: MetaVendedor) => {
    setEdit(m); setEditScope("month"); setVendedorId(m.vendedor_id);
    setTargetDigits(String(Math.round(Number(m.target_amount || 0))));
    setDialog(true);
  };
  const handleClose = () => { setDialog(false); setEdit(null); };

  const targetAmountNum = parseInt(targetDigits.replace(/\D/g, "") || "0", 10);
  const targetDisplay   = targetAmountNum > 0
    ? targetAmountNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : "";

  const handleSave = async () => {
    if (!vendedorId) return;
    try {
      if (editScope === "default") {
        await setDefault.mutateAsync({ vendedor_id: vendedorId, month, target_amount: targetAmountNum });
      } else {
        await setMes.mutateAsync({ vendedor_id: vendedorId, ano, mes, target_amount: targetAmountNum });
      }
      toast.success("Meta salva");
      handleClose();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e instanceof Error ? e.message : "tente de novo"));
    }
  };

  const handleRemoveDefault = async () => {
    if (!vendedorId) return;
    try {
      await removeDefault.mutateAsync({ vendedor_id: vendedorId, month });
      toast.success("Meta padrão removida a partir deste mês");
      handleClose();
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : "tente de novo"));
    }
  };

  const handleVoltarPadrao = async (m: MetaVendedor) => {
    try {
      await removeMes.mutateAsync({ vendedor_id: m.vendedor_id, ano, mes });
      toast.success("Exceção removida — voltou à meta padrão");
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : "tente de novo"));
    }
  };

  // Metas de e-commerce (port visual)
  const onlyDigits = (s: string) => s.replace(/\D/g, "");
  const fmtEcom = (raw: string) => { const d = onlyDigits(raw); return d ? Number(d).toLocaleString("pt-BR") : ""; };
  const [ecom, setEcom] = useState<Record<string, string>>({});
  const ecomTotal = ECOM_PLATFORMS.reduce((s, p) => s + Number(onlyDigits(ecom[p.id] || "0")), 0);

  const MonthNav = () => (
    <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-semibold w-32 text-center capitalize">{format(month, "MMM 'de' yyyy", { locale: ptBR })}</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))} disabled={!canNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-3xl mx-auto">

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6 text-carbo-green" /> Configurar Metas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie metas mensais de vendedores e e-commerce</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["vendedores", "ecommerce"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors border-b-2 -mb-px ${
                tab === t ? "border-carbo-green text-carbo-green bg-carbo-green/5"
                          : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t === "vendedores" ? "Vendedores" : "E-commerce"}
            </button>
          ))}
        </div>

        {/* ── Tab: Vendedores ─────────────────────────────────────────────── */}
        {tab === "vendedores" && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <MonthNav />
              <Button size="sm" className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white" onClick={openNew}>
                <Plus className="h-4 w-4" /> Meta padrão
              </Button>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs text-muted-foreground">
              A <strong className="text-foreground">meta padrão</strong> passa a valer <strong className="text-foreground">a partir do mês selecionado</strong> ({format(month, "MMM/yyyy", { locale: ptBR })}) e segue para os próximos — sem mexer nos meses anteriores.
              Para um mês pontual diferente, use <strong className="text-foreground">"Meta deste mês"</strong>.
            </div>

            {isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />)}</div>
            ) : metas.length === 0 ? (
              <CarboCard>
                <CarboCardContent className="py-12 text-center space-y-3">
                  <Target className="h-10 w-10 mx-auto text-muted-foreground/30" />
                  <p className="text-muted-foreground">Nenhum vendedor marcado. Marque “É vendedor?” no Admin para alguém aparecer aqui.</p>
                </CarboCardContent>
              </CarboCard>
            ) : (
              <div className="space-y-2">
                {[...metas]
                  .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""))
                  .map((m) => (
                    <CarboCard key={m.vendedor_id}>
                      <CarboCardContent className="p-3 flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm truncate">{m.full_name || "—"}</p>
                            {m.source === "mes" && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600">Específica deste mês</span>
                            )}
                            {m.source === "padrao" && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-carbo-green/15 text-carbo-green">Meta padrão</span>
                            )}
                            {m.source === "none" && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Sem meta</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Meta: {fmtBRL(Number(m.target_amount))} · Real: {fmtBRL(m.actual_amount || 0)} ({Math.round(m.pct_amount || 0)}%)
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0 flex-wrap">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openEditDefault(m)}>
                            <Pencil className="h-3 w-3" /> Meta padrão
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openEditMonth(m)}>
                            <Pencil className="h-3 w-3" /> Meta deste mês
                          </Button>
                          {m.source === "mes" && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1" onClick={() => handleVoltarPadrao(m)} disabled={saving}>
                              <Trash2 className="h-3 w-3" /> Voltar ao padrão
                            </Button>
                          )}
                        </div>
                      </CarboCardContent>
                    </CarboCard>
                  ))}
              </div>
            )}
          </>
        )}

        {/* ── Tab: E-commerce (port visual) ───────────────────────────────── */}
        {tab === "ecommerce" && (
          <>
            <div className="flex items-center justify-end"><MonthNav /></div>
            <div className="space-y-3">
              {ECOM_PLATFORMS.map((p) => (
                <CarboCard key={p.id}>
                  <CarboCardContent className="p-4 flex items-center gap-4">
                    <div className="h-11 w-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: p.color + "20" }}>{p.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{p.label}</p>
                      <p className="text-xs text-muted-foreground">Meta de faturamento mensal</p>
                    </div>
                    <div className="w-44 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Meta (R$)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                        <Input className="pl-9 text-right font-semibold tabular-nums" value={fmtEcom(ecom[p.id] || "")} onChange={(e) => setEcom((m) => ({ ...m, [p.id]: onlyDigits(e.target.value) }))} placeholder="0" />
                      </div>
                    </div>
                  </CarboCardContent>
                </CarboCard>
              ))}
            </div>
            <CarboCard className="border-carbo-green/30">
              <CarboCardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-carbo-green/10 flex items-center justify-center text-xl">🎯</div>
                  <div><p className="font-semibold text-sm">Total Geral</p><p className="text-xs text-muted-foreground">Soma das metas por plataforma</p></div>
                </div>
                <p className="text-2xl font-bold tabular-nums text-carbo-green">{brl(ecomTotal)}</p>
              </CarboCardContent>
            </CarboCard>
            <div className="flex justify-end">
              <Button className="gap-2" onClick={() => toast.success("Metas salvas! (port visual — lógica entra depois)")}><Save className="h-4 w-4" /> Salvar metas</Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">Aba de e-commerce: a gravação real entra na fase de lógica.</p>
          </>
        )}

        <p className="text-xs text-muted-foreground text-center">
          O acompanhamento (ranking, progresso) fica no Carbo Sales e em Acompanhamento. Aqui é só a configuração.
        </p>
      </div>

      {/* ── Dialog Nova / Editar Meta ────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-carbo-green" />
              {editScope === "default" ? "Meta padrão" : "Meta deste mês"}
            </DialogTitle>
            <DialogDescription>
              {editScope === "default"
                ? `Passa a valer a partir de ${format(month, "MMMM 'de' yyyy", { locale: ptBR })} (e meses seguintes).`
                : `Exceção só para ${format(month, "MMMM 'de' yyyy", { locale: ptBR })}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Vendedor</Label>
              <Select value={vendedorId || "__none__"} onValueChange={(v) => setVendedorId(v === "__none__" ? "" : v)} disabled={!!editTarget}>
                <SelectTrigger><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Selecione o vendedor</SelectItem>
                  {metas.map((m) => (
                    <SelectItem key={m.vendedor_id} value={m.vendedor_id}>{m.full_name || m.vendedor_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{editScope === "default" ? "Meta de Faturamento (padrão mensal)" : "Meta de Faturamento (só este mês)"}</Label>
              <Input type="text" inputMode="numeric" value={targetDisplay}
                onChange={(e) => setTargetDigits(e.target.value.replace(/\D/g, ""))}
                placeholder="R$ 0" className="text-xl font-bold tracking-wide" autoFocus />
            </div>
          </div>

          <div className="flex justify-between gap-2">
            {editScope === "default" && vendedorId && defaultsAt.has(vendedorId) ? (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleRemoveDefault} disabled={saving}>
                Remover padrão
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleSave} disabled={!vendedorId || targetAmountNum === 0 || saving}
                className="bg-carbo-green hover:bg-carbo-green/90 text-white">
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
