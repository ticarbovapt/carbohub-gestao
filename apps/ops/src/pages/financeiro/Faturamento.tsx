import { useState } from "react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import {
  Receipt, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, Link2,
} from "lucide-react";
import { toast } from "sonner";

// ⚠️ PORT VISUAL FIEL ao Controle (/financeiro/faturamento → FaturamentoPage) — dados MOCK.

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Status = "confirmed" | "invoiced" | "pending";
const STATUS_LABEL: Record<Status, string> = { confirmed: "Confirmado", invoiced: "Faturado", pending: "Pendente" };
const STATUS_VARIANT: Record<Status, "success" | "warning" | "secondary"> = { confirmed: "warning", invoiced: "success", pending: "secondary" };

interface Order {
  id: string; order_number: string; customer_name: string; cnpj: string; ie: string;
  payment_terms: string; freight_type: "CIF" | "FOB"; total: number; status: Status; has_nf: boolean; bling: boolean;
}
const ORDERS: Order[] = [
  { id: "1", order_number: "VND-2042", customer_name: "Posto Shell Centro", cnpj: "12.345.678/0001-90", ie: "1234567", payment_terms: "30 dias", freight_type: "CIF", total: 4850, status: "confirmed", has_nf: false, bling: false },
  { id: "2", order_number: "VND-2041", customer_name: "Auto Posto Bandeirantes", cnpj: "98.765.432/0001-10", ie: "ISENTO", payment_terms: "À vista", freight_type: "FOB", total: 12300, status: "confirmed", has_nf: false, bling: true },
  { id: "3", order_number: "VND-2039", customer_name: "Posto Ipiranga Sul", cnpj: "45.678.912/0001-33", ie: "7654321", payment_terms: "28/56 dias", freight_type: "CIF", total: 2200, status: "invoiced", has_nf: true, bling: true },
];

export default function Faturamento() {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? ORDERS : ORDERS.filter((o) => !o.has_nf);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="h-6 w-6 text-carbo-green" /> Fila de Faturamento</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Pedidos confirmados aguardando emissão de Nota Fiscal no Bling</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
              <Button variant="ghost" size="icon" className="h-7 w-7"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-semibold w-28 text-center capitalize">jun de 2026</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <button className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${showAll ? "bg-carbo-green/20 border-carbo-green/40 text-carbo-green font-semibold" : "border-border text-muted-foreground hover:border-foreground/30"}`} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Mostrando todos" : "Só sem NF"}
            </button>
          </div>
        </div>

        {/* Instrução */}
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground leading-relaxed space-y-1">
          <p><strong className="text-foreground">Como funciona:</strong> clique em <strong>🔗 Criar no Bling</strong> — o sistema envia os dados do pedido via API e abre o Bling em nova guia.</p>
          <p>No Bling, gere a NF-e; o vínculo da NF ao pedido é feito automaticamente a cada 15 min.</p>
        </div>

        {/* Lista de pedidos */}
        <div className="space-y-3">
          {visible.map((o) => (
            <CarboCard key={o.id}>
              <CarboCardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-carbo-green">{o.order_number}</span>
                      <CarboBadge variant={STATUS_VARIANT[o.status]} size="sm">{STATUS_LABEL[o.status]}</CarboBadge>
                      {o.bling && <CarboBadge variant="info" size="sm">No Bling</CarboBadge>}
                    </div>
                    <p className="font-medium mt-1">{o.customer_name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      <span>CNPJ: {o.cnpj}</span>
                      <span title="Inscrição Estadual">IE: {o.ie}</span>
                      <span>Pagto: {o.payment_terms}</span>
                      <span title={o.freight_type === "CIF" ? "Frete por conta do vendedor" : "Frete por conta do comprador"}>Frete: {o.freight_type}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold tabular-nums">{brl(o.total)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => toast("Número copiado (mock)")}><Copy className="h-3.5 w-3.5" /> Copiar Nº</Button>
                  {!o.has_nf && !o.bling && <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => toast("Criar no Bling (em breve)")}><Link2 className="h-3.5 w-3.5" /> Criar no Bling</Button>}
                  {!o.has_nf && <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => toast("Pré-visualizar envio (em breve)")}><Eye className="h-3.5 w-3.5" /> Pré-visualizar</Button>}
                  {(o.bling || o.has_nf) && <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => toast("Abrir no Bling (em breve)")}><ExternalLink className="h-3.5 w-3.5" /> Abrir no Bling</Button>}
                </div>
              </CarboCardContent>
            </CarboCard>
          ))}
          {visible.length === 0 && <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Nenhum pedido na fila</p></CarboCardContent></CarboCard>}
        </div>
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Integração Bling e emissão de NF entram na fase de lógica.</p>
      </div>
    </div>
  );
}
