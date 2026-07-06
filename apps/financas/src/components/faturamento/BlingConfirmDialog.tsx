import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, UserPlus, AlertTriangle, Receipt } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  usePreviewBlingPedido, useCreateBlingPedido,
  type FaturamentoOrder, type BlingPreview, type BlingContactToCreate,
} from "@/hooks/useFaturamento";

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const fmtDoc = (d: string) => {
  const s = onlyDigits(d);
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
};

interface ContactForm {
  nome: string; tipo: "F" | "J" | "E"; numeroDocumento: string;
  ie: string; indicadorIe: 1 | 2 | 9; email: string; telefone: string;
  endereco: string; numero: string; complemento: string;
  bairro: string; cep: string; municipio: string; uf: string;
}

function toForm(c: BlingContactToCreate): ContactForm {
  const g = c.endereco?.geral ?? {};
  return {
    nome: c.nome ?? "", tipo: c.tipo ?? "J", numeroDocumento: c.numeroDocumento ?? "",
    ie: c.ie ?? "", indicadorIe: (c.indicadorIe ?? (c.ie ? 1 : 9)) as 1 | 2 | 9,
    email: c.email ?? "", telefone: c.telefone ?? "",
    endereco: g.endereco ?? "", numero: g.numero ?? "", complemento: g.complemento ?? "",
    bairro: g.bairro ?? "", cep: g.cep ?? "", municipio: g.municipio ?? "", uf: g.uf ?? "",
  };
}

// Confirmação humana OBRIGATÓRIA antes de mandar pro Bling. Mostra o que será
// enviado e, se o cliente não existe, deixa o financeiro CONFERIR e CORRIGIR o
// cadastro (Bairro/Número/IE/etc.) antes de criar. Nada é criado antes do clique.
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
  const [form, setForm] = useState<ContactForm | null>(null);

  useEffect(() => {
    if (!order) { setData(null); setError(null); setForm(null); return; }
    let alive = true;
    setData(null); setError(null); setForm(null);
    preview.mutateAsync(order.id)
      .then((p) => {
        if (!alive) return;
        setData(p);
        if (!p.contact_found && p.contact_to_create) setForm(toForm(p.contact_to_create));
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Erro ao pré-visualizar"); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const willCreate = !!data && !data.contact_found && !!form;
  const set = (k: keyof ContactForm, v: string | number) => setForm((f) => (f ? { ...f, [k]: v } as ContactForm : f));

  // Campos que o Bling EXIGE para o cadastro do cliente — sem eles a NF-e trava.
  const missing = willCreate && form
    ? ([
        !form.nome.trim() && "Nome",
        !form.municipio.trim() && "Cidade",
        !form.uf.trim() && "UF",
        !form.bairro.trim() && "Bairro",
        !form.numero.trim() && "Número",
      ].filter(Boolean) as string[])
    : [];
  const canConfirm = !!data && !error && missing.length === 0 && !createBling.isPending;

  const obs = String(data?.payload?.observacoes ?? "");

  async function confirmar() {
    if (!order || !canConfirm) return;
    // Abre a aba do Bling já no clique (evita bloqueio de popup); redireciona ao criar.
    const win = window.open("about:blank", "_blank");
    try {
      const contact: BlingContactToCreate | null = willCreate && form ? {
        nome: form.nome.trim(),
        tipo: form.tipo,
        numeroDocumento: form.numeroDocumento,
        indicadorIe: form.indicadorIe,
        ...(form.ie.trim() ? { ie: form.ie.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.telefone.trim() ? { telefone: form.telefone.trim() } : {}),
        endereco: { geral: {
          ...(form.endereco.trim() ? { endereco: form.endereco.trim() } : {}),
          ...(form.numero.trim() ? { numero: form.numero.trim() } : {}),
          ...(form.complemento.trim() ? { complemento: form.complemento.trim() } : {}),
          ...(form.bairro.trim() ? { bairro: form.bairro.trim() } : {}),
          ...(form.cep.trim() ? { cep: form.cep.trim() } : {}),
          ...(form.municipio.trim() ? { municipio: form.municipio.trim() } : {}),
          ...(form.uf.trim() ? { uf: form.uf.trim() } : {}),
        } },
      } : null;
      await createBling.mutateAsync({ orderId: order.id, contact });
      const url = "https://www.bling.com.br/vendas.php";
      if (win && !win.closed) win.location.href = url; else window.open(url, "_blank", "noopener");
      onOpenChange(false);
    } catch {
      if (win && !win.closed) win.close();
    }
  }

  const fieldCls = "h-9";

  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar pedido no Bling</DialogTitle>
          <DialogDescription>
            Confira (e ajuste, se for cliente novo) os dados antes de enviar. Nada é
            criado no Bling até você clicar em <strong>Confirmar e criar</strong>.
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
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
              <div>
                <p className="font-semibold">{data.order_number}</p>
                <p className="text-xs text-muted-foreground">{data.customer_name}</p>
              </div>
            </div>

            {/* Cliente já cadastrado */}
            {data.contact_found ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-emerald-600">Cliente já cadastrado no Bling</p>
                  {data.contact_source && <p className="text-xs text-muted-foreground">Encontrado por {data.contact_source}.</p>}
                </div>
              </div>
            ) : form ? (
              /* Cliente novo — formulário editável para conferir/corrigir */
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-amber-500 shrink-0" />
                  <p className="font-medium text-amber-600">Cliente novo — confira e ajuste o cadastro</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Nome / Razão social *</Label>
                    <Input className={fieldCls} value={form.nome} onChange={(e) => set("nome", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{form.tipo === "J" ? "CNPJ" : "CPF"}</Label>
                    <Input className={`${fieldCls} bg-muted/40`} value={fmtDoc(form.numeroDocumento)} readOnly />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Inscrição Estadual</Label>
                    <Input className={fieldCls} value={form.ie} onChange={(e) => set("ie", e.target.value)} placeholder="ISENTO / número" />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Contribuinte (ICMS)</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={form.indicadorIe}
                      onChange={(e) => set("indicadorIe", Number(e.target.value))}
                    >
                      <option value={1}>1 - Contribuinte ICMS</option>
                      <option value={2}>2 - Contribuinte isento</option>
                      <option value={9}>9 - Não contribuinte</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">E-mail</Label>
                    <Input className={fieldCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Telefone</Label>
                    <Input className={fieldCls} value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Endereço</Label>
                    <Input className={fieldCls} value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Rua / logradouro" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Número *</Label>
                    <Input className={fieldCls} value={form.numero} onChange={(e) => set("numero", e.target.value)} placeholder="S/N" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bairro *</Label>
                    <Input className={fieldCls} value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cidade *</Label>
                    <Input className={fieldCls} value={form.municipio} onChange={(e) => set("municipio", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">UF *</Label>
                      <Input className={`${fieldCls} uppercase`} maxLength={2} value={form.uf} onChange={(e) => set("uf", e.target.value.toUpperCase())} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">CEP</Label>
                      <Input className={fieldCls} value={form.cep} onChange={(e) => set("cep", e.target.value)} />
                    </div>
                  </div>
                </div>

                {missing.length > 0 && (
                  <p className="text-xs text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Preencha para o Bling aceitar: <strong>{missing.join(", ")}</strong>
                  </p>
                )}
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

            {/* Observação */}
            {obs && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observação da NF</p>
                <p className="text-xs rounded bg-muted/30 px-2 py-1.5 break-words">{obs}</p>
              </div>
            )}

            {/* Avisos do preview (produto não casado, endereço de entrega, etc.) */}
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
          <CarboButton onClick={confirmar} disabled={!canConfirm}>
            {createBling.isPending
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Criando…</>
              : <><Receipt className="h-4 w-4 mr-1" /> Confirmar e criar no Bling</>}
          </CarboButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
