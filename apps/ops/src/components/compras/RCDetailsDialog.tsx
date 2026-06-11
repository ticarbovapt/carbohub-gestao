// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { Brain, CheckCircle2, XCircle, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export interface RCLite {
  rc_number: string;
  cost_center: string;
  tipo: string;
  valor: number;
  statusLabel: string;
  statusVariant: "secondary" | "warning" | "success" | "destructive";
}

// Itens / cotações / análise MOCK (mesmos campos do RCDetailsPanel do Controle).
const ITEMS_MOCK = [
  { descricao: "Reagente base 25L", quantidade: 4, unidade: "un", valor_unitario: 2400 },
  { descricao: "Frete dedicado", quantidade: 1, unidade: "serviço", valor_unitario: 2800 },
];
const QUOTATIONS_MOCK = [
  { fornecedor_nome: "QuímicaSul", preco: 12400, prazo_entrega_dias: 7, condicao_pagamento: "30/60", recomendado: true },
  { fornecedor_nome: "InsumosBR", preco: 13100, prazo_entrega_dias: 5, condicao_pagamento: "à vista", recomendado: false },
  { fornecedor_nome: "ReagBrasil", preco: 12950, prazo_entrega_dias: 10, condicao_pagamento: "28 ddl", recomendado: false },
];

export function RCDetailsDialog({ rc, open, onOpenChange }: { rc: RCLite | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!rc) return null;
  const totalQtd = ITEMS_MOCK.reduce((s, i) => s + i.quantidade, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Requisição {rc.rc_number}</span>
            <CarboBadge variant={rc.statusVariant}>{rc.statusLabel}</CarboBadge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Info cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <CarboCard padding="sm"><CarboCardContent>
              <p className="text-xs text-muted-foreground mb-1">Valor Estimado</p>
              <p className="text-lg font-bold">{brl(rc.valor)}</p>
            </CarboCardContent></CarboCard>
            <CarboCard padding="sm"><CarboCardContent>
              <p className="text-xs text-muted-foreground mb-1">Quantidade total</p>
              <p className="text-lg font-bold">{totalQtd} itens</p>
            </CarboCardContent></CarboCard>
            <CarboCard padding="sm"><CarboCardContent>
              <p className="text-xs text-muted-foreground mb-1">Centro de Custo</p>
              <p className="text-lg font-bold">{rc.cost_center}</p>
            </CarboCardContent></CarboCard>
          </div>

          {/* Itens */}
          <CarboCard>
            <CarboCardHeader><CarboCardTitle className="text-sm">Itens da Requisição</CarboCardTitle></CarboCardHeader>
            <CarboCardContent>
              <div className="divide-y divide-border">
                {ITEMS_MOCK.map((it, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{it.descricao}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{it.quantidade} {it.unidade} × {brl(it.valor_unitario)}</p>
                    </div>
                    <p className="font-bold text-sm">{brl(it.quantidade * it.valor_unitario)}</p>
                  </div>
                ))}
              </div>
            </CarboCardContent>
          </CarboCard>

          {/* Cotações */}
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">
                Cotações ({QUOTATIONS_MOCK.length}/3 mínimas)
                <span className="text-carbo-green ml-2 text-xs">✓ Mínimo atingido</span>
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              <div className="divide-y divide-border">
                {QUOTATIONS_MOCK.map((q, i) => (
                  <div key={i} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{q.fornecedor_nome}</p>
                        {q.recomendado && (
                          <CarboBadge variant="success" className="gap-1"><Star className="h-3 w-3" /> IA Recomendado</CarboBadge>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>Prazo: {q.prazo_entrega_dias}d</span>
                        <span>{q.condicao_pagamento}</span>
                      </div>
                    </div>
                    <p className="font-bold text-sm">{brl(q.preco)}</p>
                  </div>
                ))}
              </div>
            </CarboCardContent>
          </CarboCard>

          {/* Análise IA */}
          <CarboCard className="border-primary/20 bg-primary/5">
            <CarboCardHeader>
              <CarboCardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> Análise IA</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-warning" />
                  <p className="font-medium text-sm">Recomendação: QuímicaSul</p>
                  <CarboBadge variant="success">Score: 8.7</CarboBadge>
                </div>
                <p className="text-sm text-muted-foreground">Melhor relação custo/prazo com condição de pagamento favorável.</p>
              </div>
            </CarboCardContent>
          </CarboCard>

          {/* Histórico de aprovações */}
          <CarboCard>
            <CarboCardHeader><CarboCardTitle className="text-sm">Histórico de Aprovações</CarboCardTitle></CarboCardHeader>
            <CarboCardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-carbo-green" />
                  <span className="font-medium">Aprovado</span>
                  <span className="text-muted-foreground">Nível 1</span>
                  <span className="text-muted-foreground ml-auto text-xs">08/06/2026 14:20</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Aguardando Nível 2 (&gt; R$ 10k)</span>
                </div>
              </div>
            </CarboCardContent>
          </CarboCard>
        </div>
      </DialogContent>
    </Dialog>
  );
}
