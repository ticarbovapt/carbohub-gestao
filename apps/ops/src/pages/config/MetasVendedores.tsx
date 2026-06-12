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
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Target, Settings } from "lucide-react";
import { useMetasVendedores, useUpsertMeta, type MetaVendedor } from "@/hooks/useMetas";

// ─────────────────────────────────────────────────────────────────────────────
// Configurar Metas (Carbo Ops) — réplica 1:1 da tela do Carbo Controle
// (/dashboards/metas/config). O Save persiste a meta do mês em crm_vendedor_metas
// (o que alimenta o Carbo Sales). O MOTOR de "meta padrão (vale todo mês) vs
// exceção do mês" é a lógica que entra na próxima fase — por ora, ambos os botões
// gravam a meta do mês selecionado.
// ─────────────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

type Tab = "vendedores" | "ecommerce";
type Scope = "default" | "month";

export default function MetasVendedoresConfig() {
  const [tab, setTab]     = useState<Tab>("vendedores");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const weekStart = useMemo(() => new Date(), []); // semana não importa aqui

  const { data: metas = [], isLoading } = useMetasVendedores(month, weekStart);
  const upsert = useUpsertMeta();

  // Estado do dialog
  const [dialogOpen, setDialog] = useState(false);
  const [editTarget, setEdit]   = useState<MetaVendedor | null>(null);
  const [editScope, setEditScope] = useState<Scope>("default");
  const [vendedorId, setVendedorId]     = useState("");
  const [targetDigits, setTargetDigits] = useState("");

  const today = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  // Nova meta padrão (vendedor em branco)
  const openNew = () => { setEdit(null); setEditScope("default"); setVendedorId(""); setTargetDigits(""); setDialog(true); };
  const openEditDefault = (m: MetaVendedor) => { setEdit(m); setEditScope("default"); setVendedorId(m.vendedor_id); setTargetDigits(String(Math.round(Number(m.target_amount || 0)))); setDialog(true); };
  const openEditMonth   = (m: MetaVendedor) => { setEdit(m); setEditScope("month");   setVendedorId(m.vendedor_id); setTargetDigits(String(Math.round(Number(m.target_amount || 0)))); setDialog(true); };
  const handleClose = () => { setDialog(false); setEdit(null); };

  const targetAmountNum = parseInt(targetDigits.replace(/\D/g, "") || "0", 10);
  const targetDisplay   = targetAmountNum > 0
    ? targetAmountNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : "";

  const handleSave = async () => {
    if (!vendedorId) return;
    const ano = month.getFullYear(); const mes = month.getMonth() + 1;
    const existing = metas.find((m) => m.vendedor_id === vendedorId);
    try {
      await upsert.mutateAsync({
        vendedor_id: vendedorId, ano, mes,
        target_amount: targetAmountNum,
        target_qty: existing?.target_qty ?? 0,
      });
      toast.success("Meta salva");
      handleClose();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e instanceof Error ? e.message : "tente de novo"));
    }
  };

  // "Voltar ao padrão" → por ora zera a meta do mês (a exceção real entra na lógica)
  const handleClearMonth = async (m: MetaVendedor) => {
    const ano = month.getFullYear(); const mes = month.getMonth() + 1;
    try {
      await upsert.mutateAsync({ vendedor_id: m.vendedor_id, ano, mes, target_amount: 0, target_qty: m.target_qty ?? 0 });
      toast.success("Meta do mês removida");
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : "tente de novo"));
    }
  };

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
              <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold w-32 text-center capitalize">{format(month, "MMM 'de' yyyy", { locale: ptBR })}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))} disabled={isCurrentMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button size="sm" className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white" onClick={openNew}>
                <Plus className="h-4 w-4" /> Meta padrão
              </Button>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs text-muted-foreground">
              A <strong className="text-foreground">meta padrão</strong> vale para todos os meses automaticamente.
              Se um mês for diferente, clique em <strong className="text-foreground">"Meta deste mês"</strong> para criar uma exceção — ela vence só naquele mês.
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
                  .map((m) => {
                    const hasMeta = Number(m.target_amount) > 0;
                    return (
                      <CarboCard key={m.vendedor_id}>
                        <CarboCardContent className="p-3 flex items-center gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate">{m.full_name || "—"}</p>
                              {hasMeta ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-carbo-green/15 text-carbo-green">Meta padrão</span>
                              ) : (
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
                            {hasMeta && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1" onClick={() => handleClearMonth(m)}>
                                <Trash2 className="h-3 w-3" /> Voltar ao padrão
                              </Button>
                            )}
                          </div>
                        </CarboCardContent>
                      </CarboCard>
                    );
                  })}
              </div>
            )}
          </>
        )}

        {/* ── Tab: E-commerce ─────────────────────────────────────────────── */}
        {tab === "ecommerce" && (
          <CarboCard>
            <CarboCardContent className="py-12 text-center space-y-3">
              <Target className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground">Metas de e-commerce entram na próxima fase.</p>
            </CarboCardContent>
          </CarboCard>
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
                ? "Vale para todos os meses, até ser alterada."
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

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!vendedorId || targetAmountNum === 0 || upsert.isPending}
              className="bg-carbo-green hover:bg-carbo-green/90 text-white">
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
