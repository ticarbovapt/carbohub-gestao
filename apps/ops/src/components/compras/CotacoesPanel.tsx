import { useState } from "react";
import { Plus, Trash2, Check, Award, ExternalLink } from "lucide-react";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboInput } from "@/components/ui/carbo-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuotes, useAddQuote, useSelectQuote, useDeleteQuote, type DraftQuote } from "@/hooks/useCotacoes";

interface Item { descricao: string; quantidade: number; unidade: string; valor_unitario: number; }

// Linha normalizada (rowKey = id no banco OU key do rascunho).
interface Row { rowKey: string; item_index: number; supplier_name: string; unit_price: number; quantidade: number; notes: string | null; link: string | null; selected: boolean; }

const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const uid = () => (crypto?.randomUUID?.() ?? String(Math.random()).slice(2));

// Painel de cotações por item — compacto. Funciona em DOIS modos:
//  • persistido: recebe `requestId` (Finanças) → lê/grava em purchase_quotes.
//  • rascunho:   recebe `draft` (criação da requisição, antes de existir id) →
//                opera no estado local; salvo junto ao enviar a requisição.
export function CotacoesPanel({
  requestId, draft, items, editable = true,
}: {
  requestId?: string;
  draft?: { quotes: DraftQuote[]; onChange: (q: DraftQuote[]) => void };
  items: Item[];
  editable?: boolean;
}) {
  const isDraft = !!draft;
  const { data: dbQuotes = [], isLoading } = useQuotes(isDraft ? null : (requestId ?? null));
  const add = useAddQuote();
  const select = useSelectQuote();
  const del = useDeleteQuote();

  const rows: Row[] = isDraft
    ? draft!.quotes.map((q) => ({ rowKey: q.key, item_index: q.item_index, supplier_name: q.supplier_name, unit_price: q.unit_price, quantidade: q.quantidade, notes: q.notes, link: q.link, selected: q.selected }))
    : dbQuotes.map((q) => ({ rowKey: q.id, item_index: q.item_index, supplier_name: q.supplier_name, unit_price: q.unit_price, quantidade: q.quantidade, notes: q.notes, link: q.link, selected: q.selected }));

  const [adding, setAdding] = useState<{ index: number; descricao: string; quantidade: number } | null>(null);
  const [supplier, setSupplier] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");

  const openAdd = (index: number, it: Item) => {
    setAdding({ index, descricao: it.descricao, quantidade: it.quantidade });
    setSupplier(""); setUnitPrice(""); setNotes(""); setLink("");
  };

  const doAdd = () => {
    if (!adding || !supplier.trim()) return;
    const base = { item_index: adding.index, item_descricao: adding.descricao, supplier_name: supplier.trim(), unit_price: Number(unitPrice) || 0, quantidade: adding.quantidade, notes: notes || null, link: link || null };
    if (isDraft) {
      draft!.onChange([...draft!.quotes, { key: uid(), selected: false, ...base }]);
      setAdding(null);
    } else if (requestId) {
      add.mutate({ request_id: requestId, ...base }, { onSuccess: () => setAdding(null) });
    }
  };

  const doSelect = (r: Row) => {
    if (isDraft) {
      draft!.onChange(draft!.quotes.map((q) =>
        q.item_index === r.item_index ? { ...q, selected: q.key === r.rowKey ? !r.selected : false } : q));
    } else if (requestId) {
      select.mutate({ id: r.rowKey, request_id: requestId, item_index: r.item_index, selected: !r.selected });
    }
  };

  const doDelete = (r: Row) => {
    if (isDraft) draft!.onChange(draft!.quotes.filter((q) => q.key !== r.rowKey));
    else if (requestId) del.mutate({ id: r.rowKey, request_id: requestId });
  };

  const totalEscolhido = rows.filter((r) => r.selected).reduce((s, r) => s + r.unit_price * r.quantidade, 0);
  const semEscolha = items.filter((_, i) => !rows.some((r) => r.item_index === i && r.selected)).length;

  return (
    <div className="space-y-3">
      {items.map((it, i) => {
        const qs = rows.filter((r) => r.item_index === i);
        const min = qs.length ? Math.min(...qs.map((q) => q.unit_price)) : null;
        return (
          <div key={i} className="rounded-lg border border-border">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-t-lg">
              <div className="text-sm">
                <span className="font-medium">{it.descricao || `Item ${i + 1}`}</span>
                <span className="text-muted-foreground ml-2">{it.quantidade} {it.unidade}</span>
              </div>
              {editable && (
                <CarboButton size="sm" variant="outline" className="gap-1 h-7" onClick={() => openAdd(i, it)}>
                  <Plus className="h-3.5 w-3.5" /> Cotação
                </CarboButton>
              )}
            </div>

            {qs.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Sem cotações.</p>
            ) : (
              <div className="divide-y divide-border">
                {qs.map((q) => (
                  <div key={q.rowKey} className={`flex items-center gap-2 px-3 py-2 text-sm ${q.selected ? "bg-carbo-green/5" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{q.supplier_name}</span>
                        {q.unit_price === min && qs.length > 1 && <CarboBadge variant="success" className="text-[10px]">menor preço</CarboBadge>}
                        {q.selected && <CarboBadge variant="default" className="text-[10px] gap-1"><Award className="h-3 w-3" /> escolhida</CarboBadge>}
                        {q.link && <a href={q.link} target="_blank" rel="noopener" className="text-carbo-green"><ExternalLink className="h-3.5 w-3.5" /></a>}
                      </div>
                      {q.notes && <p className="text-[11px] text-muted-foreground truncate">{q.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium">{brl(q.unit_price * q.quantidade)}</p>
                      <p className="text-[11px] text-muted-foreground">{brl(q.unit_price)} / un</p>
                    </div>
                    {editable && (
                      <div className="flex items-center gap-1 shrink-0">
                        <CarboButton size="sm" variant={q.selected ? "default" : "outline"} className="h-7 gap-1" onClick={() => doSelect(q)}>
                          <Check className="h-3.5 w-3.5" /> {q.selected ? "Escolhida" : "Escolher"}
                        </CarboButton>
                        <CarboButton size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => doDelete(q)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </CarboButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {rows.length > 0 && (
        <div className="flex items-center justify-between text-sm px-1">
          <span className="text-muted-foreground">
            {semEscolha === 0 ? "Todos os itens têm cotação escolhida." : `${semEscolha} item(ns) sem cotação escolhida.`}
          </span>
          <span>Total escolhido: <strong className="text-carbo-green">{brl(totalEscolhido)}</strong></span>
        </div>
      )}
      {isLoading && <p className="text-xs text-muted-foreground">Carregando cotações…</p>}

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cotação — {adding?.descricao || "item"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Fornecedor *</Label>
              <CarboInput value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nome do fornecedor" />
            </div>
            <div className="space-y-1.5">
              <Label>Preço unitário (R$)</Label>
              <CarboInput type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0,00" />
              {adding && Number(unitPrice) > 0 && (
                <p className="text-[11px] text-muted-foreground">Total: {brl(Number(unitPrice) * adding.quantidade)} ({adding.quantidade} un)</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Link (opcional)</Label>
              <CarboInput value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link da cotação/produto" />
            </div>
            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <CarboInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Prazo de entrega, condição…" />
            </div>
          </div>
          <DialogFooter>
            <CarboButton variant="outline" onClick={() => setAdding(null)}>Cancelar</CarboButton>
            <CarboButton onClick={doAdd} disabled={!supplier.trim() || add.isPending}>Adicionar</CarboButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
