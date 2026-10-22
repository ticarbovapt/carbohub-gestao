import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HandCoins, CheckCircle2, Plus, RefreshCw, Search, AlertTriangle } from "lucide-react";
import { useParamUrl, confirmar } from "@carbo/shell";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { usePersistedState } from "@/hooks/usePersistedState";
import { FilialBling2, LinhaEmpresa, SeletorEmpresa, useEmpresaUrl } from "@/components/financeiro/FilialBling2";
import {
  BarraFiltros, CampoBusca, CelulaVencimento, FiltroPeriodo, FiltroSelect, Kpi, KpiGrade, LimparFiltros,
  LinhaEstado, MenuAcoes, Paginacao, SituacaoBadge, Valor,
} from "@/components/financeiro/ContasUI";
import { BaixaNoBling } from "@/components/financeiro/BaixaNoBling";
import { toast } from "@/hooks/use-toast";
import { useBaixaBlingConfig, vaiAoBling, enviarAoBling, avisarBaixaNoBling } from "@/lib/blingBaixa";
import {
  useReceivablesOpen, useReceivablesPaged, useUpdateReceivableStatus, useCreateReceivable,
  useInvoicedOrdersNoReceivable, useGenerateReceivablesFromOrders, invalidarContasAReceber,
  RECEIVABLE_STATUS_LABELS, RECEIVABLE_SOURCE_LABELS, type Receivable, type ReceivableStatus, type FiltroStatusReceber, type TituloNovo,
} from "@/hooks/useReceivables";
import { hojeISO, diasAte, limitesDoMes, dataBR, estaVencido } from "@/lib/datas";
import { parcelasDoPrazo, notaDaParcela, type Parcela } from "@/lib/parcelas";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const isYm = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const isDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
/** Vencido pela regra ÚNICA (`estaVencido`), não pelo status gravado. */
const effectiveStatus = (r: { status: ReceivableStatus; due_date: string }): ReceivableStatus =>
  estaVencido(r) ? "atrasado" : r.status === "atrasado" ? "programado" : r.status;

const FILTROS_STATUS: { v: FiltroStatusReceber; l: string }[] = [
  { v: "fila", l: "Fila de trabalho" },
  { v: "aberto", l: "Em aberto" },
  { v: "atrasado", l: "Vencidos" },
  { v: "programado", l: "A vencer" },
  { v: "recebido", l: "Recebidos" },
  { v: "cancelado", l: "Cancelados" },
  { v: "all", l: "Todos" },
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

const TITULO = "Contas a receber";

/**
 * ⚠️ Matriz e filial são telas SEPARADAS (`?empresa=filial`): a filial é o
 * espelho do Bling 2 e nunca soma com a matriz.
 */
export default function Recebiveis() {
  const [empresa, trocarEmpresa] = useEmpresaUrl();
  const seletor = <SeletorEmpresa valor={empresa} onChange={trocarEmpresa} />;
  if (empresa === "filial") {
    return (
      <div className="space-y-5">
        <CarboPageHeader title={TITULO} icon={HandCoins} />
        <FilialBling2 tipo="receber" seletor={seletor} />
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

  const update = useUpdateReceivableStatus();
  const create = useCreateReceivable();
  const qc = useQueryClient();
  const { data: cfgBling } = useBaixaBlingConfig();
  const [estornando, setEstornando] = useState<string | null>(null);
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


  const doReceive = async () => {
    if (!receiving || !recAt) return;
    const titulo = receiving;
    try {
      await update.mutateAsync({ id: titulo.id, status: "recebido", received_at: recAt, amount: Number(titulo.amount) });
      setReceiving(null);
    } catch { return; /* o hook já avisou; o diálogo fica aberto para tentar de novo */ }
    // ⚠️ A baixa LOCAL já está gravada; o Bling é o passo seguinte, e a recusa
    // dele NÃO a desfaz — fica em `bling_baixa_erro`, com "Tentar de novo" na linha.
    if (vaiAoBling(cfgBling, titulo)) {
      avisarBaixaNoBling(await enviarAoBling("baixar", "receber", titulo.id));
      invalidarContasAReceber(qc);
    }
  };
  const doCreate = async () => {
    if (!form.amount || !form.due_date) return;
    await create.mutateAsync({ customer_name: form.customer_name || null, amount: Number(form.amount), due_date: form.due_date, notes: form.notes || null });
    setShowNew(false); setForm(formVazio());
  };
  const estornar = async (r: Receivable) => {
    const vai = vaiAoBling(cfgBling, r);
    // ⚠️ Recebido com `received_by` nulo = a baixa foi feita NO Bling e chegou
    // pelo espelho. Estornar só aqui não adianta: a sincronização de 10 min o
    // marca recebido de novo. Com a integração ligada quem recusa é a função.
    if (r.source === "bling" && !vai && !r.received_by) {
      toast({ title: "Este título foi pago no Bling — desfaça a baixa lá; o sistema acompanha em até 15 min.", variant: "destructive" });
      return;
    }
    const ok = await confirmar({
      titulo: "Estornar o recebimento?",
      mensagem: `${r.customer_name || "Título"} · ${brl(r.amount)}, recebido em ${dataBR(r.received_at)}.\nO título volta a ficar em aberto e a data de recebimento é apagada.` +
        (vai ? "\nO estorno é feito primeiro no Bling e só depois aqui — se o Bling recusar, nada muda." : ""),
      confirmar: "Estornar", perigo: true,
    });
    if (!ok) return;
    if (vai) {
      // ⚠️ O BLING PRIMEIRO. Estornar aqui e o Bling recusar deixaria o título
      // em aberto aqui e recebido lá — e a sincronização o traria de volta.
      setEstornando(r.id);
      const res = await enviarAoBling("estornar", "receber", r.id);
      setEstornando(null);
      if (!res.ok) {
        toast({ title: "O Bling recusou o estorno", description: res.mensagem, variant: "destructive" });
        invalidarContasAReceber(qc);
        return;
      }
      if (res.pulado) toast({ title: "Bling", description: res.mensagem });
    }
    update.mutate({ id: r.id, status: "programado" });
  };
  const cancelar = async (r: Receivable) => {
    const ok = await confirmar({
      titulo: "Cancelar este título?",
      mensagem: `${r.customer_name || "Título"} · ${brl(r.amount)}, vencimento ${dataBR(r.due_date)}.\nTítulo cancelado sai do a receber, do aging e do fluxo de caixa.`,
      confirmar: "Cancelar título", cancelar: "Voltar", perigo: true,
    });
    if (ok) update.mutate({ id: r.id, status: "cancelado" });
  };

  const filtrado = status !== "fila" || source !== "all" || !!mes || !!de || !!ate || !!buscaUrl;
  const limparTudo = () => {
    setStatusUrl(null); setSourceUrl(null); setMesUrl(null); setDeUrl(null); setAteUrl(null);
    setBuscaUrl(null); setPaginaUrl(null); setBusca("");
  };
  /** Atalho dos cartões: o filtro que reproduz o número, sem período nem busca. */
  const aplicarCartao = (v: FiltroStatusReceber) => {
    setStatusUrl(v === "fila" ? null : v); setMesUrl(null); setDeUrl(null); setAteUrl(null);
    setBuscaUrl(null); setPaginaUrl(null); setBusca("");
  };
  const semRecorte = !mes && !de && !ate && !buscaUrl;

  return (
    <div className="space-y-5">
      <CarboPageHeader
        title={TITULO}
        icon={HandCoins}
        actions={<Button onClick={() => setShowNew(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Novo título</Button>}
      />

      {/* ⚠️ A matriz mostra o contas a receber do BLING 1, copiado a cada 10 min
          (`fin_bling1_contas_aplicar`). O "Gerar de pedidos faturados" saiu: com
          os títulos do Bling aqui, ele criaria de novo todo pedido faturado — o
          título do Bling não guarda o pedido de origem, então não há como saber
          que já existe. A geração pela NF está DESLIGADA (fica no radar). */}
      <LinhaEmpresa
        seletor={seletor}
        meta={<><RefreshCw className="h-3 w-3" /><span>Bling 1 · atualizado a cada 10 min{cfgBling?.ativo ? "" : " · baixa só aqui"}</span></>}
      />

      {/* Aging — sempre sobre TODO o em aberto, independente dos filtros da lista. */}
      <KpiGrade>
        <Kpi titulo="Em aberto" valor={sum(abertas)} qtd={abertas.length}
          ativo={semRecorte && status === "aberto"} onClick={() => aplicarCartao("aberto")} />
        <Kpi titulo="Vencido" tom="perigo" valor={sum(vencidas)} qtd={vencidas.length}
          ativo={semRecorte && status === "atrasado"} onClick={() => aplicarCartao("atrasado")} />
        <Kpi titulo="Vence hoje" tom="alerta" valor={sum(venceHoje)} qtd={venceHoje.length} />
        <Kpi titulo="Próximos 7 dias" valor={sum(vence7)} qtd={vence7.length} />
      </KpiGrade>

      <BarraFiltros>
        <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar cliente, pedido, NF ou CNPJ" />
        <FiltroSelect rotulo="Status" valor={status} opcoes={FILTROS_STATUS} onChange={setStatus} />
        <FiltroSelect rotulo="Origem" valor={source} onChange={setSource}
          opcoes={[{ v: "all", l: "Todas" }, { v: "bling", l: "Bling" }, { v: "nf", l: "NF" }, { v: "interno", l: "Sistema" }]} />
        <FiltroPeriodo
          rotulo={status === "recebido" ? "Recebimento" : "Vencimento"}
          mes={mes} de={de} ate={ate}
          onMes={setMes}
          onIntervalo={(d, a) => {
            if ((d || a) && status === "fila") setStatusUrl("all");
            setDeUrl(d || null); setAteUrl(a || null); setMesUrl(null); setPaginaUrl(null);
          }}
          onLimpar={() => { setMesUrl(null); setDeUrl(null); setAteUrl(null); setPaginaUrl(null); }}
        />
        <LimparFiltros visivel={filtrado} onClick={limparTudo} />
      </BarraFiltros>

      <div className="space-y-3">
        <CarboTable>
          <CarboTableHeader>
            <CarboTableRow>
              <CarboTableHead>Cliente</CarboTableHead>
              <CarboTableHead>Vencimento</CarboTableHead>
              <CarboTableHead className="text-right [&>div]:justify-end">Valor</CarboTableHead>
              <CarboTableHead>Situação</CarboTableHead>
              <CarboTableHead>Recebido em</CarboTableHead>
              <CarboTableHead className="w-px" />
            </CarboTableRow>
          </CarboTableHeader>
          <CarboTableBody>
            {isLoading ? (
              <LinhaEstado colunas={6} tipo="carregando" texto="Carregando…" />
            ) : isError ? (
              <LinhaEstado colunas={6} tipo="erro" texto={`Não foi possível ler os títulos: ${(error as Error)?.message ?? "erro desconhecido"}`} />
            ) : !rows.length ? (
              <LinhaEstado colunas={6} tipo="vazio"
                texto={status === "fila" && !buscaUrl ? "Nada vencido nem vencendo nos próximos 7 dias." : "Nenhum título com esses filtros."} />
            ) : (
              rows.map((r) => {
                const eff = effectiveStatus(r);
                const sub = [
                  ...linhasDoTitulo(r),
                  RECEIVABLE_SOURCE_LABELS[r.source] ?? r.source,
                  r.empresa === "filial" ? "Filial SP" : null,
                ].filter(Boolean).join(" · ");
                const aberto = r.status !== "recebido" && r.status !== "cancelado";
                return (
                  <CarboTableRow key={r.id} className="hover:bg-muted/30">
                    <CarboTableCell className="min-w-[220px] py-3">
                      <p className="font-medium">{r.customer_name || "—"}</p>
                      <p className="max-w-[420px] truncate text-xs text-muted-foreground" title={sub}>{sub}</p>
                    </CarboTableCell>
                    <CarboTableCell className="py-3">
                      <CelulaVencimento data={r.due_date} dias={aberto ? diasAte(r.due_date, hoje) : null} />
                    </CarboTableCell>
                    <CarboTableCell className="py-3 text-right"><Valor v={r.amount} /></CarboTableCell>
                    <CarboTableCell className="py-3">
                      <SituacaoBadge s={eff === "atrasado" ? "vencido" : eff === "programado" ? "aberto" : eff === "recebido" ? "recebido" : "cancelado"} />
                    </CarboTableCell>
                    <CarboTableCell className="py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                      {dataBR(r.received_at)}
                      {r.status === "recebido" && r.recebido_via === "banco" && <span className="block text-xs">pelo banco</span>}
                    </CarboTableCell>
                    <CarboTableCell className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === "recebido" ? (
                          <>
                            <BaixaNoBling
                              titulo={r} tipo="receber" cfg={cfgBling} pago baixadoAqui={!!r.received_by}
                              onDepois={() => invalidarContasAReceber(qc)}
                            />
                            <MenuAcoes itens={[{ l: estornando === r.id ? "Estornando…" : "Estornar recebimento", onClick: () => estornar(r), disabled: estornando === r.id }]} />
                          </>
                        ) : r.status === "cancelado" ? (
                          <MenuAcoes itens={[]} />
                        ) : (
                          <>
                            <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => { setRecAt(hojeISO()); setReceiving(r); }}>
                              Receber
                            </Button>
                            <MenuAcoes itens={[{ l: "Cancelar título", onClick: () => cancelar(r), perigo: true }]} />
                          </>
                        )}
                      </div>
                    </CarboTableCell>
                  </CarboTableRow>
                );
              })
            )}
          </CarboTableBody>
        </CarboTable>

        <Paginacao page={page} pageSize={pageSize} total={total} onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPaginaUrl(null); }} />
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
              {vaiAoBling(cfgBling, receiving) && (
                <p className="rounded-md border border-border bg-muted/40 p-2 text-xs">A baixa feita aqui vai para o Bling na hora.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiving(null)}>Cancelar</Button>
            <Button onClick={doReceive} disabled={update.isPending || !recAt} className="gap-1.5 carbo-gradient text-white"><CheckCircle2 className="h-4 w-4" /> Confirmar recebimento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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

// ⚠️ FORA DA TELA desde 21/10/2026 (ver o comentário acima da faixa da
// matriz). Fica para quando a geração pela NF voltar a valer.
export function GerarDeVendasDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
