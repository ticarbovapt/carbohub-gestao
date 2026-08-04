import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Repeat, Pencil, Trash2, Ban, Search, ChevronDown, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CarboBadge } from "@/components/ui/carbo-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useRecorrencias, useExcluirParcela, useCancelarParcela,
  temNota, stageLabel, type ContratoRow, type ParcelaRow,
} from "@/hooks/useRecorrencias";

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const mes = (d: string | null) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }) : "—";

const PERIODO_LABEL: Record<string, string> = {
  mensal: "Mensal", bimestral: "Bimestral", trimestral: "Trimestral",
  semestral: "Semestral", anual: "Anual",
};

/** "CarboZé 100ml × 100" */
function resumoItens(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  const p = (i: any) => {
    const nome = i?.produto ?? i?.name ?? "item";
    const q = Number(i?.quantidade ?? i?.quantity ?? 0);
    return q > 0 ? `${nome} × ${q}` : String(nome);
  };
  return items.length === 1 ? p(items[0]) : `${p(items[0])} +${items.length - 1}`;
}

/** Onde a parcela está, em uma palavra. É a coluna que o Ops olha primeiro. */
function situacao(p: ParcelaRow): { label: string; variant: "draft" | "info" | "active" | "completed" | "cancelled" } {
  if (p.status === "cancelled") return { label: "Cancelada", variant: "cancelled" };
  if (p.status === "agendado") return { label: "Agendada", variant: "draft" };
  if (temNota(p)) return { label: `NF ${p.invoice_number ?? "emitida"}`, variant: "completed" };
  return { label: stageLabel(p.fulfillment_stage), variant: "active" };
}

function Contrato({ c }: { c: ContratoRow }) {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const excluir = useExcluirParcela();
  const cancelar = useCancelarParcela();
  const [aExcluir, setAExcluir] = useState<ParcelaRow | null>(null);
  const [aCancelar, setACancelar] = useState<ParcelaRow | null>(null);

  const restante = (c.recurrence_total ?? 0) - c.ativadas;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{c.customer_name ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {PERIODO_LABEL[c.recurrence_period ?? ""] ?? c.recurrence_period ?? "—"}
            {" · "}{c.recurrence_total} entregas
            {c.vendedor_name ? ` · ${c.vendedor_name}` : ""}
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end shrink-0">
          <span className="text-xs text-muted-foreground">por entrega</span>
          <span className="font-semibold tabular-nums">{brl(c.valor_parcela)}</span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-xs text-muted-foreground">contrato</span>
          <span className="font-bold tabular-nums">{brl(c.valor_contrato)}</span>
        </div>
        <div className="hidden md:flex flex-col items-end shrink-0 w-28">
          <span className="text-xs text-muted-foreground">andamento</span>
          <span className="text-sm tabular-nums">
            {c.faturadas} faturada{c.faturadas === 1 ? "" : "s"}
            {restante > 0 && <span className="text-muted-foreground"> · {restante} a vir</span>}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="border-t divide-y">
          {c.parcelas.map((p) => {
            const s = situacao(p);
            const travada = temNota(p);
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="text-xs font-bold uppercase tracking-wide text-violet-400 w-16 shrink-0">
                  {mes(p.scheduled_month)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums w-10 shrink-0">
                  {p.recurrence_index}/{c.recurrence_total}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{resumoItens(p.items) || "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.order_number || "—"}</p>
                </div>
                <CarboBadge variant={s.variant} size="sm" className="shrink-0">{s.label}</CarboBadge>
                <span className="tabular-nums font-medium w-24 text-right shrink-0">{brl(p.total)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Mesma porta do /vendas: a tela de venda já sabe editar.
                      Some com NF — o banco recusaria a alteração de qualquer jeito. */}
                  {!travada && p.status !== "cancelled" && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5"
                      onClick={() => navigate(`/vender?edit=${p.id}`)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  )}
                  {p.status !== "cancelled" && (
                    <Button variant="ghost" size="sm"
                      className="h-8 text-xs gap-1.5 text-amber-600 dark:text-amber-500"
                      onClick={() => setACancelar(p)}>
                      <Ban className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                  )}
                  <Button variant="ghost" size="sm"
                    className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setAExcluir(p)}>
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a parcela {aExcluir?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Some do sistema e não volta. As outras parcelas do contrato continuam.
              Se a venda existiu de verdade e só não vai acontecer,{" "}
              <strong>cancelar</strong> é melhor — ela sai do faturamento mas fica no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (aExcluir) excluir.mutate({ id: aExcluir.id }); setAExcluir(null); }}
            >
              {excluir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!aCancelar} onOpenChange={(o) => !o && setACancelar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a parcela {aCancelar?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sai do faturamento e o estoque já separado é estornado. Fica no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (aCancelar) cancelar.mutate({ id: aCancelar.id }); setACancelar(null); }}
            >
              {cancelar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancelar venda"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Recorrencias() {
  const { data: contratos = [], isLoading, error } = useRecorrencias();
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return contratos;
    return contratos.filter((c) =>
      (c.customer_name ?? "").toLowerCase().includes(q) ||
      (c.vendedor_name ?? "").toLowerCase().includes(q) ||
      c.parcelas.some((p) => (p.order_number ?? "").toLowerCase().includes(q)),
    );
  }, [contratos, busca]);

  const totalAVir = contratos.reduce(
    (s, c) => s + c.parcelas.filter((p) => p.status === "agendado").reduce((a, p) => a + p.total, 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-500/10 grid place-items-center shrink-0">
          <Repeat className="h-5 w-5 text-violet-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Vendas de Recorrência</h1>
          <p className="text-sm text-muted-foreground">
            Contratos e suas entregas. Em <strong>/vendas</strong> cada parcela aparece só no mês dela —
            aqui você vê o contrato inteiro.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Contratos ativos</p>
          <p className="text-2xl font-bold tabular-nums mt-1">{contratos.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Entregas a vir</p>
          <p className="text-2xl font-bold tabular-nums mt-1">
            {contratos.reduce((s, c) => s + c.parcelas.filter((p) => p.status === "agendado").length, 0)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Valor agendado</p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-violet-400">{brl(totalAVir)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">fora do faturamento até o mês chegar</p>
        </div>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Cliente, vendedor ou número do pedido"
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando contratos…
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive py-8 text-center">
          Não foi possível carregar: {(error as Error).message}
        </p>
      )}
      {!isLoading && !error && lista.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {busca ? "Nenhum contrato encontrado." : "Nenhuma venda de recorrência ainda."}
          </p>
          {!busca && (
            <p className="text-xs mt-1">
              Elas nascem em <strong>/vender</strong>, ligando a chave de Recorrência.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {lista.map((c) => <Contrato key={c.contrato_id} c={c} />)}
      </div>
    </div>
  );
}
