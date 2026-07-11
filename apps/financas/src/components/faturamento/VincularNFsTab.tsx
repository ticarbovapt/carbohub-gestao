import { useState } from "react";
import { Link2, FileText, Search, Loader2 } from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { NfeLinkSuggestions } from "./NfeLinkSuggestions";
import { BaixarNFButton } from "./BaixarNFButton";
import { Pager, useUrlPage, paginate } from "./Pager";
import {
  useOrphanNFes, useLinkableOrders, useLinkNFeToOrder, type OrphanNFe,
} from "@/hooks/useNfeLinking";

const fmtBRL = (v: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = s.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s;
};

// Diálogo de vínculo manual: escolhe o pedido (sem NF) pra casar com a NF.
function LinkDialog({ nfe, onClose }: { nfe: OrphanNFe | null; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const { data: orders = [], isLoading } = useLinkableOrders(search, !!nfe);
  const link = useLinkNFeToOrder();

  return (
    <Dialog open={!!nfe} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular NF {nfe?.numero || ""} a um pedido</DialogTitle>
          <DialogDescription>
            {nfe?.contato_nome} · {fmtBRL(nfe?.valor_total ?? 0)} · {fmtDate(nfe?.data_emissao ?? null)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <CarboSearchInput placeholder="Buscar pedido por nº ou cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y">
            {isLoading ? (
              <div className="p-3"><CarboSkeleton className="h-10 w-full" /></div>
            ) : orders.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum pedido sem NF encontrado.</p>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold">{o.order_number}</p>
                    <p className="text-xs truncate">{o.customer_name || "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtBRL(o.total)} · {fmtDate(o.created_at)}</p>
                  </div>
                  <CarboButton
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={link.isPending}
                    onClick={() => nfe && link.mutate({ nfeId: nfe.id, orderNumber: o.order_number }, { onSuccess: onClose })}
                  >
                    <Link2 className="h-3.5 w-3.5" /> Vincular
                  </CarboButton>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VincularNFsTab() {
  const [search, setSearch] = useState("");
  const { data: orphans = [], isLoading } = useOrphanNFes(search);
  const [linking, setLinking] = useState<OrphanNFe | null>(null);
  const [page, setPage] = useUrlPage("pvinc");
  const pag = paginate(orphans, page);

  return (
    <div className="space-y-4">
      {/* Recomendações automáticas (cliente + valor + data) — confirmar cada uma */}
      <NfeLinkSuggestions />

      {/* NFs sem pedido vinculado — baixar o PDF ou vincular na mão */}
      <CarboCard>
        <CarboCardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sm">NFs sem pedido vinculado</p>
              <p className="text-xs text-muted-foreground">Baixe o PDF ou vincule ao pedido certo manualmente (o que as sugestões não casaram).</p>
            </div>
            <div className="w-full sm:w-72">
              <CarboSearchInput placeholder="Buscar NF por nº ou cliente…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <CarboSkeleton key={i} className="h-12 w-full" />)}</div>
          ) : orphans.length === 0 ? (
            <CarboEmptyState icon={FileText} title="Nenhuma NF pendente" description={search ? "Nenhuma NF encontrada." : "Todas as NFs importadas já estão vinculadas a um pedido."} />
          ) : (
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>NF</CarboTableHead>
                  <CarboTableHead>Cliente</CarboTableHead>
                  <CarboTableHead>Emissão</CarboTableHead>
                  <CarboTableHead className="text-right">Valor</CarboTableHead>
                  <CarboTableHead className="text-right">Ações</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {pag.slice.map((n) => (
                  <CarboTableRow key={n.id}>
                    <CarboTableCell>
                      <CarboBadge variant="secondary" className="gap-1"><FileText className="h-3 w-3" /> {n.numero || n.bling_id}{n.serie ? `/${n.serie}` : ""}</CarboBadge>
                    </CarboTableCell>
                    <CarboTableCell className="max-w-[240px] truncate">{n.contato_nome || "—"}</CarboTableCell>
                    <CarboTableCell>{fmtDate(n.data_emissao)}</CarboTableCell>
                    <CarboTableCell className="text-right font-medium">{fmtBRL(n.valor_total)}</CarboTableCell>
                    <CarboTableCell>
                      <div className="flex items-center justify-end gap-2">
                        <BaixarNFButton blingNfId={n.bling_id} label="Baixar" />
                        <CarboButton size="sm" variant="outline" className="gap-1.5" onClick={() => setLinking(n)}>
                          <Search className="h-3.5 w-3.5" /> Vincular
                        </CarboButton>
                      </div>
                    </CarboTableCell>
                  </CarboTableRow>
                ))}
              </CarboTableBody>
            </CarboTable>
          )}

          {!isLoading && <Pager page={pag.safePage} pageCount={pag.pageCount} total={orphans.length} onPage={setPage} />}
        </CarboCardContent>
      </CarboCard>

      <LinkDialog nfe={linking} onClose={() => setLinking(null)} />
    </div>
  );
}
