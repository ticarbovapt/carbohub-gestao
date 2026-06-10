import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboButton } from "@/components/ui/carbo-button";
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
import { toast } from "sonner";

// ⚠️ PORT VISUAL FIEL ao Controle (/purchasing → Purchasing "Financeiro & Suprimentos") — dados MOCK.
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
const RCS: RC[] = [
  { id: "1", rc_number: "RC-2042", cost_center: "Produção RN", tipo: "Insumo", valor: 12400, status: "aguardando_aprovacao", data: "2026-06-09" },
  { id: "2", rc_number: "RC-2041", cost_center: "Logística SP", tipo: "Embalagem", valor: 5300, status: "aprovada", data: "2026-06-08" },
  { id: "3", rc_number: "RC-2040", cost_center: "Manutenção", tipo: "Serviço", valor: 2800, status: "rejeitada", data: "2026-06-07" },
  { id: "4", rc_number: "RC-2039", cost_center: "Produção RN", tipo: "Reagente", valor: 18900, status: "aguardando_aprovacao", data: "2026-06-07" },
  { id: "5", rc_number: "RC-2038", cost_center: "Comercial", tipo: "Material", valor: 940, status: "rascunho", data: "2026-06-06" },
];

interface SimpleRow { id: string; col1: string; col2: string; col3: string; valor: number; status: string; statusVariant: "secondary" | "warning" | "success" | "destructive" | "info"; }
const OCS: SimpleRow[] = [
  { id: "1", col1: "OC-1042", col2: "QuímicaSul", col3: "5 itens", valor: 18900, status: "Em aberto", statusVariant: "info" },
  { id: "2", col1: "OC-1041", col2: "EmbaNorte", col3: "2 itens", valor: 5300, status: "Recebida", statusVariant: "success" },
  { id: "3", col1: "OC-1040", col2: "InsumosBR", col3: "8 itens", valor: 9400, status: "Parcial", statusVariant: "warning" },
];
const RECEB: SimpleRow[] = [
  { id: "1", col1: "REC-512", col2: "OC-1041", col3: "EmbaNorte", valor: 5300, status: "Conferido", statusVariant: "success" },
  { id: "2", col1: "REC-511", col2: "OC-1040", col3: "InsumosBR", valor: 4700, status: "Pendente", statusVariant: "warning" },
];
const NOTAS: SimpleRow[] = [
  { id: "1", col1: "NF 123455", col2: "QuímicaSul", col3: "12/06/2026", valor: 18900, status: "Lançada", statusVariant: "success" },
  { id: "2", col1: "NF 123450", col2: "EmbaNorte", col3: "08/06/2026", valor: 5300, status: "Lançada", statusVariant: "success" },
];
const PAGAR: SimpleRow[] = [
  { id: "1", col1: "QuímicaSul", col2: "NF 123455", col3: "Vence 20/06", valor: 18900, status: "A pagar", statusVariant: "warning" },
  { id: "2", col1: "InsumosBR", col2: "NF 123440", col3: "Venceu 05/06", valor: 4700, status: "Atrasado", statusVariant: "destructive" },
];
const FORN: SimpleRow[] = [
  { id: "1", col1: "QuímicaSul", col2: "12.345.678/0001-90", col3: "Reagentes", valor: 0, status: "Ativo", statusVariant: "success" },
  { id: "2", col1: "EmbaNorte", col2: "45.678.912/0001-33", col3: "Embalagem", valor: 0, status: "Ativo", statusVariant: "success" },
];

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

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Compras"
          description="Requisições, ordens de compra, recebimento, notas fiscais e contas a pagar"
          icon={Wallet}
          actions={<Button onClick={() => toast("Nova Requisição (em breve)")} className="gap-2"><Plus className="h-4 w-4" /> Nova Requisição</Button>}
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <KpiCard icon={Clock} label="RC Pendentes" value="2" color="text-warning" />
          <KpiCard icon={Package} label="OC Abertas" value="3" color="text-carbo-blue" />
          <KpiCard icon={AlertTriangle} label="Pgtos Atrasados" value="1" color="text-destructive" />
          <KpiCard icon={BarChart3} label="Comprometido" value={brl(33600)} color="text-carbo-green" />
          <KpiCard icon={CreditCard} label="A Pagar" value={brl(23600)} color="text-warning" />
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
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toast(`Ver ${rc.rc_number} (em breve)`)}><Eye className="h-4 w-4" /></Button>
                          {rc.status === "aguardando_aprovacao" && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => toast("Aprovar RC (em breve)")} title="Aprovar"><Check className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => toast("Rejeitar RC (em breve)")} title="Rejeitar"><X className="h-4 w-4" /></Button>
                            </>
                          )}
                        </div>
                      </CarboTableCell>
                    </CarboTableRow>
                  ))}
                </CarboTableBody>
              </CarboTable>
            </div>
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
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Aprovação do financeiro e dados reais entram na fase de lógica.</p>
      </div>
    </div>
  );
}
