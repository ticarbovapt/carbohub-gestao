import { useMemo, useState } from "react";
import {
  Receipt, FileText, ChevronLeft, ChevronRight, CheckCircle2, DollarSign, Store, Building2, Lock, Link2,
} from "lucide-react";
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
  type FaturamentoOrder,
} from "@/hooks/useFaturamento";
import { BlingConfirmDialog } from "@/components/faturamento/BlingConfirmDialog";
import { BaixarNFButton } from "@/components/faturamento/BaixarNFButton";
import { VincularNFsTab } from "@/components/faturamento/VincularNFsTab";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

// Origem do pedido: veio do Bling (external_ref bling-…) ou nasceu no sistema.
const isBling = (o: FaturamentoOrder) =>
  (o.external_ref ?? "").toLowerCase().startsWith("bling") ||
  (o.order_number ?? "").toUpperCase().startsWith("BLING-");

// Duplicado: um pedido criado no Bling que traz na observação (notes) o nº de
// uma venda do sistema (V…). É o MESMO pedido — a NF vai casar com a venda do
// sistema (por esse código), então escondemos o registro do Bling pra não
// aparecer duas vezes nem contar o valor em dobro. O código V… só é gerado pelo
// sistema, então a presença dele já identifica o duplicado (independe do mês).
const SYSTEM_CODE_RE = /V\d{10}/i;
const isBlingDupOfSystem = (o: FaturamentoOrder) =>
  isBling(o) && SYSTEM_CODE_RE.test(o.notes ?? "");

// Funil do Pós-venda (Carbo Ops). O Faturamento só libera a emissão da NF quando
// o card chega em "gerar_nf" (ou além). Antes disso o pedido aparece na lista,
// mas o botão fica travado mostrando em que etapa do pós-venda ele está.
const STAGE_ORDER = [
  "nova_venda", "separacao_pendente", "criar_op", "separando", "separado",
  "gerar_nf", "nf_finalizada", "em_transporte", "entregue",
];
const STAGE_LABELS: Record<string, string> = {
  nova_venda: "Nova Venda", separacao_pendente: "Pedido Recebido", criar_op: "Criar OP",
  separando: "Em Separação", separado: "Separado", gerar_nf: "Gerar NF",
  nf_finalizada: "NF Finalizada", em_transporte: "Em Transporte", entregue: "Entregue",
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
  const [month, setMonth] = useState(() => new Date());
  const [search, setSearch] = useState("");
  // Padrão: mostra TODOS os pedidos do mês (com e sem NF) — é uma tela de
  // rastreabilidade/faturamento. Desligar "Mostrar já faturados" filtra para
  // ver só os pendentes (sem NF vinculada).
  const [showAll, setShowAll] = useState(true);

  const { data: orders, isLoading } = useFaturamento({ month, search, showAll });
  // Pedido em confirmação: abre o diálogo que mostra o que vai pro Bling (inclui
  // o pré-cadastro do cliente, se for novo) para o financeiro conferir e confirmar.
  const [toBling, setToBling] = useState<FaturamentoOrder | null>(null);

  // Remove os pedidos do Bling que são duplicata de uma venda do sistema (V… na
  // observação) — some da lista, some dos KPIs, some da contagem das abas.
  const list = useMemo(() => (orders ?? []).filter((o) => !isBlingDupOfSystem(o)), [orders]);
  const sistema = useMemo(() => list.filter((o) => !isBling(o)), [list]);
  const bling = useMemo(() => list.filter(isBling), [list]);
  const soma = (rows: FaturamentoOrder[]) => rows.reduce((s, o) => s + Number(o.total || 0), 0);

  const changeMonth = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

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
      <CarboTable>
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
            const hasNF = !!o.bling_nf_id;
            return (
              <CarboTableRow key={o.id}>
                <CarboTableCell className="font-medium">{o.order_number}</CarboTableCell>
                <CarboTableCell>{o.customer_name}</CarboTableCell>
                <CarboTableCell>{fmtDate(o.sale_date || o.created_at)}</CarboTableCell>
                <CarboTableCell>{o.vendedor_name || <span className="text-muted-foreground">—</span>}</CarboTableCell>
                <CarboTableCell className="text-right font-medium">{fmtCurrency(Number(o.total))}</CarboTableCell>
                <CarboTableCell>
                  {hasNF ? (
                    <div className="flex items-center gap-2">
                      <CarboBadge variant="success" className="gap-1"><FileText className="h-3 w-3" /> NF {o.invoice_number || o.bling_nf_id}</CarboBadge>
                      <BaixarNFButton blingNfId={o.bling_nf_id as number} label="Baixar" />
                    </div>
                  ) : (
                    <CarboBadge variant="warning">Sem NF</CarboBadge>
                  )}
                </CarboTableCell>
                {showAction && (
                  <CarboTableCell className="text-right">
                    {hasNF ? (
                      <span className="text-muted-foreground text-sm">Faturado</span>
                    ) : nfUnlocked(o) ? (
                      <div className="flex justify-end">
                        <CarboButton size="sm" onClick={() => setToBling(o)}>
                          <Receipt className="h-3.5 w-3.5 mr-1" /> Criar no Bling
                        </CarboButton>
                      </div>
                    ) : (
                      // Travado: o pedido ainda não chegou em "Gerar NF" no Pós-venda.
                      <span
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                        title="Libera quando o pedido chegar em 'Gerar Nota Fiscal' no Pós-venda (Carbo Ops)."
                      >
                        <Lock className="h-3 w-3" /> {stageLabel(o.fulfillment_stage)}
                      </span>
                    )}
                  </CarboTableCell>
                )}
              </CarboTableRow>
            );
          })}
        </CarboTableBody>
      </CarboTable>
    );
  }

  return (
    <div>
      <div className="space-y-6">
        <CarboPageHeader
          title="Faturamento"
          description="Vendas do sistema prontas para faturar + pedidos criados direto no Bling (rastreabilidade)"
          icon={Receipt}
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CarboKPI title="Vendas do sistema" value={sistema.length} icon={Building2} iconColor="green" />
          <CarboKPI title="Valor (sistema)" value={fmtCurrency(soma(sistema))} icon={DollarSign} iconColor="green" />
          <CarboKPI title="Do Bling" value={bling.length} icon={Store} iconColor="warning" />
          <CarboKPI title="Valor (Bling)" value={fmtCurrency(soma(bling))} icon={DollarSign} iconColor="warning" />
        </div>

        {/* Controles */}
        <CarboCard>
          <CarboCardContent className="pt-6 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-2">
              <CarboButton variant="outline" size="icon" onClick={() => changeMonth(-1)} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></CarboButton>
              <span className="min-w-28 text-center font-medium">{MONTHS[month.getMonth()]} / {month.getFullYear()}</span>
              <CarboButton variant="outline" size="icon" onClick={() => changeMonth(1)} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></CarboButton>
            </div>
            <div className="flex-1 min-w-48">
              <CarboSearchInput placeholder="Buscar por cliente ou nº do pedido (busca global)…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
              <Switch checked={showAll} onCheckedChange={setShowAll} /> Mostrar já faturados
            </label>
          </CarboCardContent>
        </CarboCard>

        {/* Abas: sistema vs Bling vs vínculo de NFs */}
        <Tabs defaultValue="sistema">
          <TabsList>
            <TabsTrigger value="sistema" className="gap-2"><Building2 className="h-4 w-4" /> Vendas do sistema ({sistema.length})</TabsTrigger>
            <TabsTrigger value="bling" className="gap-2"><Store className="h-4 w-4" /> Do Bling ({bling.length})</TabsTrigger>
            <TabsTrigger value="vincular" className="gap-2"><Link2 className="h-4 w-4" /> Vincular NFs</TabsTrigger>
          </TabsList>

          <TabsContent value="sistema" className="mt-4">
            <CarboCard><CarboCardContent className="pt-6"><Tabela rows={sistema} showAction /></CarboCardContent></CarboCard>
            <p className="text-xs text-muted-foreground mt-3">
              Fluxo: <strong>Criar no Bling</strong> envia o pedido pro Bling (o nº <code>V…</code> vai na observação) e abre o Bling
              pra você conferir e emitir a NF-e. A sincronização casa a NF ao pedido pela observação — o pedido continua aqui como
              <strong> Faturado</strong> (com a NF pra baixar). Desligue <em>“Mostrar já faturados”</em> pra ver só os pendentes.
            </p>
          </TabsContent>

          <TabsContent value="bling" className="mt-4">
            <CarboCard><CarboCardContent className="pt-6"><Tabela rows={bling} showAction={false} /></CarboCardContent></CarboCard>
            <p className="text-xs text-muted-foreground mt-3">
              Pedidos criados <strong>direto no Bling</strong> (não nasceram de uma venda do sistema) e vendas do sistema já enviadas
              ao Bling — ficam aqui para rastreabilidade. <strong>Sem NF</strong> = a nota ainda não foi emitida no Bling (só existe o
              pedido de venda). Quando a NF é emitida com o <code>V…</code> na observação, ela casa automaticamente e o pedido passa a
              mostrar a NF pra baixar. Desligue <em>“Mostrar já faturados”</em> pra ver só os que ainda estão sem NF.
            </p>
          </TabsContent>

          <TabsContent value="vincular" className="mt-4">
            <VincularNFsTab />
          </TabsContent>
        </Tabs>
      </div>

      <BlingConfirmDialog order={toBling} onOpenChange={(open) => { if (!open) setToBling(null); }} />
    </div>
  );
}
