import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import {
  DollarSign, FileText, CheckCircle2, Clock, AlertTriangle, CreditCard, BarChart3,
} from "lucide-react";

// TODO: ligar em <tabela financeira/bling> (Supabase)

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type RcStatus = "aguardando_aprovacao" | "em_cotacao" | "aprovada" | "paga";
const RC_LABEL: Record<RcStatus, string> = { aguardando_aprovacao: "Aguardando Aprovação", em_cotacao: "Em Cotação", aprovada: "Aprovada", paga: "Paga" };
const RC_VARIANT: Record<RcStatus, "warning" | "info" | "success" | "secondary"> = { aguardando_aprovacao: "warning", em_cotacao: "info", aprovada: "success", paga: "secondary" };

interface RC { id: string; numero: string; centro: string; valor: number; status: RcStatus; data: string; }
const RCS: RC[] = [];
interface PC { id: string; numero: string; fornecedor: string; valor: number; status: string; variant: "info" | "success" | "warning" | "destructive" | "secondary"; }
const PCS: PC[] = [];
interface Pagar { id: string; fornecedor: string; doc: string; venc: string; valor: number; status: string; variant: "info" | "success" | "warning" | "destructive" | "secondary"; }
const PAGAR: Pagar[] = [];

function Kpi({ icon: Icon, label, value, color }: { icon: typeof Clock; label: string; value: string; color: string }) {
  return (
    <CarboCard variant="kpi" padding="sm"><CarboCardContent>
      <div className="flex items-center gap-2 mb-1"><Icon className={`h-4 w-4 ${color}`} /><span className="text-xs text-muted-foreground">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </CarboCardContent></CarboCard>
  );
}

export default function Financeiro() {
  const [activeTab, setActiveTab] = useState("requisicoes");
  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader title="Financeiro" description="Requisições de Compra, Cotações, Aprovações e Contas a Pagar" icon={DollarSign} />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Kpi icon={Clock} label="RC Pendentes" value="0" color="text-warning" />
          <Kpi icon={FileText} label="Em Cotação" value="0" color="text-carbo-blue" />
          <Kpi icon={BarChart3} label="Total RCs" value="0" color="text-carbo-green" />
          <Kpi icon={AlertTriangle} label="Pgtos Atrasados" value="0" color="text-destructive" />
          <Kpi icon={CreditCard} label="A Pagar" value={brl(0)} color="text-warning" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="requisicoes" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Requisições (RC)</TabsTrigger>
            <TabsTrigger value="ordens" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Pedidos de Compra (PC)</TabsTrigger>
            <TabsTrigger value="pagar" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Contas a Pagar</TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="requisicoes" className="mt-4">
            <div className="overflow-x-auto"><CarboTable>
              <CarboTableHeader><CarboTableRow>
                <CarboTableHead>Nº RC</CarboTableHead><CarboTableHead>Centro de Custo</CarboTableHead><CarboTableHead className="text-right">Valor</CarboTableHead><CarboTableHead>Status</CarboTableHead><CarboTableHead>Data</CarboTableHead>
              </CarboTableRow></CarboTableHeader>
              <CarboTableBody>{RCS.map((r) => (
                <CarboTableRow key={r.id}>
                  <CarboTableCell className="font-mono font-medium">{r.numero}</CarboTableCell>
                  <CarboTableCell>{r.centro}</CarboTableCell>
                  <CarboTableCell className="text-right font-semibold">{brl(r.valor)}</CarboTableCell>
                  <CarboTableCell><CarboBadge variant={RC_VARIANT[r.status]} dot>{RC_LABEL[r.status]}</CarboBadge></CarboTableCell>
                  <CarboTableCell className="text-sm text-muted-foreground">{r.data}</CarboTableCell>
                </CarboTableRow>
              ))}</CarboTableBody>
            </CarboTable>
            {RCS.length === 0 && <CarboEmptyState icon={FileText} title="Nenhuma requisição de compra" />}</div>
          </TabsContent>

          <TabsContent value="ordens" className="mt-4">
            <div className="overflow-x-auto"><CarboTable>
              <CarboTableHeader><CarboTableRow><CarboTableHead>Nº PC</CarboTableHead><CarboTableHead>Fornecedor</CarboTableHead><CarboTableHead className="text-right">Valor</CarboTableHead><CarboTableHead>Status</CarboTableHead></CarboTableRow></CarboTableHeader>
              <CarboTableBody>{PCS.map((p) => (
                <CarboTableRow key={p.id}><CarboTableCell className="font-mono font-medium">{p.numero}</CarboTableCell><CarboTableCell>{p.fornecedor}</CarboTableCell><CarboTableCell className="text-right font-semibold">{brl(p.valor)}</CarboTableCell><CarboTableCell><CarboBadge variant={p.variant} dot>{p.status}</CarboBadge></CarboTableCell></CarboTableRow>
              ))}</CarboTableBody>
            </CarboTable>
            {PCS.length === 0 && <CarboEmptyState icon={CheckCircle2} title="Nenhum pedido de compra" />}</div>
          </TabsContent>

          <TabsContent value="pagar" className="mt-4">
            <div className="overflow-x-auto"><CarboTable>
              <CarboTableHeader><CarboTableRow><CarboTableHead>Fornecedor</CarboTableHead><CarboTableHead>Documento</CarboTableHead><CarboTableHead>Vencimento</CarboTableHead><CarboTableHead className="text-right">Valor</CarboTableHead><CarboTableHead>Status</CarboTableHead></CarboTableRow></CarboTableHeader>
              <CarboTableBody>{PAGAR.map((p) => (
                <CarboTableRow key={p.id}><CarboTableCell className="font-medium">{p.fornecedor}</CarboTableCell><CarboTableCell className="font-mono text-sm">{p.doc}</CarboTableCell><CarboTableCell className="text-sm text-muted-foreground">{p.venc}</CarboTableCell><CarboTableCell className="text-right font-semibold">{brl(p.valor)}</CarboTableCell><CarboTableCell><CarboBadge variant={p.variant} dot>{p.status}</CarboBadge></CarboTableCell></CarboTableRow>
              ))}</CarboTableBody>
            </CarboTable>
            {PAGAR.length === 0 && <CarboEmptyState icon={CreditCard} title="Nenhuma conta a pagar" />}</div>
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Veja o Dashboard Financeiro completo no item dedicado do menu.</p></CarboCardContent></CarboCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
