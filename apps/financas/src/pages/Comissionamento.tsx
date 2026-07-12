import { useMemo, useState } from "react";
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
import {
  useComissaoAgregado, useCommissionStatements, useCreateStatement, useAddPayment,
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

// ── Aba: calcular e gerar comissões ──────────────────────────────────────────
function CalcularTab() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [vendFilter, setVendFilter] = useState("__all__");
  const [pcts, setPcts] = useState<Record<string, number>>({});

  const { data: agg = [], isLoading } = useComissaoAgregado(from, to);
  const create = useCreateStatement();

  const vendedores = useMemo(() => agg.map((a) => ({ id: a.vendedor_id, name: a.vendedor_name || "—" })), [agg]);
  const rows = vendFilter === "__all__" ? agg : agg.filter((a) => a.vendedor_id === vendFilter);
  const totalBase = rows.reduce((s, r) => s + r.total, 0);

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
          <div className="md:ml-auto text-sm text-muted-foreground">
            Base faturada no período: <strong className="text-foreground">{brl(totalBase)}</strong>
          </div>
        </CarboCardContent>
      </CarboCard>

      <CarboCard>
        <CarboCardContent className="pt-6">
          <p className="text-xs text-muted-foreground mb-3">
            Base = vendas <strong>faturadas (com NF)</strong> do vendedor no período. Digite o % e clique em <strong>Gerar comissão</strong> — ela vai pra aba Pagamentos.
          </p>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <CarboSkeleton key={i} className="h-12 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <CarboEmptyState icon={DollarSign} title="Sem vendas faturadas" description="Nenhum vendedor com venda faturada (com NF) neste período." />
          ) : (
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Vendedor</CarboTableHead>
                  <CarboTableHead className="text-right">Vendas faturadas</CarboTableHead>
                  <CarboTableHead className="text-center">Qtd</CarboTableHead>
                  <CarboTableHead className="w-28">%</CarboTableHead>
                  <CarboTableHead className="text-right">Comissão</CarboTableHead>
                  <CarboTableHead className="text-right">Ação</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {rows.map((r) => {
                  const pct = pcts[r.vendedor_id] ?? 0;
                  const comissao = Math.round(r.total * (pct / 100) * 100) / 100;
                  return (
                    <CarboTableRow key={r.vendedor_id}>
                      <CarboTableCell className="font-medium">{r.vendedor_name || "—"}</CarboTableCell>
                      <CarboTableCell className="text-right font-medium">{brl(r.total)}</CarboTableCell>
                      <CarboTableCell className="text-center">{r.qtd}</CarboTableCell>
                      <CarboTableCell>
                        <div className="flex items-center gap-1">
                          <DecimalInput value={pct} onValueChange={(v) => setPcts((p) => ({ ...p, [r.vendedor_id]: v }))} min={0} max={100} className="h-9" placeholder="0" />
                          <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </CarboTableCell>
                      <CarboTableCell className="text-right font-semibold text-carbo-green">{brl(comissao)}</CarboTableCell>
                      <CarboTableCell className="text-right">
                        <CarboButton
                          size="sm"
                          disabled={pct <= 0 || create.isPending}
                          onClick={() => create.mutate({
                            vendedor_id: r.vendedor_id, vendedor_name: r.vendedor_name,
                            period_start: from, period_end: to,
                            base_sales: r.total, sales_count: r.qtd, rate_pct: pct,
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
          <CarboButton onClick={submit} disabled={amount <= 0 || add.isPending}>{add.isPending ? "Registrando…" : "Registrar pagamento"}</CarboButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Aba: pagamentos das comissões geradas ────────────────────────────────────
function PagamentosTab() {
  const { data: statements = [], isLoading } = useCommissionStatements();
  const [paying, setPaying] = useState<CommissionStatement | null>(null);

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
                      <CarboTableCell className="text-right">{brl(s.base_sales)}</CarboTableCell>
                      <CarboTableCell className="text-center">{Number(s.rate_pct)}%</CarboTableCell>
                      <CarboTableCell className="text-right font-medium">{brl(s.amount_due)}</CarboTableCell>
                      <CarboTableCell className="text-right">{brl(s.amount_paid)}</CarboTableCell>
                      <CarboTableCell className="text-right font-medium">{brl(saldo)}</CarboTableCell>
                      <CarboTableCell><CarboBadge variant={st.variant}>{st.label}</CarboBadge></CarboTableCell>
                      <CarboTableCell className="text-right">
                        <CarboButton size="sm" variant={s.status === "pago" ? "outline" : "default"} disabled={s.status === "pago"} onClick={() => setPaying(s)}>
                          {s.status === "pago" ? "Quitado" : "Registrar pagamento"}
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

      <PayDialog st={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

export default function Comissionamento() {
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
