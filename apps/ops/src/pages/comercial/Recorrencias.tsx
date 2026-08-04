import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Repeat, Pencil, Trash2, Ban, ChevronLeft, ChevronRight, Loader2, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

const dia = (d: string | null) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const MES_LONGO = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

/** Uma entrega do mês: a parcela mais o contrato a que ela pertence. */
interface Entrega {
  parcela: ParcelaRow;
  contrato: ContratoRow;
  /** Quantas entregas ainda faltam neste contrato, contando esta. */
  restantes: number;
}

function situacao(p: ParcelaRow): { label: string; variant: "draft" | "active" | "completed" | "cancelled" } {
  if (p.status === "cancelled") return { label: "Cancelada", variant: "cancelled" };
  if (p.status === "agendado") return { label: "Agendada", variant: "draft" };
  if (temNota(p)) return { label: `NF ${p.invoice_number ?? "emitida"}`, variant: "completed" };
  return { label: stageLabel(p.fulfillment_stage), variant: "active" };
}

/** Vermelho quando a data já passou, âmbar na semana. */
function corPrazo(d: string | null): string {
  if (!d) return "text-muted-foreground";
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const n = Math.round((new Date(d + "T12:00:00").getTime() - hoje.getTime()) / 86400000);
  if (n < 0) return "text-destructive font-semibold";
  if (n <= 7) return "text-amber-500 font-medium";
  return "";
}

export default function Recorrencias() {
  const { data: contratos = [], isLoading, error } = useRecorrencias();
  const navigate = useNavigate();
  // O mês vive na URL (?mes=2026-09). Sobrevive ao refresh, ao voltar de uma
  // edição em /vender e permite mandar o link de um mês específico para alguém.
  const [searchParams, setSearchParams] = useSearchParams();
  const ref = useMemo(() => {
    const m = searchParams.get("mes");
    if (m && /^\d{4}-\d{2}$/.test(m)) {
      const [y, mm] = m.split("-").map(Number);
      if (mm >= 1 && mm <= 12) return new Date(y, mm - 1, 1);
    }
    const d = new Date(); d.setDate(1); return d;
  }, [searchParams]);
  const setRef = (d: Date) => {
    const p = new URLSearchParams(searchParams);
    p.set("mes", ymd(d));
    // replace: navegar meses não deve encher o histórico do navegador — o
    // "voltar" tem de sair da tela, não desfazer clique a clique no seletor.
    setSearchParams(p, { replace: true });
  };
  const excluir = useExcluirParcela();
  const cancelar = useCancelarParcela();
  const [aExcluir, setAExcluir] = useState<ParcelaRow | null>(null);
  const [aCancelar, setACancelar] = useState<ParcelaRow | null>(null);

  const mesAlvo = ymd(ref);

  /** Entregas do mês selecionado, uma linha por contrato que tem entrega nele. */
  const entregas = useMemo<Entrega[]>(() => {
    const out: Entrega[] = [];
    for (const c of contratos) {
      const doMes = c.parcelas.filter((p) => (p.scheduled_month ?? "").slice(0, 7) === mesAlvo);
      for (const p of doMes) {
        // "Restantes" = as que ainda não foram entregues, desta em diante.
        const idx = p.recurrence_index ?? 0;
        const restantes = c.parcelas.filter(
          (x) => (x.recurrence_index ?? 0) >= idx && x.status !== "cancelled",
        ).length;
        out.push({ parcela: p, contrato: c, restantes });
      }
    }
    return out.sort((a, b) =>
      (a.parcela.ppf_date ?? "9999").localeCompare(b.parcela.ppf_date ?? "9999") ||
      (a.contrato.customer_name ?? "").localeCompare(b.contrato.customer_name ?? ""),
    );
  }, [contratos, mesAlvo]);

  /** Meses que têm entrega — para o seletor não caminhar no vazio. */
  const mesesComEntrega = useMemo(() => {
    const s = new Set<string>();
    for (const c of contratos) for (const p of c.parcelas) {
      if (p.scheduled_month) s.add(p.scheduled_month.slice(0, 7));
    }
    return s;
  }, [contratos]);

  const totalMes = entregas.reduce((s, e) => s + e.parcela.total, 0);
  const move = (n: number) => setRef(new Date(ref.getFullYear(), ref.getMonth() + n, 1));

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-500/10 grid place-items-center shrink-0">
          <Repeat className="h-5 w-5 text-violet-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Vendas de Recorrência</h1>
          <p className="text-sm text-muted-foreground">
            As entregas de cada mês. Contratos mensais, trimestrais e semestrais aparecem
            só nos meses em que têm entrega.
          </p>
        </div>
      </div>

      {/* Seletor de mês */}
      <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => move(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-center">
          <p className="font-semibold capitalize leading-tight">{MES_LONGO(ref)}</p>
          <p className="text-xs text-muted-foreground">
            {entregas.length === 0
              ? "sem entregas"
              : `${entregas.length} entrega${entregas.length > 1 ? "s" : ""} · ${brl(totalMes)}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => move(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline" size="sm" className="h-9 shrink-0"
          onClick={() => { const d = new Date(); d.setDate(1); setRef(d); }}
        >
          Hoje
        </Button>
      </div>

      {/* Trilha dos próximos meses — mostra onde há entrega sem precisar navegar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {Array.from({ length: 12 }, (_, i) => {
          const d = new Date(new Date().getFullYear(), new Date().getMonth() + i, 1);
          const k = ymd(d);
          const tem = mesesComEntrega.has(k);
          const ativo = k === mesAlvo;
          return (
            <button
              key={k}
              onClick={() => setRef(d)}
              className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                ativo ? "border-violet-500 bg-violet-500/10 text-violet-300"
                : tem ? "hover:bg-muted/50" : "opacity-40 hover:opacity-70"
              }`}
            >
              {d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })}
              {tem && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-400 align-middle" />}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive py-10 text-center">
          Não foi possível carregar: {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left  font-medium px-4 py-2.5">Empresa</th>
                  <th className="text-center font-medium px-3 py-2.5">Entregas restantes</th>
                  <th className="text-center font-medium px-3 py-2.5">Produzir até</th>
                  <th className="text-center font-medium px-3 py-2.5">Enviar até</th>
                  <th className="text-left  font-medium px-3 py-2.5">Situação</th>
                  <th className="text-right font-medium px-3 py-2.5">Valor</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {entregas.map(({ parcela: p, contrato: c, restantes }) => {
                  const s = situacao(p);
                  const travada = temNota(p);
                  return (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium leading-tight">{c.customer_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {p.order_number || "—"} · {p.recurrence_index}/{c.recurrence_total}
                          {c.recurrence_period ? ` · ${c.recurrence_period}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums font-semibold">{restantes}</td>
                      <td className={`px-3 py-3 text-center tabular-nums ${corPrazo(p.ppf_date)}`}>
                        {dia(p.ppf_date)}
                      </td>
                      <td className={`px-3 py-3 text-center tabular-nums ${corPrazo(p.ppe_date)}`}>
                        {dia(p.ppe_date)}
                      </td>
                      <td className="px-3 py-3">
                        <CarboBadge variant={s.variant} size="sm">{s.label}</CarboBadge>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium">{brl(p.total)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!travada && p.status !== "cancelled" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar"
                              onClick={() => navigate(`/vender?edit=${p.id}`)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {p.status !== "cancelled" && (
                            <Button variant="ghost" size="icon"
                              className="h-8 w-8 text-amber-600 dark:text-amber-500" title="Cancelar"
                              onClick={() => setACancelar(p)}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir"
                            onClick={() => setAExcluir(p)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {entregas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      <CalendarDays className="h-7 w-7 mx-auto mb-2.5 opacity-40" />
                      <p className="text-sm">Nenhuma entrega em {MES_LONGO(ref)}.</p>
                      <p className="text-xs mt-1">
                        Os meses com bolinha na trilha acima têm entrega.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a entrega {aExcluir?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Some do sistema e não volta. As outras entregas do contrato continuam.
              Se a venda existiu e só não vai acontecer, <strong>cancelar</strong> é melhor —
              sai do faturamento mas fica no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (aExcluir) excluir.mutate({ id: aExcluir.id }); setAExcluir(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!aCancelar} onOpenChange={(o) => !o && setACancelar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a entrega {aCancelar?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sai do faturamento e o estoque já separado é estornado. Fica no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (aCancelar) cancelar.mutate({ id: aCancelar.id }); setACancelar(null); }}
            >
              Cancelar venda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
