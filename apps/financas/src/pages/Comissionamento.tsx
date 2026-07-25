import { useMemo, useState, useEffect } from "react";
import { Percent, DollarSign, Wallet, Receipt, CheckCircle2 } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CarboInput } from "@/components/ui/carbo-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { AlertCircle } from "lucide-react";
import {
  useComissaoAgregado, useComissaoDescarb, useCommissionStatements, useCreateStatement, useAddPayment,
  useCommissionRules, useUpsertCommissionRule, useStatementItems,
  type CommissionStatement,
} from "@/hooks/useComissao";

const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => { const d = (s || "").slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s; };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };
const monthEnd = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  pago:    { label: "Pago",    variant: "success" },
  parcial: { label: "Parcial", variant: "warning" },
  aberto:  { label: "Aberto",  variant: "secondary" },
};

// ── Dialog: regras de % (padrão + por vendedor) ──────────────────────────────
function RegrasDialog({ open, onClose, vendedores, defaultRate, defaultRateDesc, rateFor, rateDescFor }: {
  open: boolean; onClose: () => void; vendedores: { id: string; name: string }[];
  defaultRate: number; defaultRateDesc: number;
  rateFor: (id: string) => number; rateDescFor: (id: string) => number;
}) {
  const upsert = useUpsertCommissionRule();
  const [padrao, setPadrao] = useState(defaultRate);
  const [padraoDesc, setPadraoDesc] = useState(defaultRateDesc);
  const [porVend, setPorVend] = useState<Record<string, number>>({});
  const [porVendDesc, setPorVendDesc] = useState<Record<string, number>>({});
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setPadrao(defaultRate); setPadraoDesc(defaultRateDesc);
    setPorVend(Object.fromEntries(vendedores.map((v) => [v.id, rateFor(v.id)])));
    setPorVendDesc(Object.fromEntries(vendedores.map((v) => [v.id, rateDescFor(v.id)])));
  }
  if (!open && lastOpen) setLastOpen(false);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regras de comissão (%)</DialogTitle>
          <DialogDescription>
            Produto e descarbonização comissionam diferente — cada um tem o seu percentual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Cabeçalho das colunas */}
          <div className="grid grid-cols-[1fr_110px_110px_auto] gap-3 items-end border-b border-border pb-3">
            <Label className="text-xs text-muted-foreground">Padrão (sem regra própria)</Label>
            <span className="text-[11px] font-medium text-muted-foreground text-center">Produto (NF)</span>
            <span className="text-[11px] font-medium text-muted-foreground text-center">Descarb.</span>
            <span />
          </div>

          <div className="grid grid-cols-[1fr_110px_110px_auto] gap-3 items-center border-b border-border pb-3">
            <Label>% padrão</Label>
            <DecimalInput value={padrao} onValueChange={setPadrao} min={0} max={100} />
            <DecimalInput value={padraoDesc} onValueChange={setPadraoDesc} min={0} max={100} />
            <CarboButton size="sm" disabled={upsert.isPending}
              onClick={() => upsert.mutate({ vendedor_id: null, rate_pct: padrao, rate_descarb_pct: padraoDesc })}>
              Salvar
            </CarboButton>
          </div>

          <p className="text-xs text-muted-foreground">Regra por vendedor (sobrepõe o padrão):</p>
          {vendedores.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem vendedores no período.</p>
          ) : vendedores.map((v) => (
            <div key={v.id} className="grid grid-cols-[1fr_110px_110px_auto] gap-3 items-center">
              <Label className="truncate">{v.name}</Label>
              <DecimalInput value={porVend[v.id] ?? 0} min={0} max={100}
                onValueChange={(val) => setPorVend((p) => ({ ...p, [v.id]: val }))} />
              <DecimalInput value={porVendDesc[v.id] ?? 0} min={0} max={100}
                onValueChange={(val) => setPorVendDesc((p) => ({ ...p, [v.id]: val }))} />
              <CarboButton size="sm" variant="outline" disabled={upsert.isPending}
                onClick={() => upsert.mutate({
                  vendedor_id: v.id, vendedor_name: v.name,
                  rate_pct: porVend[v.id] ?? 0, rate_descarb_pct: porVendDesc[v.id] ?? 0,
                })}>
                Salvar
              </CarboButton>
            </div>
          ))}
        </div>
        <DialogFooter><CarboButton variant="outline" onClick={onClose}>Fechar</CarboButton></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Aba: calcular e gerar comissões ──────────────────────────────────────────
function CalcularTab() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [vendFilter, setVendFilter] = useState("__all__");
  const [pcts, setPcts] = useState<Record<string, number>>({});        // produto (com NF)
  const [pctsDesc, setPctsDesc] = useState<Record<string, number>>({}); // descarbonização
  const [showRegras, setShowRegras] = useState(false);

  const { data: agg = [], isLoading } = useComissaoAgregado(from, to);
  const { data: descarb = [], isLoading: loadingDescarb } = useComissaoDescarb(from, to);
  const { data: regras = [] } = useCommissionRules();
  const create = useCreateStatement();

  // Resolve o % de cada vendedor: regra específica > regra padrão > 0.
  const defaultRate = regras.find((r) => r.vendedor_id === null)?.rate_pct ?? 0;
  const rateFor = (vid: string) => regras.find((r) => r.vendedor_id === vid)?.rate_pct ?? defaultRate;
  // Descarbonização tem percentual PRÓPRIO — comissiona diferente do produto.
  const defaultRateDesc = regras.find((r) => r.vendedor_id === null)?.rate_descarb_pct ?? 0;
  const rateDescFor = (vid: string) =>
    regras.find((r) => r.vendedor_id === vid)?.rate_descarb_pct ?? defaultRateDesc;

  // Une produto (com NF) + descarbonização (sem NF) por vendedor. Ambos entram
  // na base de comissão; a descarbonização aparece em coluna própria.
  const merged = useMemo(() => {
    const map = new Map<string, { vendedor_id: string; vendedor_name: string | null; prod: number; prodQtd: number; descarb: number; descarbQtd: number }>();
    const ensure = (id: string, name: string | null) => {
      let e = map.get(id);
      if (!e) { e = { vendedor_id: id, vendedor_name: name, prod: 0, prodQtd: 0, descarb: 0, descarbQtd: 0 }; map.set(id, e); }
      if (!e.vendedor_name && name) e.vendedor_name = name;
      return e;
    };
    for (const a of agg) { const e = ensure(a.vendedor_id, a.vendedor_name); e.prod += a.total; e.prodQtd += a.qtd; }
    for (const d of descarb) { const e = ensure(d.vendedor_id, d.vendedor_name); e.descarb += d.total; e.descarbQtd += d.qtd; }
    return Array.from(map.values()).sort((x, y) => (y.prod + y.descarb) - (x.prod + x.descarb));
  }, [agg, descarb]);

  // Pré-preenche o % a partir das regras (sem sobrescrever o que já foi digitado).
  useEffect(() => {
    setPcts((prev) => {
      const next = { ...prev };
      for (const a of merged) if (next[a.vendedor_id] == null) next[a.vendedor_id] = rateFor(a.vendedor_id);
      return next;
    });
    setPctsDesc((prev) => {
      const next = { ...prev };
      for (const a of merged) if (next[a.vendedor_id] == null) next[a.vendedor_id] = rateDescFor(a.vendedor_id);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, regras]);

  const vendedores = useMemo(() => merged.map((a) => ({ id: a.vendedor_id, name: a.vendedor_name || "—" })), [merged]);
  const rows = vendFilter === "__all__" ? merged : merged.filter((a) => a.vendedor_id === vendFilter);
  const totalBase = rows.reduce((s, r) => s + r.prod + r.descarb, 0);
  const totalDescarb = rows.reduce((s, r) => s + r.descarb, 0);

  return (
    <div className="space-y-4">
      <CarboCard>
        <CarboCardContent className="pt-6 flex flex-col md:flex-row md:items-end gap-4">
          <div className="space-y-1.5">
            <Label>De</Label>
            <DatePickerInput value={from} onChange={setFrom} />
          </div>
          <div className="space-y-1.5">
            <Label>Até</Label>
            <DatePickerInput value={to} onChange={setTo} />
          </div>
          <div className="space-y-1.5 min-w-56">
            <Label>Vendedor</Label>
            <Select value={vendFilter} onValueChange={setVendFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os vendedores</SelectItem>
                {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Base total: <strong className="text-foreground">{brl(totalBase)}</strong>
              {totalDescarb > 0 && <span className="text-muted-foreground"> · descarb. {brl(totalDescarb)}</span>}
            </span>
            <CarboButton size="sm" variant="outline" onClick={() => setShowRegras(true)}>Regras de %</CarboButton>
          </div>
        </CarboCardContent>
      </CarboCard>
      <RegrasDialog open={showRegras} onClose={() => setShowRegras(false)} vendedores={vendedores}
        defaultRate={defaultRate} defaultRateDesc={defaultRateDesc}
        rateFor={rateFor} rateDescFor={rateDescFor} />

      <CarboCard>
        <CarboCardContent className="pt-6">
          <p className="text-xs text-muted-foreground mb-3">
            Duas bases, <strong>dois percentuais</strong>: produto entra quando a <strong>NF é emitida</strong>;
            descarbonização entra <strong>já no momento da venda</strong> (não gera NF) e comissiona com o seu próprio %.
            Digite os percentuais e clique em <strong>Gerar comissão</strong> — ela vai pra aba Pagamentos.
          </p>
          {isLoading || loadingDescarb ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <CarboSkeleton key={i} className="h-12 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <CarboEmptyState icon={DollarSign} title="Sem vendas no período" description="Nenhum vendedor com venda faturada (com NF) ou descarbonização neste período." />
          ) : (
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Vendedor</CarboTableHead>
                  <CarboTableHead className="text-right">Vendas faturadas</CarboTableHead>
                  <CarboTableHead className="text-right">Descarbonização<span className="text-[10px] font-normal text-muted-foreground"> (sem NF)</span></CarboTableHead>
                  <CarboTableHead className="w-24 text-center">% NF</CarboTableHead>
                  <CarboTableHead className="w-24 text-center">% descarb.</CarboTableHead>
                  <CarboTableHead className="text-right">Comissão</CarboTableHead>
                  <CarboTableHead className="text-right">Ação</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {rows.map((r) => {
                  const pct = pcts[r.vendedor_id] ?? 0;
                  const pctD = pctsDesc[r.vendedor_id] ?? 0;
                  const qtd = r.prodQtd + r.descarbQtd;
                  // Cada base com o seu percentual.
                  const cent = (n: number) => Math.round(n * 100) / 100;
                  const comProd = cent(r.prod * (pct / 100));
                  const comDesc = cent(r.descarb * (pctD / 100));
                  const comissao = cent(comProd + comDesc);
                  return (
                    <CarboTableRow key={r.vendedor_id}>
                      <CarboTableCell className="font-medium">{r.vendedor_name || "—"}</CarboTableCell>
                      <CarboTableCell className="text-right">
                        {brl(r.prod)}
                        <span className="block text-[11px] text-muted-foreground">{r.prodQtd} NF(s)</span>
                      </CarboTableCell>
                      <CarboTableCell className="text-right">
                        {r.descarb > 0 ? (
                          <>
                            <span className="text-carbo-green font-medium">{brl(r.descarb)}</span>
                            <span className="block text-[11px] text-muted-foreground">{r.descarbQtd} serviço(s)</span>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </CarboTableCell>
                      <CarboTableCell>
                        <DecimalInput value={pct} onValueChange={(v) => setPcts((p) => ({ ...p, [r.vendedor_id]: v }))}
                          min={0} max={100} className="h-9" placeholder="0" />
                      </CarboTableCell>
                      <CarboTableCell>
                        <DecimalInput value={pctD} onValueChange={(v) => setPctsDesc((p) => ({ ...p, [r.vendedor_id]: v }))}
                          min={0} max={100} className="h-9" placeholder="0"
                          disabled={r.descarb <= 0} />
                      </CarboTableCell>
                      <CarboTableCell className="text-right">
                        <span className="font-semibold text-carbo-green">{brl(comissao)}</span>
                        {r.descarb > 0 && (comProd > 0 || comDesc > 0) && (
                          <span className="block text-[11px] text-muted-foreground">
                            {brl(comProd)} + {brl(comDesc)}
                          </span>
                        )}
                      </CarboTableCell>
                      <CarboTableCell className="text-right">
                        <CarboButton
                          size="sm"
                          disabled={comissao <= 0 || create.isPending}
                          onClick={() => create.mutate({
                            vendedor_id: r.vendedor_id, vendedor_name: r.vendedor_name,
                            period_start: from, period_end: to,
                            base_produto: r.prod, base_descarb: r.descarb,
                            sales_count: qtd, rate_pct: pct, rate_descarb_pct: pctD,
                          })}
                        >
                          Gerar comissão
                        </CarboButton>
                      </CarboTableCell>
                    </CarboTableRow>
                  );
                })}
              </CarboTableBody>
            </CarboTable>
          )}
        </CarboCardContent>
      </CarboCard>
    </div>
  );
}

// ── Diálogo de pagamento ─────────────────────────────────────────────────────
function PayDialog({ st, onClose }: { st: CommissionStatement | null; onClose: () => void }) {
  const add = useAddPayment();
  const saldo = st ? Math.max(0, Number(st.amount_due) - Number(st.amount_paid)) : 0;
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  // Reinicia o valor sugerido quando abre outro fechamento
  const [lastId, setLastId] = useState<string | null>(null);
  if (st && st.id !== lastId) { setLastId(st.id); setAmount(saldo); setMethod(""); setNotes(""); }

  if (!st) return null;
  const submit = () => add.mutate({ statement_id: st.id, amount, method, notes }, { onSuccess: onClose });

  return (
    <Dialog open={!!st} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pagamento — {st.vendedor_name || "Vendedor"}</DialogTitle>
          <DialogDescription>
            Devido {brl(st.amount_due)} · Pago {brl(st.amount_paid)} · <strong className="text-foreground">Saldo {brl(saldo)}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Valor pago agora</Label>
            <DecimalInput value={amount} onValueChange={setAmount} min={0} placeholder="0,00" />
            <div className="flex gap-2">
              <button className="text-xs text-carbo-green hover:underline" onClick={() => setAmount(saldo)}>Pagar saldo total ({brl(saldo)})</button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Forma de pagamento (opcional)</Label>
            <CarboInput value={method} onChange={(e) => setMethod(e.target.value)} placeholder="PIX, transferência…" />
          </div>
          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <CarboInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anotação" />
          </div>
        </div>
        <DialogFooter>
          <CarboButton variant="outline" onClick={onClose}>Cancelar</CarboButton>
          <CarboButton onClick={submit} disabled={amount <= 0 || amount > saldo + 0.01 || add.isPending}>{add.isPending ? "Registrando…" : "Registrar pagamento"}</CarboButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Aba: pagamentos das comissões geradas ────────────────────────────────────
function PagamentosTab() {
  const { data: statements = [], isLoading } = useCommissionStatements();
  const [paying, setPaying] = useState<CommissionStatement | null>(null);
  const [memoria, setMemoria] = useState<CommissionStatement | null>(null);

  const totalDevido = statements.reduce((s, x) => s + Number(x.amount_due), 0);
  const totalPago = statements.reduce((s, x) => s + Number(x.amount_paid), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <CarboKPI title="Comissões geradas" value={statements.length} icon={Receipt} iconColor="blue" />
        <CarboKPI title="Total devido" value={brl(totalDevido)} icon={DollarSign} iconColor="warning" />
        <CarboKPI title="Total pago" value={brl(totalPago)} icon={CheckCircle2} iconColor="green" />
      </div>

      <CarboCard>
        <CarboCardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <CarboSkeleton key={i} className="h-12 w-full" />)}</div>
          ) : statements.length === 0 ? (
            <CarboEmptyState icon={Wallet} title="Nenhuma comissão gerada" description="Gere comissões na aba Calcular." />
          ) : (
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Vendedor</CarboTableHead>
                  <CarboTableHead>Período</CarboTableHead>
                  <CarboTableHead className="text-right">Base</CarboTableHead>
                  <CarboTableHead className="text-center">%</CarboTableHead>
                  <CarboTableHead className="text-right">Devido</CarboTableHead>
                  <CarboTableHead className="text-right">Pago</CarboTableHead>
                  <CarboTableHead className="text-right">Saldo</CarboTableHead>
                  <CarboTableHead>Status</CarboTableHead>
                  <CarboTableHead className="text-right">Ação</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {statements.map((s) => {
                  const saldo = Math.max(0, Number(s.amount_due) - Number(s.amount_paid));
                  const st = STATUS[s.status] ?? STATUS.aberto;
                  return (
                    <CarboTableRow key={s.id}>
                      <CarboTableCell className="font-medium">{s.vendedor_name || "—"}</CarboTableCell>
                      <CarboTableCell className="whitespace-nowrap">{fmtDate(s.period_start)} – {fmtDate(s.period_end)}</CarboTableCell>
                      <CarboTableCell className="text-right">
                        {brl(s.base_sales)}
                        {Number(s.base_descarb) > 0 && (
                          <span className="block text-[11px] text-muted-foreground">
                            NF {brl(s.base_produto)} · descarb. {brl(s.base_descarb)}
                          </span>
                        )}
                      </CarboTableCell>
                      <CarboTableCell className="text-center">
                        {Number(s.rate_pct)}%
                        {Number(s.base_descarb) > 0 && (
                          <span className="block text-[11px] text-muted-foreground">
                            {Number(s.rate_descarb_pct)}% descarb.
                          </span>
                        )}
                      </CarboTableCell>
                      <CarboTableCell className="text-right font-medium">{brl(s.amount_due)}</CarboTableCell>
                      <CarboTableCell className="text-right">{brl(s.amount_paid)}</CarboTableCell>
                      <CarboTableCell className="text-right font-medium">{brl(saldo)}</CarboTableCell>
                      <CarboTableCell><CarboBadge variant={st.variant}>{st.label}</CarboBadge></CarboTableCell>
                      <CarboTableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <CarboButton size="sm" variant="ghost" onClick={() => setMemoria(s)}>Memória</CarboButton>
                          <CarboButton size="sm" variant={s.status === "pago" ? "outline" : "default"} disabled={s.status === "pago"} onClick={() => setPaying(s)}>
                            {s.status === "pago" ? "Quitado" : "Registrar pagamento"}
                          </CarboButton>
                        </div>
                      </CarboTableCell>
                    </CarboTableRow>
                  );
                })}
              </CarboTableBody>
            </CarboTable>
          )}
        </CarboCardContent>
      </CarboCard>

      <PayDialog st={paying} onClose={() => setPaying(null)} />
      <MemoriaDialog st={memoria} onClose={() => setMemoria(null)} />
    </div>
  );
}

// ── Dialog: memória de cálculo (NFs que compõem o fechamento) ─────────────────
function MemoriaDialog({ st, onClose }: { st: CommissionStatement | null; onClose: () => void }) {
  const { data: items = [], isLoading } = useStatementItems(st?.id ?? null);
  if (!st) return null;
  const soma = items.reduce((s, i) => s + Number(i.total), 0);
  return (
    <Dialog open={!!st} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Memória de cálculo — {st.vendedor_name || "Vendedor"}</DialogTitle>
          <DialogDescription>
            {fmtDate(st.period_start)} – {fmtDate(st.period_end)} · Total {brl(st.amount_due)}
          </DialogDescription>
        </DialogHeader>

        {/* Composição: cada base com o seu percentual */}
        <div className="rounded-lg border divide-y text-sm">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-muted-foreground">
              Faturado (com NF) · {Number(st.rate_pct)}%
            </span>
            <span className="tabular-nums">
              {brl(st.base_produto)} → <strong>{brl(st.amount_produto)}</strong>
            </span>
          </div>
          {Number(st.base_descarb) > 0 && (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-muted-foreground">
                Descarbonização (sem NF) · {Number(st.rate_descarb_pct)}%
              </span>
              <span className="tabular-nums">
                {brl(st.base_descarb)} → <strong>{brl(st.amount_descarb)}</strong>
              </span>
            </div>
          )}
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground py-4">Carregando…</p>
          : items.length === 0 ? <p className="text-sm text-muted-foreground py-4">Sem itens registrados (fechamento anterior à memória de cálculo).</p>
          : (
            <div className="space-y-1.5 py-1">
              {items.map((i) => (
                <div key={i.id} className="flex items-center justify-between text-sm border-b border-border pb-1.5">
                  <div className="min-w-0">
                    <p className="font-mono truncate">{i.order_number || "—"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{i.customer_name || "—"}{i.sale_date ? ` · ${fmtDate(i.sale_date)}` : ""}</p>
                  </div>
                  <span className="font-medium shrink-0">{brl(Number(i.total))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 text-sm font-semibold">
                <span>{items.length} NF(s)</span><span>{brl(soma)}</span>
              </div>
              {Number(st.base_descarb) > 0 && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  A lista acima cobre só a parte faturada. A descarbonização não gera NF —
                  o valor dela está na composição no topo.
                </p>
              )}
            </div>
          )}
        <DialogFooter><CarboButton variant="outline" onClick={onClose}>Fechar</CarboButton></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Comissionamento() {
  const { gestor } = useAuth();
  if (!gestor) {
    return (
      <div className="space-y-6">
        <CarboPageHeader title="Comissionamento" description="Calcule a comissão sobre as vendas faturadas do período e controle os pagamentos." icon={Percent} />
        <CarboCard><CarboCardContent>
          <CarboEmptyState icon={AlertCircle} title="Acesso restrito"
            description="Só gestores podem gerar e pagar comissões. Fale com um gestor se precisar." />
        </CarboCardContent></CarboCard>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <CarboPageHeader title="Comissionamento" description="Calcule a comissão sobre as vendas faturadas do período e controle os pagamentos." icon={Percent} />
      <Tabs defaultValue="calcular">
        <TabsList>
          <TabsTrigger value="calcular" className="gap-2"><Percent className="h-4 w-4" /> Calcular</TabsTrigger>
          <TabsTrigger value="pagamentos" className="gap-2"><Wallet className="h-4 w-4" /> Pagamentos</TabsTrigger>
        </TabsList>
        <TabsContent value="calcular" className="mt-4"><CalcularTab /></TabsContent>
        <TabsContent value="pagamentos" className="mt-4"><PagamentosTab /></TabsContent>
      </Tabs>
    </div>
  );
}
