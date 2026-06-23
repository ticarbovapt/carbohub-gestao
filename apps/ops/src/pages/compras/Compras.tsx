import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Wallet, Plus, FileText, Package, Receipt, CreditCard, BarChart3, Clock, AlertTriangle,
  CheckCircle2, Building2, Check, X, Eye, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { NovaRequisicaoDialog } from "@/components/compras/NovaRequisicaoDialog";
import { RCDetailsDialog, type RCLite } from "@/components/compras/RCDetailsDialog";
import { RCAprovarDialog } from "@/components/compras/RCAprovarDialog";
import { RCRejeitarDialog } from "@/components/compras/RCRejeitarDialog";
import { RecebimentoDialog } from "@/components/compras/RecebimentoDialog";
import { SupplierFormDialog } from "@/components/producao/SupplierFormDialog";
import { useRcRequests, useRcMutations } from "@/hooks/useRcRequests";
import { usePurchaseOrders, useGenerateOc, OC_STATUS_LABELS, OC_STATUS_VARIANT } from "@/hooks/usePurchaseOrders";
import { usePurchaseReceivings, RECV_STATUS_LABELS, RECV_STATUS_VARIANT } from "@/hooks/usePurchaseReceivings";
import { useSuppliers } from "@/hooks/useSuppliers";

// Tela de COMPRAS: pipeline Requisição → OC → Recebimento (ligado a purchase_*).
// Abas Notas Fiscais e Contas a Pagar dependem do financeiro (próxima fase).

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const dt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

// Requisições de Compra (RC)
type RcStatus = "rascunho" | "aguardando_aprovacao" | "aprovada" | "rejeitada" | "cancelada";
const RC_STATUS_LABELS: Record<RcStatus, string> = {
  rascunho: "Rascunho", aguardando_aprovacao: "Aguardando Aprovação", aprovada: "Aprovada", rejeitada: "Rejeitada", cancelada: "Cancelada",
};
const RC_STATUS_VARIANT: Record<RcStatus, "secondary" | "warning" | "success" | "destructive"> = {
  rascunho: "secondary", aguardando_aprovacao: "warning", aprovada: "success", rejeitada: "destructive", cancelada: "secondary",
};
interface SimpleRow { id: string; col1: string; col2: string; col3: string; valor: number; status: string; statusVariant: "secondary" | "warning" | "success" | "destructive" | "info"; }

function KpiCard({ icon: Icon, label, value, color }: { icon: typeof Clock; label: string; value: string; color: string }) {
  return (
    <CarboCard variant="kpi" padding="sm">
      <CarboCardContent>
        <div className="flex items-center gap-2 mb-1"><Icon className={`h-4 w-4 ${color}`} /><span className="text-xs text-muted-foreground">{label}</span></div>
        <p className="text-2xl font-bold">{value}</p>
      </CarboCardContent>
    </CarboCard>
  );
}

function SimpleTable({ headers, rows, showValor = true }: { headers: string[]; rows: SimpleRow[]; showValor?: boolean }) {
  if (rows.length === 0) return <CarboEmptyState title="Nenhum registro" />;
  return (
    <div className="overflow-x-auto">
      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            {headers.map((h) => <CarboTableHead key={h}>{h}</CarboTableHead>)}
            {showValor && <CarboTableHead className="text-right">Valor</CarboTableHead>}
            <CarboTableHead>Status</CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {rows.map((r) => (
            <CarboTableRow key={r.id}>
              <CarboTableCell className="font-mono text-sm font-medium">{r.col1}</CarboTableCell>
              <CarboTableCell>{r.col2}</CarboTableCell>
              <CarboTableCell className="text-sm text-muted-foreground">{r.col3}</CarboTableCell>
              {showValor && <CarboTableCell className="text-right font-semibold">{r.valor ? brl(r.valor) : "—"}</CarboTableCell>}
              <CarboTableCell><CarboBadge variant={r.statusVariant} dot>{r.status}</CarboBadge></CarboTableCell>
            </CarboTableRow>
          ))}
        </CarboTableBody>
      </CarboTable>
    </div>
  );
}

export default function Compras() {
  const canSeeDashboard = true;
  const [activeTab, setActiveTab] = useState("requisicoes");
  const [novaOpen, setNovaOpen] = useState(false);
  const [detailRc, setDetailRc] = useState<RCLite | null>(null);
  const [aprovarRc, setAprovarRc] = useState<{ id: string; number: string } | null>(null);
  const [rejeitarRc, setRejeitarRc] = useState<{ id: string; number: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [recebOpen, setRecebOpen] = useState(false);
  const [fornecedorOpen, setFornecedorOpen] = useState(false);

  const { data: rcs = [], isLoading: rcLoading } = useRcRequests();
  const { approve, reject } = useRcMutations();
  const { data: orders = [] } = usePurchaseOrders();
  const generateOc = useGenerateOc();
  const { data: receivings = [] } = usePurchaseReceivings();
  const { data: suppliers = [] } = useSuppliers();

  const filteredRcs = rcs.filter((rc) => statusFilter === "all" || rc.status === statusFilter);
  const rcPendentes = rcs.filter((rc) => rc.status === "aguardando_aprovacao").length;
  const openOrders = orders.filter((o) => o.status !== "recebida" && o.status !== "cancelada");
  const ocAbertas = openOrders.length;
  const comprometido = openOrders.reduce((s, o) => s + (o.total_value || 0), 0);
  const ocRows: SimpleRow[] = orders.map((o) => ({
    id: o.id, col1: o.oc_number, col2: o.supplier_name, col3: `${o.itens_count} ${o.itens_count === 1 ? "item" : "itens"}`,
    valor: o.total_value, status: OC_STATUS_LABELS[o.status], statusVariant: OC_STATUS_VARIANT[o.status],
  }));
  const recebRows: SimpleRow[] = receivings.map((r) => ({
    id: r.id, col1: r.received_at ? dt(r.received_at) : "—", col2: r.oc_number, col3: r.supplier_name,
    valor: 0, status: RECV_STATUS_LABELS[r.status], statusVariant: RECV_STATUS_VARIANT[r.status],
  }));

  const handleGerarOc = async (rc: { id: string; rc_number: string }) => {
    try {
      await generateOc.mutateAsync(rc.id);
      toast.success(`OC gerada a partir da ${rc.rc_number}.`);
      setActiveTab("ordens");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a OC.");
    }
  };
  const fornRows: SimpleRow[] = suppliers.map((s) => ({
    id: s.id, col1: s.legal_name || "—", col2: s.cnpj, col3: s.category || "—", valor: 0,
    status: s.status === "active" ? "Ativo" : "Inativo", statusVariant: s.status === "active" ? "success" : "secondary",
  }));

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Compras"
          description="Requisições, ordens de compra, recebimento, notas fiscais e contas a pagar"
          icon={Wallet}
          actions={<Button onClick={() => setNovaOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova Requisição</Button>}
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <KpiCard icon={Clock} label="RC Pendentes" value={String(rcPendentes)} color="text-warning" />
          <KpiCard icon={Package} label="OC Abertas" value={String(ocAbertas)} color="text-carbo-blue" />
          <KpiCard icon={AlertTriangle} label="Pgtos Atrasados" value="—" color="text-muted-foreground" />
          <KpiCard icon={BarChart3} label="Comprometido (OCs)" value={brl(comprometido)} color="text-carbo-green" />
          <KpiCard icon={CreditCard} label="A Pagar" value="—" color="text-muted-foreground" />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="requisicoes" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Requisições</TabsTrigger>
            <TabsTrigger value="ordens" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Ordens de Compra</TabsTrigger>
            <TabsTrigger value="recebimento" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Recebimento</TabsTrigger>
            <TabsTrigger value="notas" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> Notas Fiscais</TabsTrigger>
            <TabsTrigger value="fornecedores" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Fornecedores</TabsTrigger>
            {canSeeDashboard && <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Dashboard</TabsTrigger>}
          </TabsList>

          {/* Requisições — núcleo: aprovação do financeiro */}
          <TabsContent value="requisicoes" className="mt-4">
            <div className="flex items-center gap-3 mb-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(RC_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {rcLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
            ) : filteredRcs.length === 0 ? <CarboEmptyState title="Nenhuma requisição" description={rcs.length === 0 ? 'Crie a primeira em "Nova Requisição".' : "Ajuste o filtro de status."} /> : (
            <div className="overflow-x-auto">
              <CarboTable>
                <CarboTableHeader>
                  <CarboTableRow>
                    <CarboTableHead>Nº RC</CarboTableHead><CarboTableHead>Centro de Custo</CarboTableHead><CarboTableHead>Tipo</CarboTableHead>
                    <CarboTableHead className="text-right">Valor Estimado</CarboTableHead><CarboTableHead>Status</CarboTableHead><CarboTableHead>Data</CarboTableHead><CarboTableHead>Ações</CarboTableHead>
                  </CarboTableRow>
                </CarboTableHeader>
                <CarboTableBody>
                  {filteredRcs.map((rc) => (
                    <CarboTableRow key={rc.id}>
                      <CarboTableCell className="font-mono font-medium">{rc.rc_number}</CarboTableCell>
                      <CarboTableCell>{rc.cost_center}</CarboTableCell>
                      <CarboTableCell className="text-sm text-muted-foreground">{rc.tipo}</CarboTableCell>
                      <CarboTableCell className="text-right font-semibold">{brl(rc.valor)}</CarboTableCell>
                      <CarboTableCell><CarboBadge variant={RC_STATUS_VARIANT[rc.status]} dot>{RC_STATUS_LABELS[rc.status]}</CarboBadge></CarboTableCell>
                      <CarboTableCell className="text-sm text-muted-foreground">{dt(rc.data)}</CarboTableCell>
                      <CarboTableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailRc({ rc_number: rc.rc_number, cost_center: rc.cost_center, tipo: rc.tipo, valor: rc.valor, statusLabel: RC_STATUS_LABELS[rc.status], statusVariant: RC_STATUS_VARIANT[rc.status], items: rc.items, suggested_supplier: rc.suggested_supplier, data: rc.data })}><Eye className="h-4 w-4" /></Button>
                          {rc.status === "aguardando_aprovacao" && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => setAprovarRc({ id: rc.id, number: rc.rc_number })} title="Aprovar"><Check className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRejeitarRc({ id: rc.id, number: rc.rc_number })} title="Rejeitar"><X className="h-4 w-4" /></Button>
                            </>
                          )}
                          {rc.status === "aprovada" && !rc.has_oc && (
                            <Button variant="outline" size="sm" className="h-8 gap-1" disabled={generateOc.isPending} onClick={() => handleGerarOc(rc)} title="Gerar Ordem de Compra"><Package className="h-3.5 w-3.5" /> Gerar OC</Button>
                          )}
                          {rc.status === "aprovada" && rc.has_oc && (
                            <CarboBadge variant="success" dot>OC gerada</CarboBadge>
                          )}
                        </div>
                      </CarboTableCell>
                    </CarboTableRow>
                  ))}
                </CarboTableBody>
              </CarboTable>
            </div>
            )}
          </TabsContent>

          <TabsContent value="ordens" className="mt-4"><SimpleTable headers={["Nº OC", "Fornecedor", "Itens"]} rows={ocRows} /></TabsContent>
          <TabsContent value="recebimento" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setRecebOpen(true)} className="gap-1.5"><CheckCircle2 className="h-4 w-4" /> Conferir Recebimento</Button>
            </div>
            <SimpleTable headers={["Data", "OC", "Fornecedor"]} rows={recebRows} showValor={false} />
          </TabsContent>
          <TabsContent value="notas" className="mt-4">
            <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Notas Fiscais dependem da integração com o Bling — entram numa fase futura.</p>
            </CarboCardContent></CarboCard>
          </TabsContent>
          <TabsContent value="fornecedores" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setFornecedorOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Novo Fornecedor</Button>
            </div>
            <SimpleTable headers={["Fornecedor", "CNPJ", "Categoria"]} rows={fornRows} showValor={false} />
          </TabsContent>
          {canSeeDashboard && (
            <TabsContent value="dashboard" className="mt-4">
              <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Dashboard de compras — gráficos entram na fase de lógica.</p></CarboCardContent></CarboCard>
            </TabsContent>
          )}
        </Tabs>
        <p className="text-xs text-muted-foreground text-center">Notas fiscais e contas a pagar entram na próxima fase.</p>
      </div>

      <NovaRequisicaoDialog open={novaOpen} onOpenChange={setNovaOpen} />
      <RCDetailsDialog rc={detailRc} open={detailRc !== null} onOpenChange={(v) => !v && setDetailRc(null)} />
      <RCAprovarDialog
        rcNumber={aprovarRc?.number ?? null}
        open={aprovarRc !== null}
        onOpenChange={(v) => !v && setAprovarRc(null)}
        onConfirm={aprovarRc ? async () => { await approve.mutateAsync(aprovarRc.id); toast.success(`Requisição ${aprovarRc.number} aprovada.`); setAprovarRc(null); } : undefined}
      />
      <RCRejeitarDialog
        rcNumber={rejeitarRc?.number ?? null}
        open={rejeitarRc !== null}
        onOpenChange={(v) => !v && setRejeitarRc(null)}
        onConfirm={rejeitarRc ? async () => { await reject.mutateAsync(rejeitarRc.id); toast.success(`Requisição ${rejeitarRc.number} rejeitada.`); setRejeitarRc(null); } : undefined}
      />
      <RecebimentoDialog open={recebOpen} onOpenChange={setRecebOpen} />
      <SupplierFormDialog open={fornecedorOpen} onOpenChange={setFornecedorOpen} mode="create" />
    </div>
  );
}
