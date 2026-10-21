import { useEffect, useMemo, useState, type ReactNode } from "react";
import { HandCoins, CheckCircle2, Ban, ChevronLeft, ChevronRight, Plus, FileDown, Search, AlertTriangle } from "lucide-react";
import { useParamUrl, confirmar } from "@carbo/shell";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { usePersistedState } from "@/hooks/usePersistedState";
import { FilialBling2, SeletorEmpresa, useEmpresaUrl } from "@/components/financeiro/FilialBling2";
import {
  useReceivablesOpen, useReceivablesPaged, useUpdateReceivableStatus, useCreateReceivable,
  useInvoicedOrdersNoReceivable, useGenerateReceivablesFromOrders,
  RECEIVABLE_STATUS_LABELS, RECEIVABLE_SOURCE_LABELS, type Receivable, type ReceivableStatus, type FiltroStatusReceber, type TituloNovo,
} from "@/hooks/useReceivables";
import { hojeISO, mesAtualISO, somarDias, diasAte, limitesDoMes, dataBR, estaVencido } from "@/lib/datas";
import { parcelasDoPrazo, notaDaParcela, type Parcela } from "@/lib/parcelas";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const isYm = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const isDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
/** Soma meses a `AAAA-MM` por texto — sem `Date`, sem fuso. */
const somarMeses = (ym: string, delta: number) => {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

const statusVariant: Record<ReceivableStatus, any> = {
  programado: "info", recebido: "success", atrasado: "destructive", cancelado: "cancelled",
};
/** Vencido pela regra ÚNICA (`estaVencido`), não pelo status gravado. */
const effectiveStatus = (r: { status: ReceivableStatus; due_date: string }): ReceivableStatus =>
  estaVencido(r) ? "atrasado" : r.status === "atrasado" ? "programado" : r.status;

const FILTROS_STATUS: { v: FiltroStatusReceber; l: string }[] = [
  { v: "fila", l: "Fila: vencidos + 7 dias" },
  { v: "aberto", l: "Em aberto (todos)" },
  { v: "atrasado", l: "Vencidos" },
  { v: "programado", l: "A vencer" },
  { v: "recebido", l: "Recebidos" },
  { v: "cancelado", l: "Cancelados" },
  { v: "all", l: "Todos os status" },
];

/**
 * O que aparece abaixo do cliente. Título que nasceu da NF diz a parcela, o
 * pedido e a nota pelas COLUNAS próprias; título antigo não as tem (ou a
 * migração ainda não rodou) e cai no `notes`, que era onde isso morava.
 */
function linhasDoTitulo(r: Receivable): string[] {
  const out: string[] = [];
  if (r.parcela && r.parcelas_total) {
    out.push(`Parcela ${r.parcela}/${r.parcelas_total}${r.order_number ? ` · ${r.order_number}` : ""}`);
  } else if (r.notes) {
    out.push(r.notes);
  } else if (r.order_number) {
    out.push(`Pedido ${r.order_number}`);
  } else if (r.bling_numero) {
    out.push(`Bling nº ${r.bling_numero}`);
  }
  if (r.nf_numero) out.push(`NF ${r.nf_numero}`);
  return out;
}

/** Origem → cor do selo. `nf` = nasceu sozinho da NF de venda emitida. */
const SOURCE_VARIANT: Record<string, any> = { interno: "info", bling: "secondary", nf: "default" };

const TITULO = "Contas a receber";
const DESCRICAO = "Títulos a receber de clientes — do faturamento, do sistema e do Bling — com baixa e inadimplência.";

/**
 * ⚠️ Matriz e filial são telas SEPARADAS (`?empresa=filial`): a filial é o
 * espelho do Bling 2, só leitura, e nunca soma com a matriz.
 */
export default function Recebiveis() {
  const [empresa, trocarEmpresa] = useEmpresaUrl();
  const seletor = <SeletorEmpresa valor={empresa} onChange={trocarEmpresa} />;
  if (empresa === "filial") {
    return (
      <div className="space-y-4">
        <CarboPageHeader title={TITULO} description={DESCRICAO} icon={HandCoins} />
        {seletor}
        <FilialBling2 tipo="receber" />
      </div>
    );
  }
  return <RecebiveisMatriz seletor={seletor} />;
}

// ⚠️ Receber, cancelar e estornar valem para QUALQUER pessoa com o app Finanças
// (decisão do dono do processo, 21/10/2026) — o banco já libera por
// `carbo_tem_app`. A confirmação das ações perigosas continua.
function RecebiveisMatriz({ seletor }: { seletor: ReactNode }) {
  // Filtros na URL: F5, link mandado a alguém e Voltar funcionam.
  const [statusUrl, setStatusUrl] = useParamUrl("status", "fila");
  const [source, setSourceUrl] = useParamUrl("origem", "all");
  const [mesUrl, setMesUrl] = useParamUrl("mes", "");
  const [deUrl, setDeUrl] = useParamUrl("de", "");
  const [ateUrl, setAteUrl] = useParamUrl("ate", "");
  const [buscaUrl, setBuscaUrl] = useParamUrl("busca", "", { replace: true });
  const [paginaUrl, setPaginaUrl] = useParamUrl("pagina", "1");
  const [pageSize, setPageSize] = usePersistedState<number>("fin.receber.pageSize", 20);

  const status = (FILTROS_STATUS.some((f) => f.v === statusUrl) ? statusUrl : "fila") as FiltroStatusReceber;
  const mes = isYm(mesUrl) ? mesUrl : "";
  const de = isDia(deUrl) ? deUrl : "";
  const ate = isDia(ateUrl) ? ateUrl : "";
  const page = Math.max(0, (Number(paginaUrl) || 1) - 1);

  // Toda troca de filtro volta à 1ª página.
  const setStatus = (v: string) => {
    setStatusUrl(v);
    // A fila é a visão SEM recorte de data: escolhê-la limpa mês e intervalo.
    if (v === "fila") { setMesUrl(null); setDeUrl(null); setAteUrl(null); }
    setPaginaUrl(null);
  };
  const setSource = (v: string) => { setSourceUrl(v); setPaginaUrl(null); };
  // Mês e De/Até são exclusivos: um limpa o outro. Sair da fila para um recorte
  // de data passa a mostrar todos os status daquele recorte.
  const setMes = (v: string | null) => {
    if (v && status === "fila") setStatusUrl("all");
    setMesUrl(v); setDeUrl(null); setAteUrl(null); setPaginaUrl(null);
  };
  const setIntervalo = (campo: "de" | "ate", v: string) => {
    if (v && status === "fila") setStatusUrl("all");
    (campo === "de" ? setDeUrl : setAteUrl)(v || null);
    setMesUrl(null); setPaginaUrl(null);
  };
  const setPage = (p: number) => setPaginaUrl(p <= 0 ? null : String(p + 1));

  // Busca: digitada no campo, gravada na URL depois de uma pausa.
  const [busca, setBusca] = useState(buscaUrl);
  // Voltar/link mudam a URL por fora: o campo acompanha (sem comer o espaço que está sendo digitado).
  useEffect(() => { setBusca((b) => (b.trim() === buscaUrl ? b : buscaUrl)); }, [buscaUrl]);
  useEffect(() => {
    if (busca.trim() === buscaUrl) return;
    const t = setTimeout(() => { setBuscaUrl(busca.trim() || null); setPaginaUrl(null); }, 350);
    return () => clearTimeout(t);
  }, [busca, buscaUrl, setBuscaUrl, setPaginaUrl]);

  const recorte = mes ? limitesDoMes(mes) : { de, ate };
  const hoje = hojeISO();

  const [receiving, setReceiving] = useState<Receivable | null>(null);
  const [recAt, setRecAt] = useState(hoje);
  const [showNew, setShowNew] = useState(false);
  const formVazio = () => ({ customer_name: "", amount: "", due_date: hojeISO(), notes: "" });
  const [form, setForm] = useState(formVazio);
  const [showGerar, setShowGerar] = useState(false);

  const update = useUpdateReceivableStatus();
  const create = useCreateReceivable();
  const { data: openRows } = useReceivablesOpen(source);
  const { data: paged, isLoading, isError, error } = useReceivablesPaged({
    source, status, de: recorte.de, ate: recorte.ate, busca: buscaUrl, page, pageSize,
  });
  const rows = paged?.rows ?? [];
  const total = paged?.count ?? 0;

  const abertas = openRows ?? [];
  const sum = (arr: any[]) => arr.reduce((s, p) => s + Number(p.amount || 0), 0);
  const vencidas = abertas.filter((p) => estaVencido(p, hoje));
  const venceHoje = abertas.filter((p) => p.due_date?.slice(0, 10) === hoje);
  const vence7 = abertas.filter((p) => { const d = diasAte(p.due_date, hoje); return d != null && d >= 1 && d <= 7; });

  const from1 = total === 0 ? 0 : page * pageSize + 1;
  const to1 = Math.min(total, (page + 1) * pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  const doReceive = async () => {
    if (!receiving || !recAt) return;
    await update.mutateAsync({ id: receiving.id, status: "recebido", received_at: recAt, amount: Number(receiving.amount) });
    setReceiving(null);
  };
  const doCreate = async () => {
    if (!form.amount || !form.due_date) return;
    await create.mutateAsync({ customer_name: form.customer_name || null, amount: Number(form.amount), due_date: form.due_date, notes: form.notes || null });
    setShowNew(false); setForm(formVazio());
  };
  const estornar = async (r: Receivable) => {
    const ok = await confirmar({
      titulo: "Estornar o recebimento?",
      mensagem: `${r.customer_name || "Título"} · ${brl(r.amount)}, recebido em ${dataBR(r.received_at)}.\nO título volta a ficar em aberto e a data de recebimento é apagada.`,
      confirmar: "Estornar", perigo: true,
    });
    if (ok) update.mutate({ id: r.id, status: "programado" });
  };
  const cancelar = async (r: Receivable) => {
    const ok = await confirmar({
      titulo: "Cancelar este título?",
      mensagem: `${r.customer_name || "Título"} · ${brl(r.amount)}, vencimento ${dataBR(r.due_date)}.\nTítulo cancelado sai do a receber, do aging e do fluxo de caixa.`,
      confirmar: "Cancelar título", cancelar: "Voltar", perigo: true,
    });
    if (ok) update.mutate({ id: r.id, status: "cancelado" });
  };

  const descricaoRecorte = status === "fila" && !mes && !de && !ate
    ? `Fila: tudo o que está vencido e o que vence até ${dataBR(somarDias(hoje, 7))}.`
    : mes || de || ate
      ? `${status === "recebido" ? "Recebidos" : "Vencimento"} ${mes ? `em ${rotuloMes(mes)}` : `${de ? `de ${dataBR(de)}` : ""}${ate ? ` até ${dataBR(ate)}` : ""}`}.`
      : "Sem recorte de data.";

  return (
    <div className="space-y-4">
      <CarboPageHeader
        title={TITULO}
        description={DESCRICAO}
        icon={HandCoins}
        actions={
          <>
            <Button
              variant="outline" onClick={() => setShowGerar(true)} className="gap-2"
              title="Para pedido sem prazo reconhecido ou anterior à automação"
            >
              <FileDown className="h-4 w-4" /> Gerar de pedidos faturados
            </Button>
            <Button onClick={() => setShowNew(true)} className="gap-2 carbo-gradient text-white"><Plus className="h-4 w-4" /> Novo título</Button>
          </>
        }
      />

      {seletor}

      <p className="text-xs text-muted-foreground">
        Os títulos nascem sozinhos quando a NF de venda é emitida (CarboZé pelo Bling, CarboVAPT pela NFS-e), uma
        parcela por vencimento do prazo.
      </p>

      {/* Aging — sempre sobre TODO o em aberto, independente dos filtros da lista. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">A receber (em aberto)</p>
          <p className="text-lg font-bold break-words">{brl(sum(abertas))}</p>
          <p className="text-[11px] text-muted-foreground">{abertas.length} título(s)</p>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">Vencido (inadimplência)</p>
          <p className="text-lg font-bold text-destructive break-words">{brl(sum(vencidas))}</p>
          <p className="text-[11px] text-muted-foreground">{vencidas.length} título(s)</p>
        </div>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs text-warning-foreground">Vence hoje</p>
          <p className="text-lg font-bold break-words">{brl(sum(venceHoje))}</p>
          <p className="text-[11px] text-muted-foreground">{venceHoje.length} título(s)</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Próximos 7 dias</p>
          <p className="text-lg font-bold break-words">{brl(sum(vence7))}</p>
          <p className="text-[11px] text-muted-foreground">{vence7.length} título(s)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 w-full lg:w-auto">
          <Label className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 w-full lg:w-[240px]" placeholder="Cliente, pedido, NF, CNPJ/CPF" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILTROS_STATUS.map((f) => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Origem</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value="nf">Faturamento (NF)</SelectItem>
              <SelectItem value="interno">Criadas no sistema</SelectItem>
              <SelectItem value="bling">Importadas do Bling</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{status === "recebido" ? "Mês do recebimento" : "Mês do vencimento"}</Label>
          {mes ? (
            <div className="inline-flex items-center rounded-md border border-border h-10">
              <button className="px-2 h-full hover:text-carbo-green" onClick={() => setMes(somarMeses(mes, -1))} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-2 text-sm min-w-[120px] text-center capitalize">{rotuloMes(mes)}</span>
              <button className="px-2 h-full hover:text-carbo-green" onClick={() => setMes(somarMeses(mes, 1))} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
            </div>
          ) : (
            <Button variant="outline" className="h-10" onClick={() => setMes(mesAtualISO())}>Escolher mês</Button>
          )}
        </div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">De</Label><Input type="date" className="w-[150px]" value={de} onChange={(e) => setIntervalo("de", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Até</Label><Input type="date" className="w-[150px]" value={ate} onChange={(e) => setIntervalo("ate", e.target.value)} /></div>
        {(mes || de || ate) && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setMesUrl(null); setDeUrl(null); setAteUrl(null); setPaginaUrl(null); }}>
            Limpar datas
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground -mt-1">{descricaoRecorte}</p>

      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Cliente</CarboTableHead>
            <CarboTableHead>Origem</CarboTableHead>
            <CarboTableHead>Valor</CarboTableHead>
            <CarboTableHead>Vencimento</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            <CarboTableHead>Recebido em</CarboTableHead>
            <CarboTableHead>Ações</CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {isLoading ? (
            <CarboTableRow><CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</CarboTableCell></CarboTableRow>
          ) : isError ? (
            <CarboTableRow><CarboTableCell colSpan={7} className="text-center text-destructive py-8">
              Não foi possível ler os títulos: {(error as Error)?.message ?? "erro desconhecido"}
            </CarboTableCell></CarboTableRow>
          ) : !rows.length ? (
            <CarboTableRow><CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">
              <div className="flex flex-col items-center gap-2">
                <HandCoins className="h-8 w-8 text-muted-foreground/50" />
                <span>{status === "fila" && !buscaUrl ? "Nada vencido nem vencendo nos próximos 7 dias." : "Nenhum título com esses filtros."}</span>
              </div>
            </CarboTableCell></CarboTableRow>
          ) : (
            rows.map((r) => {
              const eff = effectiveStatus(r);
              const sub = linhasDoTitulo(r);
              return (
                <CarboTableRow key={r.id}>
                  <CarboTableCell className="font-medium">
                    <p>{r.customer_name || "—"}</p>
                    {sub.map((t, i) => (
                      <p key={i} className="text-[11px] font-normal text-muted-foreground truncate max-w-[260px]" title={t}>{t}</p>
                    ))}
                  </CarboTableCell>
                  <CarboTableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <CarboBadge variant={SOURCE_VARIANT[r.source] ?? "outline"} className="text-[10px]">{RECEIVABLE_SOURCE_LABELS[r.source] ?? r.source}</CarboBadge>
                      {r.empresa === "filial" && <CarboBadge variant="outline" className="text-[10px]">Filial SP</CarboBadge>}
                    </div>
                  </CarboTableCell>
                  <CarboTableCell className="font-mono whitespace-nowrap">{brl(r.amount)}</CarboTableCell>
                  <CarboTableCell className="text-sm whitespace-nowrap">{dataBR(r.due_date)}</CarboTableCell>
                  <CarboTableCell><CarboBadge variant={statusVariant[eff]} dot>{RECEIVABLE_STATUS_LABELS[eff]}</CarboBadge></CarboTableCell>
                  <CarboTableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {dataBR(r.received_at)}
                    {r.status === "recebido" && r.recebido_via === "banco" && <span className="block text-[11px]">pelo banco</span>}
                  </CarboTableCell>
                  <CarboTableCell>
                    {r.status === "recebido" ? (
                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => estornar(r)}>Estornar</Button>
                      ) : r.status === "cancelado" ? <span className="text-muted-foreground text-xs">—</span>
                      : (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="gap-1.5 text-success" onClick={() => { setRecAt(hojeISO()); setReceiving(r); }}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Receber
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => cancelar(r)} title="Cancelar título" aria-label="Cancelar título"><Ban className="h-3.5 w-3.5" /></Button>
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
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPaginaUrl(null); }}>
            <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
          </Select>
          <span>{from1}–{to1} de {total}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" disabled={page <= 0} onClick={() => setPage(Math.max(0, page - 1))}><ChevronLeft className="h-4 w-4" /> Anterior</Button>
          <span className="text-sm text-muted-foreground">{Math.min(page, lastPage) + 1} / {lastPage + 1}</span>
          <Button variant="outline" size="sm" className="gap-1" disabled={page >= lastPage} onClick={() => setPage(Math.min(lastPage, page + 1))}>Próxima <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Baixa */}
      <Dialog open={!!receiving} onOpenChange={() => setReceiving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar recebimento</DialogTitle></DialogHeader>
          {receiving && (
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Cliente</span><strong className="text-right">{receiving.customer_name || "—"}</strong></div>
                {linhasDoTitulo(receiving).map((t, i) => (
                  <p key={i} className="text-right text-xs text-muted-foreground break-words">{t}</p>
                ))}
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Valor</span><strong className="font-mono">{brl(receiving.amount)}</strong></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Vencimento</span><strong>{dataBR(receiving.due_date)}</strong></div>
              </div>
              <div className="space-y-1.5"><Label>Data do recebimento</Label><Input type="date" value={recAt} max={hoje} onChange={(e) => setRecAt(e.target.value)} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiving(null)}>Cancelar</Button>
            <Button onClick={doReceive} disabled={update.isPending || !recAt} className="gap-1.5 carbo-gradient text-white"><CheckCircle2 className="h-4 w-4" /> Confirmar recebimento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GerarDeVendasDialog open={showGerar} onClose={() => setShowGerar(false)} />

      {/* Novo título */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo título a receber</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Cliente</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} placeholder="Nome do cliente" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Valor (R$)</Label><Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Vencimento</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Observação</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={doCreate} disabled={!form.amount || !form.due_date || create.isPending} className="carbo-gradient text-white">Criar título</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Gerar de pedidos faturados ───────────────────────────────────────────────
// ⚠️ Abre com NADA marcado: gerar título é afirmar que o cliente deve aquilo
// naquela data, e o histórico inteiro de pedidos já pagos aparece aqui como
// candidato. Marcar tudo por padrão era um clique de distância de criar
// centenas de títulos falsos.
// ⚠️ Prazo que o parser não reconhece NÃO ganha vencimento inventado: o pedido
// só pode ser marcado depois de alguém digitar a data.

const STATUS_PEDIDO: Record<string, string> = { invoiced: "Faturado", shipped: "Enviado", delivered: "Entregue" };
const POR_VEZ = 50;

function GerarDeVendasDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: pedidos = [], isLoading, isError, error } = useInvoicedOrdersNoReceivable(open);
  const gen = useGenerateReceivablesFromOrders();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [due, setDue] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [mostrar, setMostrar] = useState(POR_VEZ);

  // Reabrir zera tudo — de propósito NÃO depende de `pedidos`: recarregar a
  // lista no meio não pode remarcar nada.
  useEffect(() => {
    if (!open) return;
    setSel({}); setDue({}); setBusca(""); setMostrar(POR_VEZ);
  }, [open]);

  const parcelasPorPedido = useMemo(() => {
    const m = new Map<string, Parcela[] | null>();
    pedidos.forEach((p) => m.set(p.id, parcelasDoPrazo(p.payment_terms, p.total, p.base)));
    return m;
  }, [pedidos]);

  /** As parcelas que SERÃO criadas: as do prazo, ou uma única na data digitada. */
  const parcelasDe = (id: string, total: number): Parcela[] | null => {
    const p = parcelasPorPedido.get(id);
    if (p) return p;
    const d = due[id];
    return d && isDia(d) ? [{ numero: 1, de: 1, vencimento: d, valor: total }] : null;
  };

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return pedidos;
    return pedidos.filter((p) => `${p.order_number ?? ""} ${p.customer_name ?? ""}`.toLowerCase().includes(b));
  }, [pedidos, busca]);
  const visiveis = filtrados.slice(0, mostrar);

  const selecionados = pedidos.filter((p) => sel[p.id] && parcelasDe(p.id, p.total));
  const titulos: TituloNovo[] = selecionados.flatMap((p) =>
    (parcelasDe(p.id, p.total) ?? []).map((x) => ({
      order_id: p.id, customer_name: p.customer_name, amount: x.valor, due_date: x.vencimento,
      notes: notaDaParcela(x, p.order_number),
    })));
  const totalSel = selecionados.reduce((s, p) => s + p.total, 0);

  const gerar = async () => {
    if (!titulos.length) return;
    await gen.mutateAsync(titulos);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar títulos a receber de pedidos faturados</DialogTitle>
        </DialogHeader>
        <div className="text-[11px] text-warning-foreground bg-warning/10 border border-warning/30 rounded-lg p-2 space-y-1">
          <p>
            <strong>Para pedido sem prazo reconhecido ou anterior à automação.</strong> Hoje o título nasce sozinho
            quando a NF de venda é emitida (origem "NF") — pedido que já tem título não aparece aqui.
          </p>
          <p>
            <strong>Título vindo do Bling não tem pedido vinculado</strong> — se este pedido já tem título importado do Bling,
            gerar aqui duplica. Confira a lista de contas a receber antes.
          </p>
          <p>Um título por parcela, com os vencimentos tirados do prazo de pagamento do pedido, a partir da data da venda. Venda on-line fica de fora (é paga na plataforma).</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar pedido ou cliente" value={busca} onChange={(e) => { setBusca(e.target.value); setMostrar(POR_VEZ); }} />
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground py-6">Carregando…</p>
          : isError ? <p className="text-sm text-destructive py-6">Não foi possível ler os pedidos: {(error as Error)?.message ?? "erro desconhecido"}</p>
          : pedidos.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pedido faturado sem título a receber.</p>
          : filtrados.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pedido com essa busca.</p>
          : (
            <div className="space-y-2 py-1">
              {visiveis.map((p) => {
                const doPrazo = parcelasPorPedido.get(p.id);
                const reconhecido = !!doPrazo;
                const parcelas = parcelasDe(p.id, p.total);
                const podeMarcar = !!parcelas && parcelas.length > 0;
                return (
                  <div key={p.id} className="flex items-start gap-2 text-sm border-b border-border pb-2">
                    <input
                      type="checkbox" className="mt-1"
                      checked={!!sel[p.id] && podeMarcar} disabled={!podeMarcar}
                      aria-label={`Gerar títulos do pedido ${p.order_number ?? ""}`}
                      onChange={(e) => setSel((s) => ({ ...s, [p.id]: e.target.checked }))}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono">{p.order_number || "—"}</span>
                        <span className="text-[11px] text-muted-foreground">{STATUS_PEDIDO[p.status] ?? p.status} · venda {dataBR(p.base)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground break-words">
                        {p.customer_name || "—"} · <strong className="text-foreground">{brl(p.total)}</strong> · {p.payment_terms || "sem prazo informado"}
                      </p>
                      {reconhecido ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {doPrazo!.map((x) => (
                            <li key={x.numero} className="rounded border border-border px-1.5 py-0.5 text-[11px] font-mono">
                              {x.numero}/{x.de} · {dataBR(x.vencimento)} · {brl(x.valor)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] text-warning-foreground">
                            <AlertTriangle className="h-3.5 w-3.5" /> Prazo não reconhecido — informe o vencimento
                          </span>
                          <Input
                            type="date" className="w-[150px] h-8" value={due[p.id] ?? ""}
                            aria-label={`Vencimento do pedido ${p.order_number ?? ""}`}
                            onChange={(e) => setDue((d) => ({ ...d, [p.id]: e.target.value }))}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtrados.length > visiveis.length && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setMostrar((n) => n + POR_VEZ)}>
                  Mostrar mais ({filtrados.length - visiveis.length} restantes)
                </Button>
              )}
            </div>
          )}
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {selecionados.length} pedido(s) · {titulos.length} título(s) · {brl(totalSel)}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={gerar} disabled={titulos.length === 0 || gen.isPending} className="carbo-gradient text-white">
              Gerar {titulos.length} título(s)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
