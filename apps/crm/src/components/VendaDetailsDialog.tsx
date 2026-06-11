import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Loader2, ShoppingBag, Building2, MapPin, FileText, Package, User } from "lucide-react";
import { useVenda } from "@/hooks/useVendas";

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateTime = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const STATUS_LABEL: Record<string, string> = { orcamento: "Orçamento", pedido: "Pedido", cancelado: "Cancelado" };
const STATUS_VARIANT: Record<string, "secondary" | "success" | "destructive"> = { orcamento: "secondary", pedido: "success", cancelado: "destructive" };
const TIPO_LABEL: Record<string, string> = { venda: "Venda", promo: "Ação Promocional" };

type Endereco = Record<string, unknown> | null;
function fmtEndereco(e: Endereco): string | null {
  if (!e) return null;
  const s = (k: string) => (e[k] != null ? String(e[k]) : "");
  const l1 = [s("logradouro"), s("numero")].filter(Boolean).join(", ");
  const l2 = [s("bairro"), [s("cidade"), s("uf")].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const cep = s("cep") ? `CEP ${s("cep")}` : "";
  return [l1, l2, cep].filter(Boolean).join(" — ") || null;
}

interface Props {
  vendaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p><p className="text-sm font-medium">{children ?? "—"}</p></div>
);

export function VendaDetailsDialog({ vendaId, open, onOpenChange }: Props) {
  const { data: v, isLoading } = useVenda(open ? vendaId : null);
  const itens = v?.itens ?? [];
  const numero = v ? (v.numero ?? `${v.status === "orcamento" ? "ORC" : "VND"}-${v.id.slice(0, 8).toUpperCase()}`) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-carbo-green" />
            <span className="font-mono">{numero || "Detalhes da venda"}</span>
            {v && <CarboBadge variant={STATUS_VARIANT[v.status] ?? "secondary"} size="sm">{STATUS_LABEL[v.status] ?? v.status}</CarboBadge>}
          </DialogTitle>
          <DialogDescription>{v ? `${TIPO_LABEL[v.tipo] ?? v.tipo} · criada em ${fmtDateTime(v.created_at)}` : "Carregando..."}</DialogDescription>
        </DialogHeader>

        {isLoading || !v ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Carregando...</div>
        ) : (
          <div className="space-y-5">
            {/* Cliente */}
            <section className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-carbo-green" /> Cliente</h4>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                <Campo label="Nome / Razão Social">{v.customer_name || "—"}</Campo>
                <Campo label="CNPJ / CPF">{v.customer_doc || "—"}</Campo>
                <Campo label="Inscrição Estadual">{v.customer_ie || "—"}</Campo>
                <Campo label="Licenciado">{v.is_licenciado ? "Sim" : "Não"}</Campo>
                <Campo label="E-mail">{v.customer_email || "—"}</Campo>
                <Campo label="Telefone">{v.customer_phone || "—"}</Campo>
              </div>
            </section>

            {/* Endereços */}
            <section className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-carbo-green" /> Entrega</h4>
                <p className="text-sm">{fmtEndereco(v.endereco) ?? <span className="text-muted-foreground">—</span>}</p>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-carbo-green" /> Faturamento (NF)</h4>
                <p className="text-sm">{v.endereco_faturamento ? fmtEndereco(v.endereco_faturamento) : <span className="text-muted-foreground">Mesmo da entrega</span>}</p>
              </div>
            </section>

            {/* Itens */}
            <section className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-carbo-green" /> Itens</h4>
              {itens.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem itens.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground text-xs">
                      <tr><th className="text-left p-2 font-medium">Produto</th><th className="text-right p-2 font-medium">Qtd</th><th className="text-right p-2 font-medium">Preço un.</th><th className="text-right p-2 font-medium">Bonif.</th><th className="text-right p-2 font-medium">Subtotal</th></tr>
                    </thead>
                    <tbody>
                      {itens.map((i, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{i.produto ?? "—"}</td>
                          <td className="p-2 text-right tabular-nums">{i.quantidade}</td>
                          <td className="p-2 text-right tabular-nums">{fmtBRL(Number(i.preco_unitario) || 0)}</td>
                          <td className="p-2 text-right tabular-nums">{i.bonificacao || 0}</td>
                          <td className="p-2 text-right tabular-nums font-medium">{fmtBRL((i.quantidade || 0) * (Number(i.preco_unitario) || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/20 font-semibold"><td className="p-2" colSpan={4}>Total</td><td className="p-2 text-right tabular-nums">{fmtBRL(Number(v.total) || 0)}</td></tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            {v.notes && (
              <section className="space-y-1">
                <h4 className="text-sm font-semibold">Observações</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{v.notes}</p>
              </section>
            )}

            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Atualizada em {fmtDateTime(v.updated_at)}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
