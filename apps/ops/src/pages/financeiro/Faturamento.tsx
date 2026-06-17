import { useState } from "react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import {
  Receipt, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, Link2,
} from "lucide-react";
import { toast } from "sonner";
import { BlingPreviewDialog, type BlingOrder } from "@/components/financeiro/BlingPreviewDialog";

// TODO: ligar em <tabela financeira/bling> (Supabase)

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Status = "confirmed" | "invoiced" | "pending";
const STATUS_LABEL: Record<Status, string> = { confirmed: "Confirmado", invoiced: "Faturado", pending: "Pendente" };
const STATUS_VARIANT: Record<Status, "success" | "warning" | "secondary"> = { confirmed: "warning", invoiced: "success", pending: "secondary" };

interface Order {
  id: string; order_number: string; customer_name: string; cnpj: string; ie: string;
  payment_terms: string; freight_type: "CIF" | "FOB"; total: number; status: Status; has_nf: boolean; bling: boolean;
}
const ORDERS: Order[] = [];

export default function Faturamento() {
  const [showAll, setShowAll] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<BlingOrder | null>(null);
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
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => toast("Número copiado")}><Copy className="h-3.5 w-3.5" /> Copiar Nº</Button>
                  {!o.has_nf && !o.bling && <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setPreviewOrder(o)}><Link2 className="h-3.5 w-3.5" /> Criar no Bling</Button>}
                  {!o.has_nf && <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setPreviewOrder(o)}><Eye className="h-3.5 w-3.5" /> Pré-visualizar</Button>}
                  {(o.bling || o.has_nf) && <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => toast("Abrir no Bling (em breve)")}><ExternalLink className="h-3.5 w-3.5" /> Abrir no Bling</Button>}
                </div>
              </CarboCardContent>
            </CarboCard>
          ))}
          {visible.length === 0 && <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Nenhum pedido na fila</p></CarboCardContent></CarboCard>}
        </div>
      </div>
      <BlingPreviewDialog order={previewOrder} open={!!previewOrder} onOpenChange={(o) => !o && setPreviewOrder(null)} />
    </div>
  );
}
