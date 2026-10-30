import { Fragment, useEffect, useMemo, useState } from "react";
import { useParamUrl } from "@carbo/shell";
import {
  Receipt, FileText, ChevronLeft, ChevronRight, CheckCircle2, DollarSign, Store, Building2, Lock, Link2, Files, Package, Gift, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NaturezaBonificacaoDialog } from "@/components/NaturezaBonificacaoDialog";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useFaturamento,
  temBonificacao,
  faltaAlgumaNF,
  soServico,
  type FaturamentoOrder,
} from "@/hooks/useFaturamento";
import { useNfseDosPedidos, nfseValida } from "@/hooks/useNfseEmissao";
import { NfseEmitirDialog } from "@/components/faturamento/NfseEmitirDialog";
import { BlingConfirmDialog } from "@/components/faturamento/BlingConfirmDialog";
import { BaixarNFButton } from "@/components/faturamento/BaixarNFButton";
import { useNotasDosPedidos, notaInvalida } from "@/hooks/useNotasDosPedidos";
import { VincularNFsTab } from "@/components/faturamento/VincularNFsTab";
import { VincularNFsFilialTab } from "@/components/faturamento/VincularNFsFilialTab";
import { TodasNFsTab } from "@/components/faturamento/TodasNFsTab";
import { Pager, useUrlPage, paginate } from "@/components/faturamento/Pager";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

// Endereço de entrega (colunas texto) → linha legível.
function fmtEntrega(o: FaturamentoOrder): string | null {
  const cityUf = [o.delivery_city, o.delivery_state].filter(Boolean).join("/");
  const cep = o.delivery_zip ? `CEP ${o.delivery_zip}` : "";
  return [o.delivery_address, cityUf, cep].filter(Boolean).join(" — ") || null;
}
// Endereço de faturamento (jsonb) → linha legível.
function fmtFaturamento(e: Record<string, unknown> | null): string | null {
  if (!e) return null;
  const s = (k: string) => (e[k] != null ? String(e[k]) : "");
  const l1 = [s("logradouro"), s("numero")].filter(Boolean).join(", ");
  const l2 = [s("bairro"), [s("cidade"), s("uf")].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const cep = s("cep") ? `CEP ${s("cep")}` : "";
  return [l1, l2, cep].filter(Boolean).join(" — ") || null;
}

// Origem do pedido: veio do Bling (external_ref bling-…) ou nasceu no sistema.
const isBling = (o: FaturamentoOrder) =>
  (o.external_ref ?? "").toLowerCase().startsWith("bling") ||
  (o.order_number ?? "").toUpperCase().startsWith("BLING-");

// Duplicado: um pedido com número BLING-… (criado direto no Bling) que traz na
// observação (notes) o nº de uma venda do sistema (V…). É o MESMO pedido — a NF
// casa com a venda do sistema por esse código, então escondemos o registro do
// Bling pra não duplicar nem contar o valor em dobro.
//
// IMPORTANTE: a checagem é pelo NÚMERO ser BLING-… (não por "ser do Bling"),
// porque uma venda do sistema (V…) enviada ao Bling também fica com external_ref
// "bling-…" e tem o próprio V… na observação — ela NÃO pode ser escondida.
/**
 * Venda de marketplace (Nuvemshop, Meli, Amazon…).
 *
 * ⚠️ Separada das outras porque a origem é OUTRA e o tratamento também: nota de
 * marketplace é emitida pela plataforma ou em lote, não uma a uma por quem
 * fatura. Misturadas na aba do Bling elas afogam as vendas do time — que são
 * as que alguém precisa olhar hoje.
 *
 * O corte é por `segmento`, gravado pela ponte do Bling 2 (loja ≠ 0 e não
 * ignorada), e não por prefixo de número: venda direta da conta 2 também
 * chega como BLING2-… e NÃO é online.
 */
const isOnline = (o: FaturamentoOrder) => (o.segmento ?? "") === "online";

const SYSTEM_CODE_RE = /V\d{10}/i;
const isBlingDupOfSystem = (o: FaturamentoOrder) =>
  (o.order_number ?? "").toUpperCase().startsWith("BLING-") &&
  SYSTEM_CODE_RE.test(o.notes ?? "");

// Funil do Pós-venda (Carbo Ops). O Faturamento só libera a emissão da NF quando
// o card chega em "gerar_nf" (ou além). Antes disso o pedido aparece na lista,
// mas o botão fica travado mostrando em que etapa do pós-venda ele está.
const STAGE_ORDER = [
  "nova_venda", "separacao_pendente", "criar_op", "separando", "separado",
  "gerar_nf", "nf_finalizada", "emitir_etiqueta", "etiqueta_emitida", "em_transporte", "entregue",
];
const STAGE_LABELS: Record<string, string> = {
  nova_venda: "Nova Venda", separacao_pendente: "Pedido Recebido", criar_op: "Criar OP",
  separando: "Em Separação", separado: "Separado", gerar_nf: "Gerar NF",
  nf_finalizada: "Emitir Etiqueta", emitir_etiqueta: "Emitir Etiqueta",
  etiqueta_emitida: "Aguardando despacho", em_transporte: "Em Transporte", entregue: "Entregue",
  cancelado: "Cancelado",
};
const stageLabel = (s: string | null) => (s && STAGE_LABELS[s]) || "Pós-venda";
// Liberado quando chegou em "gerar_nf" no funil. Sem etapa (pedido antigo) libera
// por compatibilidade — não trava o que já existia antes desta regra.
const nfUnlocked = (o: FaturamentoOrder) => {
  if (!o.fulfillment_stage) return true;
  const i = STAGE_ORDER.indexOf(o.fulfillment_stage);
  return i < 0 ? false : i >= STAGE_ORDER.indexOf("gerar_nf");
};

export default function Faturamento() {
  const [naturezaOpen, setNaturezaOpen] = useState(false);
  // ⚠️ Mês e busca moram na URL (`?mes=AAAA-MM&busca=`), junto da aba (`?aba=`):
  // F5 e link compartilhado mantêm a tela, e o Voltar desfaz a troca de mês. A
  // busca grava com `replace` para não criar uma entrada por letra digitada.
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [mesUrl, setMesUrl] = useParamUrl("mes", mesAtual);
  const month = useMemo(() => {
    const [a, m] = mesUrl.split("-").map(Number);
    return a && m ? new Date(a, m - 1, 1) : new Date();
  }, [mesUrl]);
  const setMonth = (v: Date | ((m: Date) => Date)) => {
    const d = typeof v === "function" ? v(month) : v;
    setMesUrl(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const [search, setSearch] = useParamUrl("busca", "", { replace: true });
  // Aba ativa persistida na URL (`?aba=…`), pra não voltar pro "sistema" a cada F5.
  // ⚠️ ABA NOVA ENTRA AQUI TAMBÉM — são DOIS lugares, e esquecer o segundo não
  // dá erro nenhum. O `<TabsTrigger>` renderiza, o clique grava `?aba=…`, e
  // esta lista devolve a aba para "sistema" calado: o botão parece morto.
  // Aconteceu no mesmo dia em que a aba da filial foi criada.
  //
  // O fallback existe para link antigo com aba que não existe mais, e por isso
  // fica — mas é ele que transforma "esqueci de registrar" em "o botão não
  // funciona", que é o sintoma mais difícil de ligar à causa.
  //
  // A chave era `?tab=` e a aba da filial era `vincular_filial` (29/10/2026:
  // `?aba=` e `vincular-filial`). Os dois nomes antigos continuam sendo LIDOS —
  // link salvo abre a aba certa — e `tab` sai da URL na primeira troca.
  const VALID_TABS = ["sistema", "bling", "online", "vincular", "vincular-filial", "todas"];
  const [abaUrl, setAbaUrl] = useParamUrl("aba", "");
  const [tabAntiga, setTabAntiga] = useParamUrl("tab", "");
  const rawTab = (abaUrl || tabAntiga || "sistema").replace("vincular_filial", "vincular-filial");
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : "sistema";
  // Cada aba tem a SUA lista, mas só uma aparece por vez: elas dividem a mesma
  // `?pagina=` e a mesma busca de nota (`?nota=`), que por isso zeram na troca —
  // a página 4 do "sistema" não pode virar, calada, a página 4 de "Todas as NFs".
  const [, setBuscaNota] = useParamUrl("nota", "", { replace: true });
  const [, setOrdemNota] = useParamUrl("ordem", "");
  const setActiveTab = (v: string) => {
    setAbaUrl(v === "sistema" ? null : v);
    setTabAntiga(null);
    setBuscaNota(null);
    setOrdemNota(null);
    resetPages();
  };
  // Padrão: mostra TODOS os pedidos do mês (com e sem NF) — é uma tela de
  // rastreabilidade/faturamento. Desligar "Mostrar já faturados" filtra para
  // ver só os pendentes (sem NF vinculada).
  // Na URL também (`?faturados=nao`): é filtro, e o F5 não pode religá-lo calado.
  const [faturadosUrl, setFaturadosUrl] = useParamUrl("faturados", "sim");
  const showAll = faturadosUrl !== "nao";
  const setShowAll = (v: boolean) => { setFaturadosUrl(v ? null : "nao"); resetPages(); };
  // Linha expandida (detalhe do pedido para conferência). Clicar na linha alterna.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // A consulta espera a pessoa parar de digitar: a busca vasculha o histórico
  // inteiro, e uma consulta por letra é carga à toa (e respostas fora de ordem).
  const [buscaConsulta, setBuscaConsulta] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setBuscaConsulta(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data: orders, isLoading } = useFaturamento({ month, search: buscaConsulta, showAll });
  // Pedido em confirmação: abre o diálogo que mostra o que vai pro Bling (inclui
  // o pré-cadastro do cliente, se for novo) para o financeiro conferir e confirmar.
  const [toBling, setToBling] = useState<FaturamentoOrder | null>(null);
  // CarboVAPT: a nota é NFS-e pelo Portal Nacional (diálogo próprio).
  const [toNfse, setToNfse] = useState<string | null>(null);

  // Remove os pedidos do Bling que são duplicata de uma venda do sistema (V… na
  // observação) — some da lista, some dos KPIs, some da contagem das abas.
  const list = useMemo(() => (orders ?? []).filter((o) => !isBlingDupOfSystem(o)), [orders]);
  const sistema = useMemo(() => list.filter((o) => !isBling(o) && !isOnline(o)), [list]);
  // ⚠️ `!isOnline` também aqui: pedido de marketplace vem com external_ref
  // bling2-… e cairia na aba do Bling, que é justamente o que polui.
  const bling = useMemo(() => list.filter((o) => isBling(o) && !isOnline(o)), [list]);
  const online = useMemo(() => list.filter(isOnline), [list]);
  const { data: nfsePorPedido } = useNfseDosPedidos(
    useMemo(() => list.filter((o) => soServico(o.items)).map((o) => o.id), [list]),
  );
  const soma = (rows: FaturamentoOrder[]) => rows.reduce((s, o) => s + Number(o.total || 0), 0);

  // Paginação (20/pág) das abas sistema, Bling e online — página na URL
  // (`?pagina=`, persiste no F5). Uma chave só: só uma aba aparece por vez, e a
  // troca de aba volta à 1. Os nomes antigos (`?psist=`…) ainda são lidos.
  const abaPag = activeTab === "bling" ? "pbling" : activeTab === "online" ? "ponline" : "psist";
  const [pagina, setPagina] = useUrlPage("pagina", abaPag);
  const sistPag = paginate(sistema, pagina);
  const blingPag = paginate(bling, pagina);
  const onlinePag = paginate(online, pagina);
  const setPSist = setPagina, setPBling = setPagina, setPOnline = setPagina;
  // A nota de cada pedido da página, das DUAS contas (número, série, links).
  const { data: notas } = useNotasDosPedidos(
    activeTab === "bling" ? blingPag.slice : activeTab === "online" ? onlinePag.slice : sistPag.slice,
  );
  // Nova busca/mês/aba → volta pra página 1.
  function resetPages() { setPagina(1); }

  const changeMonth = (delta: number) => {
    resetPages();
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  function Tabela({ rows, showAction }: { rows: FaturamentoOrder[]; showAction: boolean }) {
    if (isLoading) {
      return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <CarboSkeleton key={i} className="h-12 w-full" />)}</div>;
    }
    if (rows.length === 0) {
      return (
        <CarboEmptyState
          icon={CheckCircle2}
          title={showAction ? "Nada para faturar" : "Nenhum pedido do Bling"}
          description={showAction
            ? (search ? "Nenhum pedido encontrado." : showAll ? "Sem pedidos neste mês." : "Todos deste mês já têm NF vinculada.")
            : "Sem pedidos criados direto no Bling neste período."}
        />
      );
    }
    return (
      <CarboTable className="min-w-[760px]">
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Pedido</CarboTableHead>
            <CarboTableHead>Cliente</CarboTableHead>
            <CarboTableHead>Data</CarboTableHead>
            <CarboTableHead>Vendedor</CarboTableHead>
            <CarboTableHead className="text-right">Valor</CarboTableHead>
            <CarboTableHead>Nota Fiscal</CarboTableHead>
            {showAction && <CarboTableHead className="text-right">Ação</CarboTableHead>}
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {rows.map((o) => {
            // ⚠️ CarboVAPT não tem NF do Bling e nunca vai ter: sem este desvio
            // a linha oferecia "Criar no Bling" para um serviço.
            const servico = soServico(o.items);
            const nfse = servico ? nfseValida(nfsePorPedido?.[o.id]) : null;
            const nfseTeste = servico ? (nfsePorPedido?.[o.id] ?? []).find((e) => e.ambiente === 2 && e.status === "autorizada") : null;
            const nfsePendente = servico ? (nfsePorPedido?.[o.id] ?? []).find((e) => e.status === "indeterminado") : null;
            const hasNF = servico ? !!nfse : !faltaAlgumaNF(o);
            const nota = servico ? undefined : notas?.[o.id];
            const colSpan = showAction ? 7 : 6;
            // Financeiro defensivo: pedidos antigos podem não ter subtotal/discount.
            const itemsBruto = o.items.reduce((s, it) => s + num(it.quantity) * num(it.unit_price), 0);
            const itemsDesc = o.items.reduce((s, it) => s + num(it.discount_amount), 0);
            const subtotalDet = o.subtotal != null ? num(o.subtotal) : (itemsBruto || null);
            const descontoDet = o.discount != null ? num(o.discount) : itemsDesc;
            const percentDet = o.discount_percent != null
              ? num(o.discount_percent)
              : (subtotalDet && subtotalDet > 0 ? Math.round((descontoDet / subtotalDet) * 10000) / 100 : 0);
            const buyerNotes = o.buyer_notes && o.buyer_notes !== o.notes ? o.buyer_notes : null;
            const generalNotes = o.general_notes && o.general_notes !== o.notes && o.general_notes !== o.buyer_notes ? o.general_notes : null;
            return (
              <Fragment key={o.id}>
                <CarboTableRow
                  interactive
                  className={expandedId === o.id ? "bg-muted/20" : undefined}
                  onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                >
                  <CarboTableCell className="font-medium">{o.order_number}</CarboTableCell>
                  <CarboTableCell>{o.customer_name}</CarboTableCell>
                  <CarboTableCell>{fmtDate(o.sale_date || o.created_at)}</CarboTableCell>
                  <CarboTableCell>{o.vendedor_name || <span className="text-muted-foreground">—</span>}</CarboTableCell>
                  <CarboTableCell className="text-right font-medium">{fmtCurrency(Number(o.total))}</CarboTableCell>
                  <CarboTableCell onClick={(e) => e.stopPropagation()}>
                    {servico ? (
                      nfse ? (
                        <CarboBadge variant="success" className="gap-1" title={nfse.chave_acesso ?? undefined}>
                          <FileText className="h-3 w-3" /> NFS-e {nfse.n_nfse ?? ""}
                        </CarboBadge>
                      ) : nfsePendente ? (
                        <CarboBadge variant="warning" title={nfsePendente.erro ?? undefined}>NFS-e sem resposta</CarboBadge>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <CarboBadge variant="warning">Sem NFS-e</CarboBadge>
                          {nfseTeste && <CarboBadge size="sm" variant="outline" title="Ambiente de teste: não vale como nota">teste ok</CarboBadge>}
                        </div>
                      )
                    ) : (hasNF || (nota && !showAction)) ? (
                      <div className="flex items-center gap-2">
                        {/* A cor vem da SITUAÇÃO da nota, não do fato de existir
                            uma. Antes era `variant="success"` fixo: nota
                            cancelada aparecia verde, igual a faturamento bom.
                            ⚠️ A SÉRIE vai junto do número (pedido do dono do
                            processo, 29/10/2026): a 450 da série 1 e a 450 da
                            série 2 são notas diferentes. */}
                        <CarboBadge
                          variant={(nota ? !notaInvalida(nota) && (o.bling_nf_id || o.bling2_nf_id ? o.nf_valida : true) : o.nf_valida) ? "success" : "destructive"}
                          className="gap-1 whitespace-nowrap"
                          title={[nota?.conta === 2 ? "Filial (Bling 2)" : nota ? "Matriz (Bling 1)" : null, nota?.situacao ?? o.nf_situacao].filter(Boolean).join(" · ") || undefined}
                        >
                          <FileText className="h-3 w-3" /> NF {nota?.numero || o.invoice_number || o.bling_nf_id}
                          {nota?.serie ? <span className="font-normal opacity-80">· série {nota.serie}</span> : null}
                          {!o.nf_valida && o.nf_situacao && !nota ? ` · ${o.nf_situacao}` : ""}
                        </CarboBadge>
                        <BaixarNFButton
                          blingNfId={nota?.blingId ?? (o.bling_nf_id as number)}
                          conta={nota?.conta ?? 1}
                          pdfUrl={nota?.pdf_url}
                          xmlUrl={nota?.xml_url}
                          label="Baixar"
                        />
                      </div>
                    ) : (
                      <CarboBadge variant="warning">Sem NF</CarboBadge>
                    )}
                  </CarboTableCell>
                  {showAction && (
                    <CarboTableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {servico && !hasNF ? (
                        <div className="flex justify-end">
                          <CarboButton size="sm" onClick={() => setToNfse(o.id)}
                            title="NFS-e pelo Portal Nacional">
                            <FileText className="h-3.5 w-3.5 mr-1" /> Emitir NFS-e
                          </CarboButton>
                        </div>
                      ) : hasNF ? (
                        <span className="text-muted-foreground text-sm">Faturado</span>
                      ) : nfUnlocked(o) ? (
                        <div className="flex justify-end">
                          <CarboButton size="sm" onClick={() => setToBling(o)}
                            title={temBonificacao(o.items)
                              ? "Venda e remessa de bonificação"
                              : undefined}>
                            <Receipt className="h-3.5 w-3.5 mr-1" />
                            {temBonificacao(o.items) ? "Criar no Bling (2 notas)" : "Criar no Bling"}
                          </CarboButton>
                        </div>
                      ) : (
                        // Travado: o pedido ainda não chegou em "Gerar NF" no Pós-venda.
                        <span
                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                          title="Aguardando a etapa Gerar NF"
                        >
                          <Lock className="h-3 w-3" /> {stageLabel(o.fulfillment_stage)}
                        </span>
                      )}
                    </CarboTableCell>
                  )}
                </CarboTableRow>

                {expandedId === o.id && (
                  <CarboTableRow className="bg-muted/10 hover:bg-muted/10">
                    <CarboTableCell colSpan={colSpan} className="px-6 py-4 space-y-4">
                      {/* Cliente */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Cliente</p>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                          <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{o.customer_name}</span></div>
                          <div><span className="text-muted-foreground">CNPJ/CPF:</span> <span className="font-medium">{o.cnpj || "—"}</span></div>
                          <div><span className="text-muted-foreground">Inscr. Estadual:</span> <span className="font-medium">{o.customer_ie || "—"}</span></div>
                          <div><span className="text-muted-foreground">Contato:</span> <span className="font-medium">{[o.customer_email, o.customer_phone].filter(Boolean).join(" · ") || "—"}</span></div>
                        </div>
                      </div>

                      {/* Endereços */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Endereço de Entrega</p>
                          <p className="text-xs">{fmtEntrega(o) || <span className="text-muted-foreground">—</span>}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Endereço de Faturamento (NF)</p>
                          <p className="text-xs">{o.billing_address ? (fmtFaturamento(o.billing_address) || <span className="text-muted-foreground">Mesmo da entrega</span>) : <span className="text-muted-foreground">Mesmo da entrega</span>}</p>
                        </div>
                      </div>

                      {/* NF */}
                      {(nota || o.invoice_number || o.bling_nf_id) && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Nota Fiscal: </span>
                          <span className="font-medium">{nota?.numero || o.invoice_number || `#${o.bling_nf_id}`}</span>
                          {nota?.serie && <span className="text-muted-foreground"> · série {nota.serie}</span>}
                          {nota && <span className="text-muted-foreground"> · {nota.conta === 2 ? "filial (Bling 2)" : "matriz (Bling 1)"}</span>}
                          {!o.nf_valida && o.nf_situacao && (
                            <span className="ml-1.5 font-semibold text-destructive">{o.nf_situacao}</span>
                          )}
                        </div>
                      )}

                      {/* Produtos */}
                      <div>
                        <div className="flex items-center gap-2 mb-2"><Package className="h-3.5 w-3.5 text-muted-foreground" /><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produtos</p></div>
                        {o.items.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem itens.</p>
                        ) : (
                          <div className="grid gap-1.5">
                            {o.items.map((item, idx) => {
                              const bruto = num(item.quantity) * num(item.unit_price);
                              const desc = num(item.discount_amount);
                              const liquido = item.total != null ? num(item.total) : bruto - desc;
                              const descLabel = desc > 0
                                ? (item.discount_type === "percent" && bruto > 0
                                    ? `− ${(Math.round((desc / bruto) * 10000) / 100)}%`
                                    : `− ${fmtCurrency(desc)}`)
                                : null;
                              return (
                                <div key={idx} className="flex items-start justify-between gap-3 text-xs">
                                  <div className="min-w-0">
                                    <span className="font-medium">{item.name}</span>
                                    {num(item.bonus_quantity) > 0 && (
                                      <span className="ml-1.5 text-[10px] font-semibold text-carbo-green border border-carbo-green/30 rounded px-1">+{num(item.bonus_quantity)} bonif.</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-muted-foreground whitespace-nowrap">
                                    <span>{num(item.quantity)} × {fmtCurrency(num(item.unit_price))}</span>
                                    {descLabel && <span className="text-destructive">{descLabel}</span>}
                                    <span className="font-semibold text-foreground">{fmtCurrency(liquido)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Resumo financeiro */}
                      <div className="flex justify-end">
                        <div className="w-full sm:w-64 space-y-0.5 text-xs">
                          {subtotalDet != null && (
                            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtCurrency(subtotalDet)}</span></div>
                          )}
                          {descontoDet > 0 && (
                            <div className="flex justify-between text-destructive"><span>Desconto{percentDet > 0 ? ` (${percentDet}%)` : ""}</span><span className="tabular-nums">− {fmtCurrency(descontoDet)}</span></div>
                          )}
                          <div className="flex justify-between border-t pt-0.5 font-bold text-sm"><span>Total</span><span className="tabular-nums">{fmtCurrency(num(o.total))}</span></div>
                        </div>
                      </div>

                      {/* Pagamento e frete */}
                      {(o.payment_terms || o.freight_type || (o.shipping_cost ?? 0) > 0) && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pagamento</p>
                          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                            {o.payment_terms && <div><span className="text-muted-foreground">Forma/condição:</span> <span className="font-medium">{o.payment_terms}</span></div>}
                            {(o.freight_type || (o.shipping_cost ?? 0) > 0) && (
                              <div><span className="text-muted-foreground">Frete:</span> <span className="font-medium">{[o.freight_type, (o.shipping_cost ?? 0) > 0 ? fmtCurrency(num(o.shipping_cost)) : null].filter(Boolean).join(" · ") || "—"}</span></div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Expedição — vem do Rastreio de venda (Ops). É o que o
                          Financeiro confere contra a NF: volumes e peso bruto
                          vão no corpo da nota, transportadora no transporte.
                          Os campos aparecem SEMPRE, mesmo vazios: sumir faria
                          quem confere achar que a tela não mostra esse dado, em
                          vez de saber que ele ainda não foi preenchido. */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Expedição</p>
                        <div className="grid sm:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                          <div>
                            <span className="text-muted-foreground">Volumes:</span>{" "}
                            {o.shipment_volumes != null
                              ? <span className="font-medium">{o.shipment_volumes}</span>
                              : <span className="text-muted-foreground/70 italic">não informado</span>}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Peso bruto:</span>{" "}
                            {o.shipment_weight_kg != null
                              ? <span className="font-medium">
                                  {num(o.shipment_weight_kg).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg
                                </span>
                              : <span className="text-muted-foreground/70 italic">não informado</span>}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Transportadora:</span>{" "}
                            {o.shipment_carrier
                              ? <span className="font-medium">{o.shipment_carrier}</span>
                              : <span className="text-muted-foreground/70 italic">não informada</span>}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cotação do frete:</span>{" "}
                            {(o.shipment_quote_value ?? 0) > 0
                              ? <span className="font-medium">{fmtCurrency(num(o.shipment_quote_value))}</span>
                              : <span className="text-muted-foreground/70 italic">não informada</span>}
                          </div>
                        </div>
                      </div>

                      {/* Prazo de entrega */}
                      {(o.agreed_delivery_date || o.ppf_date || o.ppe_date) && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Prazo de Entrega</p>
                          <div className="grid sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                            {o.agreed_delivery_date && <div><span className="text-muted-foreground">Combinada:</span> <span className="font-medium">{fmtDate(o.agreed_delivery_date)}</span></div>}
                            {o.ppf_date && <div><span className="text-muted-foreground">Fabricar até (PPF):</span> <span className="font-medium">{fmtDate(o.ppf_date)}</span></div>}
                            {o.ppe_date && <div><span className="text-muted-foreground">Expedir até (PPE):</span> <span className="font-medium">{fmtDate(o.ppe_date)}</span></div>}
                          </div>
                        </div>
                      )}

                      {/* Vendedor / Nº pedido de compra do cliente */}
                      {(o.vendedor_name || o.po_number) && (
                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                          {o.vendedor_name && <div><span className="text-muted-foreground">Vendedor:</span> <span className="font-medium">{o.vendedor_name}</span></div>}
                          {o.po_number && <div><span className="text-muted-foreground">Nº pedido de compra (cliente):</span> <span className="font-medium">{o.po_number}</span></div>}
                        </div>
                      )}

                      {/* Observações */}
                      {(o.notes || buyerNotes || generalNotes) && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observações</p>
                          {o.notes && <p className="text-xs">{o.notes}</p>}
                          {buyerNotes && <p className="text-xs"><span className="text-muted-foreground">Comprador:</span> {buyerNotes}</p>}
                          {generalNotes && <p className="text-xs"><span className="text-muted-foreground">Gerais:</span> {generalNotes}</p>}
                        </div>
                      )}
                    </CarboTableCell>
                  </CarboTableRow>
                )}
              </Fragment>
            );
          })}
        </CarboTableBody>
      </CarboTable>
    );
  }

  return (
    <div>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CarboPageHeader
            title="Faturamento"
            icon={Receipt}
          />
          {/* Configuração feita UMA vez. Fica aqui, e não numa tela de ajustes
              escondida, porque quem precisa dela é quem está olhando esta fila
              e não conseguiu enviar um pedido com brinde. */}
          <Button variant="outline" size="sm" className="gap-1.5"
            onClick={() => setNaturezaOpen(true)}>
            <Gift className="h-3.5 w-3.5" /> Natureza da bonificação
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <CarboKPI title="Vendas do sistema" value={sistema.length} icon={Building2} iconColor="green" />
          <CarboKPI title="Valor (sistema)" value={fmtCurrency(soma(sistema))} icon={DollarSign} iconColor="green" />
          <CarboKPI title="Do Bling" value={bling.length} icon={Store} iconColor="warning" />
          <CarboKPI title="Valor (Bling)" value={fmtCurrency(soma(bling))} icon={DollarSign} iconColor="warning" />
        </div>

        {/* Controles */}
        <CarboCard>
          <CarboCardContent className="pt-6 flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-4">
            <div className="flex items-center gap-2">
              <CarboButton variant="outline" size="icon" onClick={() => changeMonth(-1)} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></CarboButton>
              {/* Com busca, o mês NÃO vale (a busca vasculha todo o histórico) —
                  e a tela diz isso, senão o "Out / 2026" fixo dá a entender
                  que o resultado é só daquele mês. */}
              <span className={`min-w-28 text-center font-medium ${search.trim() ? "text-muted-foreground line-through" : ""}`}>
                {MONTHS[month.getMonth()]} / {month.getFullYear()}
              </span>
              <CarboButton variant="outline" size="icon" onClick={() => changeMonth(1)} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></CarboButton>
            </div>
            <div className="flex-1 lg:min-w-48">
              <CarboSearchInput placeholder="Buscar cliente, CNPJ/CPF, pedido ou NF…" value={search} onChange={(e) => { setSearch(e.target.value); resetPages(); }} />
            </div>
            {search.trim() && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">Buscando em todos os meses</span>
            )}
            <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
              <Switch checked={showAll} onCheckedChange={setShowAll} /> Mostrar já faturados
            </label>
          </CarboCardContent>
        </CarboCard>

        {/* Abas: sistema vs Bling vs vínculo de NFs vs todas as NFs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="sistema" className="gap-2"><Building2 className="h-4 w-4" /> Vendas do sistema ({sistema.length})</TabsTrigger>
            <TabsTrigger value="bling" className="gap-2"><Store className="h-4 w-4" /> Do Bling ({bling.length})</TabsTrigger>
            <TabsTrigger value="online" className="gap-2"><Globe className="h-4 w-4" /> NF Online ({online.length})</TabsTrigger>
            <TabsTrigger value="vincular" className="gap-2"><Link2 className="h-4 w-4" /> Vincular NFs</TabsTrigger>
            {/* ⚠️ Aba PRÓPRIA da filial, não um filtro dentro da de cima. As
                duas contas Bling numeram do zero: `bling_id` de uma não
                significa nada na outra, e uma lista só faria alguém vincular a
                nota da empresa errada ao pedido — sem erro nenhum, porque os
                dois números existem. */}
            <TabsTrigger value="vincular-filial" className="gap-2"><Link2 className="h-4 w-4" /> Vincular NFs (filial)</TabsTrigger>
            <TabsTrigger value="todas" className="gap-2"><Files className="h-4 w-4" /> Todas as NFs</TabsTrigger>
          </TabsList>

          <TabsContent value="sistema" className="mt-4">
            <CarboCard><CarboCardContent className="pt-6">
              <Tabela rows={sistPag.slice} showAction />
              <Pager page={sistPag.safePage} pageCount={sistPag.pageCount} total={sistema.length} onPage={setPSist} />
            </CarboCardContent></CarboCard>
          </TabsContent>

          <TabsContent value="online" className="mt-4">
            <CarboCard><CarboCardContent className="pt-6">
              <Tabela rows={onlinePag.slice} showAction={false} />
              <Pager page={onlinePag.safePage} pageCount={onlinePag.pageCount} total={online.length} onPage={setPOnline} />
            </CarboCardContent></CarboCard>
          </TabsContent>

          <TabsContent value="bling" className="mt-4">
            <CarboCard><CarboCardContent className="pt-6">
              <Tabela rows={blingPag.slice} showAction={false} />
              <Pager page={blingPag.safePage} pageCount={blingPag.pageCount} total={bling.length} onPage={setPBling} />
            </CarboCardContent></CarboCard>
          </TabsContent>

          <TabsContent value="vincular" className="mt-4">
            <VincularNFsTab />
          </TabsContent>

          <TabsContent value="vincular-filial" className="mt-4">
            <VincularNFsFilialTab />
          </TabsContent>

          <TabsContent value="todas" className="mt-4">
            <TodasNFsTab />
          </TabsContent>
        </Tabs>
      </div>

      <BlingConfirmDialog order={toBling} onOpenChange={(open) => { if (!open) setToBling(null); }} />
      <NfseEmitirDialog orderId={toNfse} onOpenChange={(open) => { if (!open) setToNfse(null); }} />
      <NaturezaBonificacaoDialog open={naturezaOpen} onOpenChange={setNaturezaOpen} />
    </div>
  );
}
