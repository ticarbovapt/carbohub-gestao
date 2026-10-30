import { useMemo } from "react";
import { PackagePlus, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { useQuotes } from "@/hooks/useCotacoes";
import { useGerarOCs } from "@/hooks/usePurchasing";
import type { PurchaseRequest } from "@/types/purchasing";

const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Chave do agrupamento: "Acme", "acme " e "ACME  Ltda" com espaço dobrado não
// podem virar OCs separadas para o MESMO fornecedor.
const SEM_COTACAO = "::sem-cotacao";
const chaveFornecedor = (nome: string) => nome.trim().toLowerCase().replace(/\s+/g, " ");

interface Line { i: number; descricao: string; quantidade: number; unidade: string; unit_price: number; supplier: string; supplier_id: string | null; fromQuote: boolean; }

// Gera a(s) OC(s) a partir de uma RC aprovada. Usa a COTAÇÃO VENCEDORA de cada
// item (fornecedor + preço). Itens sem cotação escolhida caem num grupo
// "A definir" com o valor estimado. Se as vencedoras forem de fornecedores
// diferentes, gera UMA OC por fornecedor (split PO — comportamento correto).
export function GerarOCDialog({ rc, onClose }: { rc: PurchaseRequest | null; onClose: () => void }) {
  const { data: quotes = [] } = useQuotes(rc?.id ?? null);
  const gerarOCs = useGerarOCs();

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

  // [chave, nome exibido/gravado, linhas]. O nome é o da 1ª cotação COM
  // fornecedor cadastrado (supplier_id), senão o da 1ª linha, sem espaço sobrando.
  const groups = useMemo(() => {
    const m = new Map<string, { nome: string; ls: Line[] }>();
    for (const l of lines) {
      const chave = l.fromQuote ? chaveFornecedor(l.supplier) : SEM_COTACAO;
      const g = m.get(chave) ?? { nome: l.fromQuote ? l.supplier.trim().replace(/\s+/g, " ") : "A definir", ls: [] };
      if (l.fromQuote && l.supplier_id && !g.ls.some((x) => x.supplier_id)) g.nome = l.supplier.trim().replace(/\s+/g, " ");
      g.ls.push(l);
      m.set(chave, g);
    }
    return Array.from(m.entries()).map(([chave, g]) => [chave, g.nome, g.ls] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(lines)]);

  const semCotacao = lines.filter((l) => !l.fromQuote).length;

  // ⚠️ UMA chamada para todas as OCs (`fin_oc_gerar`): ou todas nascem e a RC
  // vira "convertida", ou nenhuma — antes, cair na 2ª deixava a RC convertida
  // com OCs faltando. O total de cada OC é calculado no banco a partir dos itens.
  const gerar = () => {
    gerarOCs.mutate({
      rcId: rc!.id,
      grupos: groups.map(([, supplier, ls]) => ({
        supplier_name: supplier,
        supplier_id: ls.find((l) => l.supplier_id)?.supplier_id ?? null,
        itens: ls.map((l) => ({ descricao: l.descricao, quantidade: l.quantidade, unidade: l.unidade, valor_unitario: l.unit_price })),
      })),
    }, { onSuccess: onClose });
  };

  if (!rc) return null;

  return (
    <Dialog open={!!rc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Ordem de Compra — {rc.rc_number}</DialogTitle>
          {groups.length > 1 && (
            <DialogDescription>{groups.length} fornecedores: uma OC por fornecedor.</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 py-1 min-w-0">
          {groups.map(([chave, supplier, ls]) => {
            const total = ls.reduce((s, l) => s + l.quantidade * l.unit_price, 0);
            const semQuote = chave === SEM_COTACAO;
            return (
              <div key={chave} className="rounded-lg border border-border">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 rounded-t-lg">
                  <span className="font-medium text-sm flex items-center gap-2 min-w-0 break-words">
                    {supplier}
                    {semQuote && <CarboBadge variant="warning" className="text-[10px]">sem cotação</CarboBadge>}
                  </span>
                  <span className="text-sm font-semibold">{brl(total)}</span>
                </div>
                <div className="divide-y divide-border">
                  {ls.map((l) => (
                    <div key={l.i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      <span className="truncate min-w-0">{l.descricao} <span className="text-muted-foreground">· {l.quantidade} {l.unidade}</span></span>
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
              <span>{semCotacao} item(ns) sem cotação escolhida vão numa OC <strong>"A definir"</strong> com o valor estimado; a OC não pode ser editada depois.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={gerar} disabled={gerarOCs.isPending || groups.length === 0} className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white">
            {gerarOCs.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando…</> : <><PackagePlus className="h-4 w-4" /> Gerar {groups.length > 1 ? `${groups.length} OCs` : "OC"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
