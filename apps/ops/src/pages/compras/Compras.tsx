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
  CheckCircle2, Building2, Check, X, Eye,
} from "lucide-react";
import { NovaRequisicaoDialog } from "@/components/compras/NovaRequisicaoDialog";
import { RCDetailsDialog, type RCLite } from "@/components/compras/RCDetailsDialog";
import { RCAprovarDialog } from "@/components/compras/RCAprovarDialog";
import { RCRejeitarDialog } from "@/components/compras/RCRejeitarDialog";

// TODO: ligar em <tabela de compras> (Supabase).
// No Carbo Ops esta é a tela de COMPRAS (requisições aprovadas pelo financeiro).

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
interface RC { id: string; rc_number: string; cost_center: string; tipo: string; valor: number; status: RcStatus; data: string; }
// TODO: ligar em <tabela de compras> (Supabase).
const RCS: RC[] = [];

interface SimpleRow { id: string; col1: string; col2: string; col3: string; valor: number; status: string; statusVariant: "secondary" | "warning" | "success" | "destructive" | "info"; }
// TODO: ligar em <tabela de compras> (Supabase).
const OCS: SimpleRow[] = [];
const RECEB: SimpleRow[] = [];
const NOTAS: SimpleRow[] = [];
const PAGAR: SimpleRow[] = [];
const FORN: SimpleRow[] = [];

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
  const [aprovarRc, setAprovarRc] = useState<string | null>(null);
  const [rejeitarRc, setRejeitarRc] = useState<string | null>(null);

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
          <KpiCard icon={Clock} label="RC Pendentes" value="0" color="text-warning" />
          <KpiCard icon={Package} label="OC Abertas" value="0" color="text-carbo-blue" />
          <KpiCard icon={AlertTriangle} label="Pgtos Atrasados" value="0" color="text-destructive" />
          <KpiCard icon={BarChart3} label="Comprometido" value={brl(0)} color="text-carbo-green" />
          <KpiCard icon={CreditCard} label="A Pagar" value={brl(0)} color="text-warning" />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="requisicoes" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Requisições</TabsTrigger>
            <TabsTrigger value="ordens" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Ordens de Compra</TabsTrigger>
            <TabsTrigger value="recebimento" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Recebimento</TabsTrigger>
            <TabsTrigger value="notas" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> Notas Fiscais</TabsTrigger>
            <TabsTrigger value="pagar" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Contas a Pagar</TabsTrigger>
            <TabsTrigger value="fornecedores" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Fornecedores</TabsTrigger>
            {canSeeDashboard && <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Dashboard</TabsTrigger>}
          </TabsList>

          {/* Requisições — núcleo: aprovação do financeiro */}
          <TabsContent value="requisicoes" className="mt-4">
            <div className="flex items-center gap-3 mb-3">
              <Select defaultValue="all">
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(RC_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {RCS.length === 0 ? <CarboEmptyState title="Nenhum registro" /> : (
            <div className="overflow-x-auto">
              <CarboTable>
                <CarboTableHeader>
                  <CarboTableRow>
                    <CarboTableHead>Nº RC</CarboTableHead><CarboTableHead>Centro de Custo</CarboTableHead><CarboTableHead>Tipo</CarboTableHead>
                    <CarboTableHead className="text-right">Valor Estimado</CarboTableHead><CarboTableHead>Status</CarboTableHead><CarboTableHead>Data</CarboTableHead><CarboTableHead>Ações</CarboTableHead>
                  </CarboTableRow>
                </CarboTableHeader>
                <CarboTableBody>
                  {RCS.map((rc) => (
                    <CarboTableRow key={rc.id}>
                      <CarboTableCell className="font-mono font-medium">{rc.rc_number}</CarboTableCell>
                      <CarboTableCell>{rc.cost_center}</CarboTableCell>
                      <CarboTableCell className="text-sm text-muted-foreground">{rc.tipo}</CarboTableCell>
                      <CarboTableCell className="text-right font-semibold">{brl(rc.valor)}</CarboTableCell>
                      <CarboTableCell><CarboBadge variant={RC_STATUS_VARIANT[rc.status]} dot>{RC_STATUS_LABELS[rc.status]}</CarboBadge></CarboTableCell>
                      <CarboTableCell className="text-sm text-muted-foreground">{dt(rc.data)}</CarboTableCell>
                      <CarboTableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailRc({ rc_number: rc.rc_number, cost_center: rc.cost_center, tipo: rc.tipo, valor: rc.valor, statusLabel: RC_STATUS_LABELS[rc.status], statusVariant: RC_STATUS_VARIANT[rc.status] })}><Eye className="h-4 w-4" /></Button>
                          {rc.status === "aguardando_aprovacao" && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => setAprovarRc(rc.rc_number)} title="Aprovar"><Check className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRejeitarRc(rc.rc_number)} title="Rejeitar"><X className="h-4 w-4" /></Button>
                            </>
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

          <TabsContent value="ordens" className="mt-4"><SimpleTable headers={["Nº OC", "Fornecedor", "Itens"]} rows={OCS} /></TabsContent>
          <TabsContent value="recebimento" className="mt-4"><SimpleTable headers={["Recebimento", "OC", "Fornecedor"]} rows={RECEB} /></TabsContent>
          <TabsContent value="notas" className="mt-4"><SimpleTable headers={["Nota Fiscal", "Fornecedor", "Emissão"]} rows={NOTAS} /></TabsContent>
          <TabsContent value="pagar" className="mt-4"><SimpleTable headers={["Fornecedor", "Documento", "Vencimento"]} rows={PAGAR} /></TabsContent>
          <TabsContent value="fornecedores" className="mt-4"><SimpleTable headers={["Fornecedor", "CNPJ", "Categoria"]} rows={FORN} showValor={false} /></TabsContent>
          {canSeeDashboard && (
            <TabsContent value="dashboard" className="mt-4">
              <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Dashboard de compras — gráficos entram na fase de lógica.</p></CarboCardContent></CarboCard>
            </TabsContent>
          )}
        </Tabs>
        <p className="text-xs text-muted-foreground text-center">Aprovação do financeiro e dados reais entram na fase de lógica.</p>
      </div>

      <NovaRequisicaoDialog open={novaOpen} onOpenChange={setNovaOpen} />
      <RCDetailsDialog rc={detailRc} open={detailRc !== null} onOpenChange={(v) => !v && setDetailRc(null)} />
      <RCAprovarDialog rcNumber={aprovarRc} open={aprovarRc !== null} onOpenChange={(v) => !v && setAprovarRc(null)} />
      <RCRejeitarDialog rcNumber={rejeitarRc} open={rejeitarRc !== null} onOpenChange={(v) => !v && setRejeitarRc(null)} />
    </div>
  );
}
