import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, UserPlus, AlertTriangle, Receipt } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import {
  usePreviewBlingPedido, useCreateBlingPedido,
  type FaturamentoOrder, type BlingPreview,
} from "@/hooks/useFaturamento";

const fmtDoc = (d: string) => {
  const s = (d || "").replace(/\D/g, "");
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
};

// Confirmação humana antes de mandar pro Bling. Mostra o que será enviado —
// inclusive, se o cliente não existir, o CADASTRO que será criado — para o
// financeiro conferir e só então confirmar. Nada é criado antes do clique.
export function BlingConfirmDialog({
  order, onOpenChange,
}: {
  order: FaturamentoOrder | null;
  onOpenChange: (open: boolean) => void;
}) {
  const preview = usePreviewBlingPedido();
  const createBling = useCreateBlingPedido();
  const [data, setData] = useState<BlingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) { setData(null); setError(null); return; }
    let alive = true;
    setData(null); setError(null);
    preview.mutateAsync(order.id)
      .then((p) => { if (alive) setData(p); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Erro ao pré-visualizar"); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const c = data?.contact_to_create;
  const endereco = c?.endereco?.geral;
  const obs = String(data?.payload?.observacoes ?? "");

  async function confirmar() {
    if (!order) return;
    try {
      await createBling.mutateAsync(order.id);
      onOpenChange(false);
    } catch { /* toast no hook mostra o erro real */ }
  }

  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar pedido no Bling</DialogTitle>
          <DialogDescription>
            Confira os dados antes de enviar. O pedido é criado no Bling e a NF-e é
            emitida por você lá — nada é criado antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        {!data && !error && (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Montando a pré-visualização…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-4 py-1 text-sm">
            {/* Pedido */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
              <div>
                <p className="font-semibold">{data.order_number}</p>
                <p className="text-xs text-muted-foreground">{data.customer_name}</p>
              </div>
            </div>

            {/* Cliente no Bling */}
            {data.contact_found ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-emerald-600">Cliente já cadastrado no Bling</p>
                  {data.contact_source && <p className="text-xs text-muted-foreground">Encontrado por {data.contact_source}.</p>}
                </div>
              </div>
            ) : c ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-amber-500 shrink-0" />
                  <p className="font-medium text-amber-600">Cliente novo — será cadastrado no Bling</p>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Nome</dt><dd className="font-medium">{c.nome || "—"}</dd>
                  <dt className="text-muted-foreground">Tipo</dt><dd>{c.tipo === "J" ? "Pessoa Jurídica" : c.tipo === "F" ? "Pessoa Física" : "Estrangeiro"}</dd>
                  <dt className="text-muted-foreground">{c.tipo === "J" ? "CNPJ" : "CPF"}</dt><dd className="font-medium">{fmtDoc(c.numeroDocumento)}</dd>
                  {c.ie && (<><dt className="text-muted-foreground">Inscr. Estadual</dt><dd>{c.ie}</dd></>)}
                  {c.email && (<><dt className="text-muted-foreground">E-mail</dt><dd>{c.email}</dd></>)}
                  {c.telefone && (<><dt className="text-muted-foreground">Telefone</dt><dd>{c.telefone}</dd></>)}
                  {endereco && (endereco.endereco || endereco.municipio) && (
                    <>
                      <dt className="text-muted-foreground">Endereço</dt>
                      <dd>
                        {[endereco.endereco, endereco.numero].filter(Boolean).join(", ")}
                        {endereco.bairro ? ` — ${endereco.bairro}` : ""}
                        {(endereco.municipio || endereco.uf) ? ` — ${[endereco.municipio, endereco.uf].filter(Boolean).join("/")}` : ""}
                        {endereco.cep ? ` — CEP ${endereco.cep}` : ""}
                      </dd>
                    </>
                  )}
                </dl>
                <p className="text-[11px] text-muted-foreground">
                  Confira os dados. Depois de criado, você ainda revisa e emite a NF-e no Bling.
                </p>
              </div>
            ) : null}

            {/* Itens */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Itens</p>
              <div className="space-y-1">
                {data.items_summary.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {it.matched
                      ? <CarboBadge variant="success" className="shrink-0">catálogo</CarboBadge>
                      : <CarboBadge variant="warning" className="shrink-0">descrição livre</CarboBadge>}
                    <span className="truncate">{it.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Observação (nº do pedido + vendedor) */}
            {obs && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observação da NF</p>
                <p className="text-xs rounded bg-muted/30 px-2 py-1.5 break-words">{obs}</p>
              </div>
            )}

            {/* Avisos */}
            {data.warnings.length > 0 && (
              <div className="space-y-1">
                {data.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-600">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <CarboButton variant="outline" onClick={() => onOpenChange(false)} disabled={createBling.isPending}>
            Cancelar
          </CarboButton>
          <CarboButton onClick={confirmar} disabled={!data || !!error || createBling.isPending}>
            {createBling.isPending
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Criando…</>
              : <><Receipt className="h-4 w-4 mr-1" /> Confirmar e criar no Bling</>}
          </CarboButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
