import { useMemo, useState } from "react";
import {
  Receipt, FileText, ChevronLeft, ChevronRight, Loader2, Eye, CheckCircle2, Clock, DollarSign, Store, Building2,
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
import { toast } from "sonner";
import {
  useFaturamento,
  useCreateBlingPedido,
  usePreviewBlingPedido,
  type FaturamentoOrder,
} from "@/hooks/useFaturamento";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

// Origem do pedido: veio do Bling (external_ref bling-…) ou nasceu no sistema.
const isBling = (o: FaturamentoOrder) =>
  (o.external_ref ?? "").toLowerCase().startsWith("bling") ||
  (o.order_number ?? "").toUpperCase().startsWith("BLING-");

export default function Faturamento() {
  const [month, setMonth] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const { data: orders, isLoading } = useFaturamento({ month, search, showAll });
  const createBling = useCreateBlingPedido();
  const preview = usePreviewBlingPedido();

  const list = orders ?? [];
  const sistema = useMemo(() => list.filter((o) => !isBling(o)), [list]);
  const bling = useMemo(() => list.filter(isBling), [list]);
  const soma = (rows: FaturamentoOrder[]) => rows.reduce((s, o) => s + Number(o.total || 0), 0);

  const changeMonth = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const handlePreview = async (o: FaturamentoOrder) => {
    try {
      const p = await preview.mutateAsync(o.id);
      const itens = (p.items_summary || []).map((i) => `${i.matched ? "✓" : "⚠"} ${i.name}`).join("\n");
      const warns = (p.warnings || []).length ? `\n\n⚠ ${p.warnings.join("\n⚠ ")}` : "";
      toast.message(`Pré-visualização — ${p.order_number}`, {
        description: `Contato no Bling: ${p.contact_found ? "encontrado" : "NÃO encontrado"}\nItens:\n${itens}${warns}`,
        duration: 10000,
      });
    } catch { /* erro tratado no hook */ }
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
            const creating = createBling.isPending && createBling.variables === o.id;
            const previewing = preview.isPending && preview.variables === o.id;
            return (
              <CarboTableRow key={o.id}>
                <CarboTableCell className="font-medium">{o.order_number}</CarboTableCell>
                <CarboTableCell>{o.customer_name}</CarboTableCell>
                <CarboTableCell>{fmtDate(o.sale_date || o.created_at)}</CarboTableCell>
                <CarboTableCell>{o.vendedor_name || <span className="text-muted-foreground">—</span>}</CarboTableCell>
                <CarboTableCell className="text-right font-medium">{fmtCurrency(Number(o.total))}</CarboTableCell>
                <CarboTableCell>
                  {hasNF
                    ? <CarboBadge variant="success" className="gap-1"><FileText className="h-3 w-3" /> NF {o.invoice_number || o.bling_nf_id}</CarboBadge>
                    : <CarboBadge variant="warning">Sem NF</CarboBadge>}
                </CarboTableCell>
                {showAction && (
                  <CarboTableCell className="text-right">
                    {hasNF ? (
                      <span className="text-muted-foreground text-sm">Faturado</span>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <CarboButton variant="ghost" size="sm" disabled={previewing || creating} onClick={() => handlePreview(o)}>
                          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                        </CarboButton>
                        <CarboButton size="sm" disabled={creating} onClick={() => createBling.mutate(o.id)}>
                          {creating ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Enviando…</> : <><Receipt className="h-3.5 w-3.5 mr-1" /> Criar no Bling</>}
                        </CarboButton>
                      </div>
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
    <div className="p-4 md:p-6">
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

        {/* Abas: sistema vs Bling */}
        <Tabs defaultValue="sistema">
          <TabsList>
            <TabsTrigger value="sistema" className="gap-2"><Building2 className="h-4 w-4" /> Vendas do sistema ({sistema.length})</TabsTrigger>
            <TabsTrigger value="bling" className="gap-2"><Store className="h-4 w-4" /> Do Bling ({bling.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="sistema" className="mt-4">
            <CarboCard><CarboCardContent className="pt-6"><Tabela rows={sistema} showAction /></CarboCardContent></CarboCard>
            <p className="text-xs text-muted-foreground mt-3">
              Fluxo: <strong>Criar no Bling</strong> envia o pedido pro Bling (o nº <code>V…</code> vai na observação) e abre o Bling
              pra você conferir e emitir a NF-e. A sincronização casa a NF ao pedido pela observação e ele sai da fila — com o vendedor já vinculado.
            </p>
          </TabsContent>

          <TabsContent value="bling" className="mt-4">
            <CarboCard><CarboCardContent className="pt-6"><Tabela rows={bling} showAction={false} /></CarboCardContent></CarboCard>
            <p className="text-xs text-muted-foreground mt-3">
              Pedidos criados <strong>direto no Bling</strong> (não nasceram de uma venda do sistema). Ficam aqui para rastreabilidade
              de valores. Quando a NF de uma venda do sistema é emitida com o <code>V…</code> na observação, ela casa automaticamente e
              deixa de aparecer aqui. Os que sobram foram feitos por fora — o que é normal.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
