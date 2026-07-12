import { useMemo } from "react";
import { PackagePlus, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { useQuotes } from "@/hooks/useCotacoes";
import { useCreatePurchaseOrder } from "@/hooks/usePurchasing";
import type { PurchaseRequest } from "@/types/purchasing";

const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Line { i: number; descricao: string; quantidade: number; unidade: string; unit_price: number; supplier: string; supplier_id: string | null; fromQuote: boolean; }

// Gera a(s) OC(s) a partir de uma RC aprovada. Usa a COTAÇÃO VENCEDORA de cada
// item (fornecedor + preço). Itens sem cotação escolhida caem num grupo
// "A definir" com o valor estimado. Se as vencedoras forem de fornecedores
// diferentes, gera UMA OC por fornecedor (split PO — comportamento correto).
export function GerarOCDialog({ rc, onClose }: { rc: PurchaseRequest | null; onClose: () => void }) {
  const { data: quotes = [] } = useQuotes(rc?.id ?? null);
  const createOC = useCreatePurchaseOrder();

  const items = (rc?.items ?? []) as any[];
  const selByItem = new Map<number, any>();
  quotes.filter((q) => q.selected).forEach((q) => selByItem.set(q.item_index, q));

  const lines: Line[] = items.map((it, i) => {
    const q = selByItem.get(i);
    return {
      i,
      descricao: it.descricao,
      quantidade: Number(it.quantidade) || 0,
      unidade: it.unidade,
      unit_price: q ? Number(q.unit_price) : Number(it.valor_unitario) || 0,
      supplier: q ? q.supplier_name : "A definir",
      supplier_id: q ? (q.supplier_id ?? null) : null,
      fromQuote: !!q,
    };
  });

  const groups = useMemo(() => {
    const m = new Map<string, Line[]>();
    for (const l of lines) { const arr = m.get(l.supplier) ?? []; arr.push(l); m.set(l.supplier, arr); }
    return Array.from(m.entries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(lines)]);

  const semCotacao = lines.filter((l) => !l.fromQuote).length;

  const gerar = async () => {
    try {
      for (const [supplier, ls] of groups) {
        const ocItems = ls.map((l) => ({ descricao: l.descricao, quantidade: l.quantidade, unidade: l.unidade, valor_unitario: l.unit_price }));
        const total = ls.reduce((s, l) => s + l.quantidade * l.unit_price, 0);
        await createOC.mutateAsync({
          purchase_request_id: rc!.id,
          supplier_name: supplier,
          supplier_id: ls.find((l) => l.supplier_id)?.supplier_id ?? undefined,
          items: ocItems as any,
          total_value: total,
          expected_delivery: (rc as any)?.needed_by || undefined,
        });
      }
      onClose();
    } catch { /* erro tratado no hook */ }
  };

  if (!rc) return null;

  return (
    <Dialog open={!!rc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Ordem de Compra — {rc.rc_number}</DialogTitle>
          <DialogDescription>
            {groups.length > 1
              ? `Como as cotações vencedoras são de ${groups.length} fornecedores, será gerada uma OC por fornecedor.`
              : "A OC sai com o fornecedor e os preços da cotação vencedora."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {groups.map(([supplier, ls]) => {
            const total = ls.reduce((s, l) => s + l.quantidade * l.unit_price, 0);
            const semQuote = supplier === "A definir";
            return (
              <div key={supplier} className="rounded-lg border border-border">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-t-lg">
                  <span className="font-medium text-sm flex items-center gap-2">
                    {supplier}
                    {semQuote && <CarboBadge variant="warning" className="text-[10px]">sem cotação</CarboBadge>}
                  </span>
                  <span className="text-sm font-semibold">{brl(total)}</span>
                </div>
                <div className="divide-y divide-border">
                  {ls.map((l) => (
                    <div key={l.i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span className="truncate">{l.descricao} <span className="text-muted-foreground">· {l.quantidade} {l.unidade}</span></span>
                      <span className="text-muted-foreground shrink-0">{brl(l.unit_price)}/un</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {semCotacao > 0 && (
            <div className="flex items-start gap-2 text-xs text-warning-foreground bg-warning/10 border border-warning/30 rounded-lg p-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{semCotacao} item(ns) sem cotação escolhida entram como <strong>"A definir"</strong> com o valor estimado. Você pode ajustar o fornecedor depois na OC.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={gerar} disabled={createOC.isPending || groups.length === 0} className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white">
            {createOC.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando…</> : <><PackagePlus className="h-4 w-4" /> Gerar {groups.length > 1 ? `${groups.length} OCs` : "OC"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
