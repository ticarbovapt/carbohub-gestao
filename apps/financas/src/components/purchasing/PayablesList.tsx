import { useEffect, useState } from "react";
import { useParamUrl, confirmar } from "@carbo/shell";
import { usePersistedState } from "@/hooks/usePersistedState";
import { CreditCard, CheckCircle2, Undo2, Ban, ChevronLeft, ChevronRight, Search, X, CalendarRange } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { usePurchasePayablesOpen, usePurchasePayablesPaged, useUpdatePayableStatus, type FiltroPagar } from "@/hooks/usePurchasing";
import { useAuth } from "@/contexts/AuthContext";
import { PAYABLE_STATUS_LABELS, type PayableStatus, type PurchasePayable } from "@/types/purchasing";
import { hojeISO, mesAtualISO, limitesDoMes, dataBR, diasAte, estaVencido, emAberto } from "@/lib/datas";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";

// ─────────────────────────────────────────────────────────────────────────────
// Contas a pagar — hoje 100% espelho do Bling 1 (zero títulos internos, medido).
//
// ⚠️ "Vencido" é a regra ÚNICA do `estaVencido` (em aberto e vencimento antes
// de hoje em Brasília). O status gravado NÃO decide: o Bling só marca
// `atrasado` em parte dos títulos. Lista, cartões, badge e KPIs usam a mesma.
//
// ⚠️ Os filtros moram na URL (F5, link e Voltar). O padrão — endereço limpo —
// é a FILA DE TRABALHO: vencidos + vence hoje + próximos 7 dias, sem recorte
// de mês. Mês e De/Até são filtros opcionais e excludentes: escolher um limpa
// o outro, senão haveria dois lugares dizendo qual é o período.
//
// ⚠️ Cada cartão do topo é um ATALHO que aplica exatamente o filtro que
// reproduz o número dele (status + origem, sem período nem busca).
// ─────────────────────────────────────────────────────────────────────────────

const statusVariantMap: Record<PayableStatus, any> = {
  programado: "info",
  pago: "success",
  atrasado: "destructive",
  cancelado: "cancelled",
};

const FILTROS: { valor: FiltroPagar; rotulo: string }[] = [
  { valor: "fila", rotulo: "Fila (vencidos + 7 dias)" },
  { valor: "vencido", rotulo: "Vencidos" },
  { valor: "hoje", rotulo: "Vencem hoje" },
  { valor: "7dias", rotulo: "Próximos 7 dias" },
  { valor: "a_vencer", rotulo: "A vencer (hoje em diante)" },
  { valor: "aberto", rotulo: "Em aberto (todos)" },
  { valor: "pago", rotulo: "Pagos" },
  { valor: "cancelado", rotulo: "Cancelados" },
  { valor: "all", rotulo: "Todos os status" },
];

// Nomes antigos (links e favoritos de antes) continuam valendo.
const normalizarFiltro = (v: string): FiltroPagar => {
  if (v === "atrasado") return "vencido";
  if (v === "programado") return "a_vencer";
  return (FILTROS.some((f) => f.valor === v) ? v : "fila") as FiltroPagar;
};

const isYm = (v: string) => /^\d{4}-\d{2}$/.test(v);
const isData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const somarMes = (ym: string, delta: number) => {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const nomeDoMes = (ym: string) => {
  const [a, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, 15)));
};

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

/** Status que a tela mostra: vencido pela regra única, nunca pelo gravado. */
const statusEfetivo = (p: { status: PayableStatus; due_date: string }): PayableStatus => {
  if (!emAberto(p.status)) return p.status;
  return estaVencido(p) ? "atrasado" : "programado";
};

const prazoRelativo = (p: PurchasePayable, hoje: string) => {
  if (!emAberto(p.status)) return null;
  const d = diasAte(p.due_date, hoje);
  if (d === null) return null;
  if (d === 0) return "hoje";
  if (d < 0) return `há ${-d} d`;
  return `em ${d} d`;
};

/**
 * @param _props.initialStatus  ⚠️ Ignorado — o filtro vem da URL (`?status=`).
 *   Fica aceito só para a página antiga continuar compilando na transição.
 */
export function PayablesList(_props: { initialStatus?: string } = {}) {
  const { gestor } = useAuth();
  const [statusUrl, setStatus] = useParamUrl("status", "fila");
  const [source, setSource] = useParamUrl("origem", "all");
  const [mesUrl, setMes] = useParamUrl("mes", "");
  const [deUrl, setDe] = useParamUrl("de", "");
  const [ateUrl, setAte] = useParamUrl("ate", "");
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [paginaUrl, setPagina] = useParamUrl("pagina", "1");
  // Tamanho de página é preferência da pessoa, não pergunta: fica no navegador.
  const [pageSize, setPageSize] = usePersistedState<number>("compras.pagar.pageSize", 20);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paidAt, setPaidAt] = useState(hojeISO());

  const hoje = hojeISO();
  const status = normalizarFiltro(statusUrl);
  const mes = isYm(mesUrl) ? mesUrl : "";
  const de = isData(deUrl) ? deUrl : "";
  const ate = isData(ateUrl) ? ateUrl : "";
  const usaIntervalo = !!(de || ate);
  // Só um dos dois vale. Se a URL trouxer os dois (link montado à mão), o
  // intervalo explícito manda.
  const periodo = usaIntervalo ? { de, ate } : mes ? limitesDoMes(mes) : { de: "", ate: "" };
  const page = Math.max(0, (Number(paginaUrl) || 1) - 1);

  // A busca é digitada aqui e vai para a URL depois de uma pausa (replace: o
  // Voltar não apaga letra a letra). Voltar/link trazem a busca de volta ao campo.
  const [buscaTxt, setBuscaTxt] = useState(busca);
  useEffect(() => { setBuscaTxt((atual) => (atual.trim() === busca ? atual : busca)); }, [busca]);
  useEffect(() => {
    if (buscaTxt.trim() === busca) return;
    const t = setTimeout(() => { setBusca(buscaTxt.trim()); setPagina(null); }, 350);
    return () => clearTimeout(t);
  }, [buscaTxt, busca, setBusca, setPagina]);

  // Toda troca de filtro volta à primeira página — no MESMO clique, para o
  // Voltar desfazer as duas coisas juntas.
  const comPagina1 = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPagina(null); };

  const escolherMes = (ym: string | null) => {
    setMes(ym); setDe(null); setAte(null); setPagina(null);
    // A fila já é um recorte de datas (até hoje+7); somada a um mês, esvaziaria
    // qualquer mês futuro sem explicar por quê.
    if (ym && status === "fila") setStatus("all");
  };
  const escolherData = (qual: "de" | "ate", v: string) => {
    (qual === "de" ? setDe : setAte)(v || null);
    setMes(null); setPagina(null);
    if (v && status === "fila") setStatus("all");
  };
  const limparPeriodo = () => { setMes(null); setDe(null); setAte(null); setPagina(null); };

  /** Atalho dos cartões: exatamente o filtro que reproduz o número. */
  const aplicarCartao = (f: FiltroPagar) => {
    setStatus(f); setMes(null); setDe(null); setAte(null); setBusca(null); setPagina(null);
    setBuscaTxt("");
  };

  const updateStatus = useUpdatePayableStatus();
  const { data: openRows } = usePurchasePayablesOpen(source);
  const { data: paged, isLoading, isError, error } = usePurchasePayablesPaged({
    source, status, from: periodo.de, to: periodo.ate, page, pageSize, busca,
  });
  const rows = paged?.rows ?? [];
  const total = paged?.count ?? 0;

  // Resumo (aging) sobre o que está EM ABERTO (respeita só o filtro de origem).
  // ⚠️ Soma só real: um título em USD somado em R$ seria número sem moeda.
  const abertas = (openRows ?? []) as Array<{ amount: number; due_date: string; status: PayableStatus; currency?: string }>;
  const resumo = (arr: typeof abertas) => {
    const brl = arr.filter((p) => (p.currency ?? "BRL") === "BRL");
    return { qtd: arr.length, valor: brl.reduce((s, p) => s + Number(p.amount || 0), 0), outraMoeda: arr.length - brl.length };
  };
  const cartoes: { filtro: FiltroPagar; titulo: string; tom: string; r: ReturnType<typeof resumo> }[] = [
    { filtro: "aberto", titulo: "Em aberto", tom: "border-border", r: resumo(abertas) },
    { filtro: "vencido", titulo: "Vencido", tom: "border-destructive/30 bg-destructive/5", r: resumo(abertas.filter((p) => estaVencido(p, hoje))) },
    { filtro: "hoje", titulo: "Vence hoje", tom: "border-warning/30 bg-warning/5", r: resumo(abertas.filter((p) => diasAte(p.due_date, hoje) === 0)) },
    {
      filtro: "7dias", titulo: "Próximos 7 dias", tom: "border-border",
      r: resumo(abertas.filter((p) => { const d = diasAte(p.due_date, hoje); return d !== null && d >= 1 && d <= 7; })),
    },
  ];
  const semRecorte = !periodo.de && !periodo.ate && !busca;

  const payingPayable = rows.find((p) => p.id === payingId);
  const handlePay = async () => {
    if (!payingId) return;
    try {
      await updateStatus.mutateAsync({ id: payingId, status: "pago", paid_at: paidAt || hojeISO() });
      setPayingId(null);
    } catch { /* o hook já avisou; o diálogo fica aberto para tentar de novo */ }
  };

  const estornar = async (p: PurchasePayable) => {
    const doBling = p.source === "bling";
    const ok = await confirmar({
      titulo: "Estornar o pagamento?",
      mensagem: `${p.supplier_name} · ${formatCurrency(p.amount)} · venc. ${dataBR(p.due_date)}\n\n` +
        (doBling
          ? "Este título vem do Bling. O estorno vale só aqui: se no Bling ele estiver pago, a próxima sincronização o traz de volta como pago."
          : "A conta volta a ficar em aberto e a data de pagamento é apagada."),
      confirmar: "Estornar",
      perigo: true,
    });
    if (ok) updateStatus.mutate({ id: p.id, status: "programado" });
  };

  const cancelar = async (p: PurchasePayable) => {
    const ok = await confirmar({
      titulo: "Cancelar esta conta?",
      mensagem: `${p.supplier_name} · ${formatCurrency(p.amount)} · venc. ${dataBR(p.due_date)}\n\n` +
        (p.source === "bling"
          ? "O cancelamento vale só aqui — no Bling o título continua em aberto."
          : "Ela sai da fila e dos totais a pagar."),
      confirmar: "Cancelar conta",
      cancelar: "Voltar",
      perigo: true,
    });
    if (ok) updateStatus.mutate({ id: p.id, status: "cancelado" });
  };

  const from1 = total === 0 ? 0 : page * pageSize + 1;
  const to1 = Math.min(total, (page + 1) * pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const irParaPagina = (n: number) => setPagina(n <= 0 ? null : String(n + 1));

  return (
    <div className="space-y-4">
      {/* Resumo de aging — cada cartão é atalho para o filtro dele */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((c) => {
          const ativo = semRecorte && status === c.filtro;
          return (
            <button
              key={c.filtro}
              type="button"
              onClick={() => aplicarCartao(c.filtro)}
              aria-pressed={ativo}
              title="Mostrar exatamente estas contas"
              className={`rounded-xl border p-3 text-left transition-colors hover:border-carbo-green/60 ${c.tom} ${ativo ? "ring-2 ring-carbo-green/60" : ""}`}
            >
              <p className={`text-xs ${c.filtro === "vencido" ? "text-destructive" : "text-muted-foreground"}`}>{c.titulo}</p>
              <p className={`text-lg font-bold break-words ${c.filtro === "vencido" ? "text-destructive" : ""}`}>{formatCurrency(c.r.valor)}</p>
              <p className="text-[11px] text-muted-foreground">
                {c.r.qtd} conta(s){c.r.outraMoeda > 0 ? ` · ${c.r.outraMoeda} em outra moeda, fora do total` : ""}
              </p>
            </button>
          );
        })}
      </div>

      {status === "fila" && semRecorte && (
        <p className="text-xs text-muted-foreground">
          Fila de trabalho: contas vencidas, que vencem hoje e nos próximos 7 dias, da mais antiga para a mais nova.
        </p>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="space-y-1 lg:w-[260px]">
          <Label className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={buscaTxt}
              onChange={(e) => setBuscaTxt(e.target.value)}
              placeholder="Fornecedor ou nº do documento"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={comPagina1(setStatus)}>
            <SelectTrigger className="w-full lg:w-[210px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {FILTROS.map((f) => <SelectItem key={f.valor} value={f.valor}>{f.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Origem</Label>
          <Select value={source} onValueChange={comPagina1(setSource)}>
            <SelectTrigger className="w-full lg:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value="interno">Criadas no sistema</SelectItem>
              <SelectItem value="bling">Importadas do Bling</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mês</Label>
          {mes && !usaIntervalo ? (
            <div className="inline-flex h-10 w-full items-center justify-between rounded-md border border-border lg:w-auto">
              <button type="button" className="h-full px-2 hover:text-carbo-green" onClick={() => escolherMes(somarMes(mes, -1))} title="Mês anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[120px] px-2 text-center text-sm capitalize">{nomeDoMes(mes)}</span>
              <button type="button" className="h-full px-2 hover:text-carbo-green" onClick={() => escolherMes(somarMes(mes, 1))} title="Próximo mês">
                <ChevronRight className="h-4 w-4" />
              </button>
              <button type="button" className="h-full border-l border-border px-2 text-muted-foreground hover:text-foreground" onClick={() => escolherMes(null)} title="Tirar o filtro de mês">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-full gap-2 lg:w-auto" onClick={() => escolherMes(mesAtualISO())}>
              <CalendarRange className="h-4 w-4" /> Filtrar por mês
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:flex">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input type="date" className="lg:w-[150px]" value={de} onChange={(e) => escolherData("de", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input type="date" className="lg:w-[150px]" value={ate} onChange={(e) => escolherData("ate", e.target.value)} />
          </div>
        </div>
        {(usaIntervalo || mes) && (
          <Button variant="ghost" size="sm" className="text-muted-foreground lg:self-end" onClick={limparPeriodo}>
            Limpar período
          </Button>
        )}
      </div>

      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Fornecedor</CarboTableHead>
            <CarboTableHead>Documento</CarboTableHead>
            <CarboTableHead>Origem</CarboTableHead>
            <CarboTableHead>Valor</CarboTableHead>
            <CarboTableHead>Vencimento</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            <CarboTableHead>Pago em</CarboTableHead>
            <CarboTableHead>Ações</CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {isLoading ? (
            <CarboTableRow>
              <CarboTableCell colSpan={8} className="py-8 text-center text-muted-foreground">Carregando...</CarboTableCell>
            </CarboTableRow>
          ) : isError ? (
            <CarboTableRow>
              <CarboTableCell colSpan={8} className="py-8 text-center text-destructive">
                Não foi possível ler as contas: {(error as Error)?.message ?? "erro desconhecido"}
              </CarboTableCell>
            </CarboTableRow>
          ) : !rows.length ? (
            <CarboTableRow>
              <CarboTableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <CreditCard className="h-8 w-8 text-muted-foreground/50" />
                  <span>
                    {status === "fila" && semRecorte
                      ? "Nada vencido nem vencendo nos próximos 7 dias."
                      : "Nenhuma conta a pagar com esses filtros"}
                  </span>
                </div>
              </CarboTableCell>
            </CarboTableRow>
          ) : (
            rows.map((p) => {
              const eff = statusEfetivo(p);
              const isBling = p.source === "bling";
              const rel = prazoRelativo(p, hoje);
              return (
                <CarboTableRow key={p.id}>
                  <CarboTableCell className="font-medium">{p.supplier_name}</CarboTableCell>
                  <CarboTableCell className="font-mono text-xs text-muted-foreground">{p.bling_numero || "—"}</CarboTableCell>
                  <CarboTableCell>
                    <CarboBadge variant={isBling ? "secondary" : "info"} className="text-[10px]">
                      {isBling ? "Bling" : "Sistema"}
                    </CarboBadge>
                  </CarboTableCell>
                  <CarboTableCell className="whitespace-nowrap font-mono">{formatCurrency(p.amount)}</CarboTableCell>
                  <CarboTableCell className="whitespace-nowrap text-sm">
                    {dataBR(p.due_date)}
                    {rel && <span className={`ml-1 text-xs ${eff === "atrasado" ? "text-destructive" : "text-muted-foreground"}`}>({rel})</span>}
                  </CarboTableCell>
                  <CarboTableCell>
                    <CarboBadge variant={statusVariantMap[eff]} dot>{PAYABLE_STATUS_LABELS[eff]}</CarboBadge>
                  </CarboTableCell>
                  <CarboTableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {/* ⚠️ O espelho do Bling não grava a data da baixa: dizer
                        "no Bling" é a verdade; inventar uma data, não. */}
                    {p.paid_at ? dataBR(p.paid_at) : p.status === "pago" && isBling ? <span title="Baixado no Bling — o espelho não traz a data">no Bling</span> : "—"}
                  </CarboTableCell>
                  <CarboTableCell onClick={(e) => e.stopPropagation()}>
                    {!gestor ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : p.status === "pago" ? (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => estornar(p)} title="Estornar pagamento">
                        <Undo2 className="h-3.5 w-3.5" /> Estornar
                      </Button>
                    ) : p.status === "cancelado" ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="gap-1.5 text-success" onClick={() => { setPaidAt(hojeISO()); setPayingId(p.id); }}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Pagar
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => cancelar(p)} title="Cancelar conta">
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </CarboTableCell>
                </CarboTableRow>
              );
            })
          )}
        </CarboTableBody>
      </CarboTable>

      {/* Paginação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Por página</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPagina(null); }}>
            <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span>{from1}–{to1} de {total}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" disabled={page <= 0} onClick={() => irParaPagina(Math.max(0, page - 1))}>
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground">{Math.min(page, lastPage) + 1} / {lastPage + 1}</span>
          <Button variant="outline" size="sm" className="gap-1" disabled={page >= lastPage} onClick={() => irParaPagina(Math.min(lastPage, page + 1))}>
            Próxima <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Baixa */}
      <Dialog open={!!payingId} onOpenChange={(o) => { if (!o) setPayingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pagamento</DialogTitle>
          </DialogHeader>
          <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); handlePay(); }}>
            {payingPayable ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">Marcar esta conta como paga?</p>
                <div className="space-y-1 rounded-lg border border-border p-3">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Fornecedor</span><strong className="text-right">{payingPayable.supplier_name}</strong></div>
                  {payingPayable.bling_numero && (
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Documento</span><strong className="font-mono">{payingPayable.bling_numero}</strong></div>
                  )}
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Valor</span><strong className="font-mono">{formatCurrency(payingPayable.amount)}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Vencimento</span><strong>{dataBR(payingPayable.due_date)}</strong></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Data do pagamento</Label>
                  <Input type="date" value={paidAt} max={hoje} onChange={(e) => setPaidAt(e.target.value)} />
                </div>
                {payingPayable.source === "bling" && (
                  <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                    A baixa vale só aqui — no Bling o título continua em aberto.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Deseja marcar esta conta como paga?</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayingId(null)}>Cancelar</Button>
              <Button type="submit" disabled={updateStatus.isPending || !paidAt} className="carbo-gradient gap-1.5 text-white">
                <CheckCircle2 className="h-4 w-4" />
                Confirmar pagamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
