import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParamUrl, confirmar } from "@carbo/shell";
import { usePersistedState } from "@/hooks/usePersistedState";
import { CreditCard, Plus, RefreshCw } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { usePurchasePayablesOpen, usePurchasePayablesPaged, useUpdatePayableStatus, invalidarContasAPagar, type FiltroPagar } from "@/hooks/usePurchasing";
import { FilialBling2, LinhaEmpresa, SeletorEmpresa, useEmpresaUrl } from "@/components/financeiro/FilialBling2";
import {
  BarraFiltros, CabecalhoOrdem, CampoBusca, CelulaVencimento, FiltroOrdem, FiltroPeriodo, FiltroSelect, Kpi, KpiGrade,
  LimparFiltros, LinhaEstado, MenuAcoes, Paginacao, SituacaoBadge, Valor, useOrdemUrl,
} from "@/components/financeiro/ContasUI";
import { DialogoBaixa, type ConfirmacaoBaixa } from "@/components/financeiro/DialogoBaixa";
import { resumoAjustes, salvarAjustes, useEspelhoMatriz } from "@/lib/baixaDialogo";
import { BaixaNoBling } from "@/components/financeiro/BaixaNoBling";
import { NovaConta, type ContaCriada } from "@/components/financeiro/NovaConta";
import { paraConta, type Bling2Conta } from "@/hooks/useBling2Contas";
import { chamarContasPagar, useContaPagarConfig } from "@/lib/contaPagarBling";
import { toast } from "@/hooks/use-toast";
import { useBaixaBlingConfig, vaiAoBling, enviarAoBling, avisarBaixaNoBling } from "@/lib/blingBaixa";
import type { PayableStatus, PurchasePayable } from "@/types/purchasing";
import { hojeISO, limitesDoMes, dataBR, diasAte, estaVencido, emAberto } from "@/lib/datas";
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

const FILTROS: { valor: FiltroPagar; rotulo: string }[] = [
  { valor: "fila", rotulo: "Fila de trabalho" },
  { valor: "vencido", rotulo: "Vencidos" },
  { valor: "hoje", rotulo: "Vencem hoje" },
  { valor: "7dias", rotulo: "Próximos 7 dias" },
  { valor: "a_vencer", rotulo: "A vencer" },
  { valor: "aberto", rotulo: "Em aberto" },
  { valor: "pago", rotulo: "Pagos" },
  { valor: "cancelado", rotulo: "Cancelados" },
  { valor: "all", rotulo: "Todos" },
];

// Nomes antigos (links e favoritos de antes) continuam valendo.
const normalizarFiltro = (v: string): FiltroPagar => {
  if (v === "atrasado") return "vencido";
  if (v === "programado") return "a_vencer";
  return (FILTROS.some((f) => f.valor === v) ? v : "fila") as FiltroPagar;
};

const isYm = (v: string) => /^\d{4}-\d{2}$/.test(v);
const isData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

/** Status que a tela mostra: vencido pela regra única, nunca pelo gravado. */
const statusEfetivo = (p: { status: PayableStatus; due_date: string }): PayableStatus => {
  if (!emAberto(p.status)) return p.status;
  return estaVencido(p) ? "atrasado" : "programado";
};

/**
 * @param _props.initialStatus  ⚠️ Ignorado — o filtro vem da URL (`?status=`).
 *   Fica aceito só para a página antiga continuar compilando na transição.
 */
export function PayablesList(_props: { initialStatus?: string } = {}) {
  // ⚠️ Matriz e filial são telas SEPARADAS (`?empresa=filial`): a filial é o
  // espelho do Bling 2 e nunca soma com a matriz.
  const [empresa, trocarEmpresa] = useEmpresaUrl();
  const qc = useQueryClient();
  const { data: cfgCriar } = useContaPagarConfig();
  const [nova, setNova] = useState(false);
  // "Salvar e dar baixa": a conta recém-lançada abre a MESMA baixa da linha.
  const [baixaMatriz, setBaixaMatriz] = useState<PurchasePayable | null>(null);
  const [baixaFilial, setBaixaFilial] = useState<Bling2Conta | null>(null);
  const conta = empresa === "filial" ? 2 : 1;
  const criada = ({ locais, baixar }: ContaCriada) => {
    invalidarContasAPagar(qc);
    qc.invalidateQueries({ queryKey: ["bling2-contas-paged"] });
    qc.invalidateQueries({ queryKey: ["bling2-contas-resumo"] });
    const linha = locais[0];
    if (!baixar) return;
    if (!linha) { toast({ title: "Lançada no Bling — a baixa fica para a linha da conta, quando ela aparecer." }); return; }
    if (conta === 2) setBaixaFilial(paraConta("pagar")(linha));
    else setBaixaMatriz(linha as PurchasePayable);
  };
  const seletor = <SeletorEmpresa valor={empresa} onChange={trocarEmpresa} />;
  return (
    <div className="space-y-5">
      <CarboPageHeader
        title="Contas a pagar"
        icon={CreditCard}
        actions={
          // ⚠️ Só aparece com o interruptor da empresa ligado (`fin_contas_pagar_config`).
          cfgCriar?.[conta] ? (
            <Button className="gap-1.5" onClick={() => setNova(true)}>
              <Plus className="h-4 w-4" /> Nova conta a pagar
            </Button>
          ) : undefined
        }
      />
      {empresa === "filial"
        ? <FilialBling2 tipo="pagar" seletor={seletor} abrirBaixa={baixaFilial} onBaixaAberta={() => setBaixaFilial(null)} />
        : <PayablesMatriz seletor={seletor} abrirBaixa={baixaMatriz} onBaixaAberta={() => setBaixaMatriz(null)} />}
      <NovaConta tipo="pagar" conta={conta} open={nova} onOpenChange={setNova} onCriada={criada} />
    </div>
  );
}

// ⚠️ Baixa, cancelamento e estorno valem para QUALQUER pessoa com o app
// Finanças (decisão do dono do processo, 21/10/2026) — o banco já libera por
// `carbo_tem_app`. A confirmação das ações perigosas continua.
function PayablesMatriz({ seletor, abrirBaixa, onBaixaAberta }: {
  seletor: ReactNode; abrirBaixa?: PurchasePayable | null; onBaixaAberta?: () => void;
}) {
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
  // A conta recém-lançada pode não estar na página aberta: a baixa a recebe inteira.
  const [externa, setExterna] = useState<PurchasePayable | null>(null);
  useEffect(() => {
    if (!abrirBaixa) return;
    setExterna(abrirBaixa);
    setPayingId(abrirBaixa.id);
    onBaixaAberta?.();
  }, [abrirBaixa]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [pagando, setPagando] = useState(false);

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
  const { ordem, definir: definirOrdem, alternar: ordenarPor } = useOrdemUrl(() => setPagina(null));

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
  const limparPeriodo = () => { setMes(null); setDe(null); setAte(null); setPagina(null); };

  /** Atalho dos cartões: exatamente o filtro que reproduz o número. */
  const aplicarCartao = (f: FiltroPagar) => {
    setStatus(f); setMes(null); setDe(null); setAte(null); setBusca(null); setPagina(null);
    setBuscaTxt("");
  };

  const updateStatus = useUpdatePayableStatus();
  const qc = useQueryClient();
  const { data: cfgBling } = useBaixaBlingConfig();
  const [estornando, setEstornando] = useState<string | null>(null);
  const { data: openRows } = usePurchasePayablesOpen(source);
  const { data: paged, isLoading, isError, error } = usePurchasePayablesPaged({
    source, status, from: periodo.de, to: periodo.ate, page, pageSize, busca, ordem,
  });
  const rows = paged?.rows ?? [];
  const total = paged?.count ?? 0;
  // Situação e saldo do Bling 1: é ele que sabe da baixa PARCIAL.
  const { data: espelho } = useEspelhoMatriz("pagar", rows.map((p) => p.bling_id));
  const saldoDe = (p: PurchasePayable) => {
    const e = p.bling_id ? espelho?.get(Number(p.bling_id)) : undefined;
    return e?.situacao === "3" && e.saldo != null && e.saldo > 0 ? e.saldo : null;
  };

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

  const payingPayable = rows.find((p) => p.id === payingId) ?? (externa?.id === payingId ? externa : undefined);
  const handlePay = async ({ dia, ajustes, parcial }: ConfirmacaoBaixa) => {
    const titulo = payingPayable;
    if (!titulo) return;
    setPagando(true);
    try {
      // ⚠️ PARCIAL vai ao Bling PRIMEIRO e não marca nada como pago aqui: o
      // título continua aberto, com o saldo que o Bling disser.
      if (parcial) {
        const r = await enviarAoBling("baixar", "pagar", titulo.id, { ajustes, data: dia });
        avisarBaixaNoBling(r);
        invalidarContasAPagar(qc);
        qc.invalidateQueries({ queryKey: ["espelho-matriz"] });
        if (r.ok) setPayingId(null);
        return;
      }
      // A linha é lida ANTES de fechar o diálogo: depois do update ela pode já
      // ter saído da página (a fila não mostra pago).
      try {
        await updateStatus.mutateAsync({ id: titulo.id, status: "pago", paid_at: dia || hojeISO() });
        await salvarAjustes("purchase_payables", titulo.id, ajustes);
        setPayingId(null);
      } catch { return; /* o hook já avisou; o diálogo fica aberto para tentar de novo */ }
      // ⚠️ A baixa LOCAL já está gravada; o Bling é o passo seguinte, e a recusa
      // dele NÃO a desfaz — fica em `bling_baixa_erro`, com "Tentar de novo" na linha.
      if (vaiAoBling(cfgBling, titulo)) {
        avisarBaixaNoBling(await enviarAoBling("baixar", "pagar", titulo.id, { ajustes }));
        invalidarContasAPagar(qc);
        qc.invalidateQueries({ queryKey: ["espelho-matriz"] });
      }
    } finally {
      setPagando(false);
    }
  };

  const estornar = async (p: PurchasePayable) => {
    const doBling = p.source === "bling";
    const vai = vaiAoBling(cfgBling, p);
    // ⚠️ Pago com `paid_by` nulo = a baixa foi feita NO Bling e chegou pelo
    // espelho. Estornar só aqui não adianta: a sincronização de 10 min o marca
    // pago de novo. Com a integração ligada quem recusa é a função (e diz por quê).
    if (doBling && !vai && !p.paid_by) {
      toast({ title: "Este título foi pago no Bling — desfaça a baixa lá; o sistema acompanha em até 15 min.", variant: "destructive" });
      return;
    }
    const ok = await confirmar({
      titulo: "Estornar o pagamento?",
      mensagem: `${p.supplier_name} · ${formatCurrency(p.amount)} · venc. ${dataBR(p.due_date)}\n\n` +
        (vai
          ? "Este título vem do Bling. O estorno é feito primeiro no Bling e só depois aqui — se o Bling recusar, nada muda."
          : doBling
          ? "Este título vem do Bling. O estorno vale só aqui: se no Bling ele estiver pago, a próxima sincronização o traz de volta como pago."
          : "A conta volta a ficar em aberto e a data de pagamento é apagada."),
      confirmar: "Estornar",
      perigo: true,
    });
    if (!ok) return;
    if (vai) {
      // ⚠️ O BLING PRIMEIRO. Estornar aqui e o Bling recusar deixaria o título
      // em aberto aqui e pago lá — e a sincronização o traria de volta pago.
      setEstornando(p.id);
      const r = await enviarAoBling("estornar", "pagar", p.id);
      setEstornando(null);
      if (!r.ok) {
        toast({ title: "O Bling recusou o estorno", description: r.mensagem, variant: "destructive" });
        invalidarContasAPagar(qc);
        return;
      }
      if (r.pulado) toast({ title: "Bling", description: r.mensagem });
    }
    updateStatus.mutate({ id: p.id, status: "programado" }, { onSuccess: () => salvarAjustes("purchase_payables", p.id, null) });
  };

  const cancelar = async (p: PurchasePayable) => {
    // ⚠️ Conta que NASCEU aqui (criada pelo Finanças no Bling): cancelar é
    // EXCLUIR no Bling — senão ela ficaria aberta lá e cancelada aqui.
    if (p.criado_aqui_por && p.bling_id) {
      const ok = await confirmar({
        titulo: "Excluir esta conta no Bling?",
        mensagem: `${p.supplier_name} · ${formatCurrency(p.amount)} · venc. ${dataBR(p.due_date)}\n\n` +
          "Ela foi criada pelo sistema: é excluída no Bling da matriz e cancelada aqui. Se o Bling recusar, nada muda.",
        confirmar: "Excluir no Bling", cancelar: "Voltar", perigo: true,
      });
      if (!ok) return;
      const r = await chamarContasPagar("excluir", 1, { bling_id: Number(p.bling_id) });
      if (r.ok) toast({ title: "Conta excluída no Bling" });
      else toast({ title: "O Bling não excluiu — nada mudou", description: r.mensagem, variant: "destructive" });
      invalidarContasAPagar(qc);
      return;
    }
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

  const irParaPagina = (n: number) => setPagina(n <= 0 ? null : String(n + 1));

  const filtrado = status !== "fila" || source !== "all" || !!periodo.de || !!periodo.ate || !!busca || !!ordem;
  const limparTudo = () => {
    setStatus(null); setSource(null); setMes(null); setDe(null); setAte(null); setBusca(null); setPagina(null);
    definirOrdem(null);
    setBuscaTxt("");
  };

  return (
    <div className="space-y-5">
      <LinhaEmpresa
        seletor={seletor}
        meta={cfgBling?.ativo ? <><RefreshCw className="h-3 w-3" /><span>Bling 1 · baixa vai para o Bling na hora</span></> : undefined}
      />

      {/* Cada cartão é atalho para o filtro que reproduz o número dele. */}
      <KpiGrade>
        {cartoes.map((c) => (
          <Kpi
            key={c.filtro} titulo={c.titulo} valor={c.r.valor} qtd={c.r.qtd}
            tom={c.filtro === "vencido" ? "perigo" : c.filtro === "hoje" ? "alerta" : "neutro"}
            nota={c.r.outraMoeda > 0 ? `${c.r.outraMoeda} em outra moeda` : undefined}
            ativo={semRecorte && status === c.filtro} onClick={() => aplicarCartao(c.filtro)}
          />
        ))}
      </KpiGrade>

      <BarraFiltros>
        <CampoBusca valor={buscaTxt} onChange={setBuscaTxt} placeholder="Buscar fornecedor ou nº" />
        <FiltroSelect rotulo="Status" valor={status} opcoes={FILTROS.map((f) => ({ v: f.valor, l: f.rotulo }))} onChange={comPagina1(setStatus)} />
        <FiltroSelect rotulo="Origem" valor={source} onChange={comPagina1(setSource)}
          opcoes={[{ v: "all", l: "Todas" }, { v: "bling", l: "Bling" }, { v: "interno", l: "Sistema" }]} />
        <FiltroPeriodo
          mes={usaIntervalo ? "" : mes} de={de} ate={ate}
          onMes={escolherMes}
          onIntervalo={(d, a) => {
            setDe(d || null); setAte(a || null); setMes(null); setPagina(null);
            if ((d || a) && status === "fila") setStatus("all");
          }}
          onLimpar={limparPeriodo}
        />
        <FiltroOrdem ordem={ordem} onChange={definirOrdem} quitado="Pagamento" />
        <LimparFiltros visivel={filtrado} onClick={limparTudo} />
      </BarraFiltros>

      <div className="space-y-3">
        <CarboTable>
          <CarboTableHeader>
            <CarboTableRow>
              <CabecalhoOrdem col="nome" ordem={ordem} onOrdenar={ordenarPor}>Fornecedor</CabecalhoOrdem>
              <CabecalhoOrdem col="vencimento" ordem={ordem} onOrdenar={ordenarPor}>Vencimento</CabecalhoOrdem>
              <CabecalhoOrdem col="valor" ordem={ordem} onOrdenar={ordenarPor} direita>Valor</CabecalhoOrdem>
              <CarboTableHead>Situação</CarboTableHead>
              <CabecalhoOrdem col="quitado" ordem={ordem} onOrdenar={ordenarPor}>Pago em</CabecalhoOrdem>
              <CarboTableHead className="w-px" />
            </CarboTableRow>
          </CarboTableHeader>
          <CarboTableBody>
            {isLoading ? (
              <LinhaEstado colunas={6} tipo="carregando" texto="Carregando…" />
            ) : isError ? (
              <LinhaEstado colunas={6} tipo="erro" texto={`Não foi possível ler as contas: ${(error as Error)?.message ?? "erro desconhecido"}`} />
            ) : !rows.length ? (
              <LinhaEstado colunas={6} tipo="vazio"
                texto={status === "fila" && semRecorte ? "Nada vencido nem vencendo nos próximos 7 dias." : "Nenhuma conta com esses filtros."} />
            ) : (
              rows.map((p) => {
                const eff = statusEfetivo(p);
                const isBling = p.source === "bling";
                const saldo = emAberto(p.status) ? saldoDe(p) : null;
                const ajustes = resumoAjustes((p as any).baixa_ajustes, p.amount);
                const sub = [
                  p.bling_numero && `nº ${p.bling_numero}`,
                  isBling ? "Bling" : "Sistema",
                  p.criado_aqui_nome && `criada por ${p.criado_aqui_nome.split(" ")[0]}`,
                ].filter(Boolean).join(" · ");
                return (
                  <CarboTableRow key={p.id} className="hover:bg-muted/30">
                    <CarboTableCell className="min-w-[220px] py-3">
                      <p className="font-medium">{p.supplier_name}</p>
                      <p className="text-xs text-muted-foreground">{sub}</p>
                    </CarboTableCell>
                    <CarboTableCell className="py-3">
                      <CelulaVencimento data={p.due_date} dias={emAberto(p.status) ? diasAte(p.due_date, hoje) : null} />
                    </CarboTableCell>
                    <CarboTableCell className="py-3 text-right">
                      <Valor v={saldo ?? p.amount} />
                      {saldo != null && <span className="block text-xs text-muted-foreground tabular-nums">de {formatCurrency(p.amount)}</span>}
                    </CarboTableCell>
                    <CarboTableCell className="py-3">
                      <SituacaoBadge s={eff === "atrasado" ? "vencido" : eff === "programado" ? (saldo != null ? "parcial" : "aberto") : eff === "pago" ? "pago" : "cancelado"} />
                    </CarboTableCell>
                    <CarboTableCell className="py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                      {/* ⚠️ O espelho do Bling não grava a data da baixa: dizer
                          "no Bling" é a verdade; inventar uma data, não. */}
                      {p.paid_at ? dataBR(p.paid_at) : p.status === "pago" && isBling ? <span title="Baixado no Bling — o espelho não traz a data">no Bling</span> : "—"}
                      {p.status === "pago" && ajustes && <span className="block text-xs">{ajustes}</span>}
                    </CarboTableCell>
                    <CarboTableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {p.status === "pago" ? (
                          <>
                            <BaixaNoBling
                              titulo={p} tipo="pagar" cfg={cfgBling} pago baixadoAqui={!!p.paid_by}
                              onDepois={() => invalidarContasAPagar(qc)}
                            />
                            <MenuAcoes itens={[{ l: estornando === p.id ? "Estornando…" : "Estornar pagamento", onClick: () => estornar(p), disabled: estornando === p.id }]} />
                          </>
                        ) : p.status === "cancelado" ? (
                          <MenuAcoes itens={[]} />
                        ) : (
                          <>
                            <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => setPayingId(p.id)}>
                              Pagar
                            </Button>
                            <MenuAcoes itens={[{ l: p.criado_aqui_por ? "Excluir no Bling" : "Cancelar conta", onClick: () => cancelar(p), perigo: true }]} />
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

        <Paginacao page={page} pageSize={pageSize} total={total} onPage={irParaPagina}
          onPageSize={(n) => { setPageSize(n); setPagina(null); }} />
      </div>

      {/* Baixa: conta (banco), data, juros/multa/desconto/tarifa e o valor de fato */}
      <DialogoBaixa
        open={!!payingId} onOpenChange={(o) => { if (!o) setPayingId(null); }}
        tipo="pagar" conta={1} espelho="bling_contas_pagar" blingId={payingPayable?.bling_id ? Number(payingPayable.bling_id) : null}
        titulo={payingPayable ? {
          nome: payingPayable.supplier_name, numero: payingPayable.bling_numero, vencimento: payingPayable.due_date,
          valor: Number(payingPayable.amount), saldo: saldoDe(payingPayable) ?? Number(payingPayable.amount),
        } : null}
        podeParcial={!!payingPayable && vaiAoBling(cfgBling, payingPayable)}
        motivoSemParcial="Baixa parcial só com o envio ao Bling ligado — é o Bling que guarda o saldo."
        enviando={pagando || updateStatus.isPending} onConfirmar={handlePay}
        aviso={payingPayable?.source === "bling"
          ? (vaiAoBling(cfgBling, payingPayable) ? "A baixa vai para o Bling na hora, na conta escolhida." : "A baixa vale só aqui — no Bling o título continua em aberto.")
          : undefined}
      />
    </div>
  );
}
