import { useState } from "react";
import { PackageCheck, FileUp, Loader2, CheckCircle2, XCircle, ShoppingCart, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { supabase } from "@/integrations/supabase/client";
import { useCreateReceiving, useCreateInvoice, useCreatePayable, usePurchaseReceivings, useRegisterOCPurchase } from "@/hooks/usePurchasing";
import { usePaymentMethods, labelPaymentMethod } from "@/hooks/usePaymentMethods";
import { PAYMENT_METHOD_TYPE_LABELS, type PurchaseOrder, type PurchaseReceiving, type ReceivedItem } from "@/types/purchasing";
import { hojeISO } from "@/lib/datas";

const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Hoje em BRASÍLIA — o `toISOString()` de antes já era amanhã depois das 21h.
const today = hojeISO;

/**
 * Quanto de cada item da OC JÁ chegou, somando os recebimentos anteriores.
 * Recebimento parcial deixava a OC sem caminho: a fila a escondia e, se
 * aparecesse, a conferência esperava a quantidade INTEIRA de novo.
 *
 * O item é casado pela POSIÇÃO (o recebimento é montado com `items.map`, na
 * mesma ordem da OC) e, se a descrição não bater, pela descrição. Item marcado
 * "rejeitado" não conta como recebido — ele ainda precisa chegar.
 */
export function jaRecebidoPorItem(oc: PurchaseOrder, receivings: PurchaseReceiving[]): number[] {
  const itens = (oc.items ?? []) as any[];
  const daOC = receivings.filter((r) => r.purchase_order_id === oc.id);
  return itens.map((it, i) => {
    let soma = 0;
    for (const r of daOC) {
      const lista = (r.items_received ?? []) as ReceivedItem[];
      let x: ReceivedItem | undefined = lista[i];
      if (!x || x.descricao !== it.descricao) x = lista.find((y) => y.descricao === it.descricao) ?? x;
      if (!x || x.status_qualidade === "rejeitado") continue;
      soma += Number(x.qtd_recebida) || 0;
    }
    return soma;
  });
}

/** Saldo a receber por item (pedido − já recebido, nunca negativo). */
export function saldoPorItem(oc: PurchaseOrder, receivings: PurchaseReceiving[]): number[] {
  const ja = jaRecebidoPorItem(oc, receivings);
  return ((oc.items ?? []) as any[]).map((it, i) => Math.max(0, (Number(it.quantidade) || 0) - ja[i]));
}

// ── Registrar compra da OC (forma de pagamento + pago) ───────────────────────
export function RegistrarCompraDialog({ oc, onClose }: { oc: PurchaseOrder | null; onClose: () => void }) {
  const register = useRegisterOCPurchase();
  const { data: methods = [] } = usePaymentMethods(true);
  // "card:<id>" pra formas cadastradas; "type:pix|boleto|manual" pra avulsas.
  const [choice, setChoice] = useState<string>("");
  const [isPaid, setIsPaid] = useState(true);
  const [venc, setVenc] = useState(today());
  const [lastId, setLastId] = useState<string | null>(null);
  if (oc && oc.id !== lastId) { setLastId(oc.id); setChoice(""); setIsPaid(true); setVenc(today()); }
  if (!oc) return null;

  // "Já paga" exige a forma de pagamento (como foi pago). "A pagar" exige a
  // previsão de vencimento (a forma de pagamento fica pra depois, na conta).
  const canSubmit = isPaid ? !!choice : !!venc;

  const submit = () => {
    if (!canSubmit) return;
    const [kind, val] = choice.split(":");
    const payload = isPaid
      ? (kind === "card"
          ? { id: oc.id, payment_method_id: val, payment_type: null, is_paid: true }
          : { id: oc.id, payment_method_id: null, payment_type: kind === "type" ? val : null, is_paid: true })
      : { id: oc.id, payment_method_id: null, payment_type: null, is_paid: false, payment_due_date: venc };
    register.mutate(payload, { onSuccess: onClose });
  };

  return (
    <Dialog open={!!oc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar compra — {oc.oc_number}</DialogTitle>
          <DialogDescription>Fornecedor {oc.supplier_name} · {brl(Number(oc.total_value))}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {/* 1º: já pagou ou vai pagar? */}
          <div className="space-y-1.5">
            <Label>Essa compra…</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setIsPaid(true)}
                className={`rounded-lg border px-3 py-2.5 text-sm text-left transition-colors ${isPaid ? "border-carbo-green bg-carbo-green/10 text-carbo-green font-medium" : "border-border text-muted-foreground hover:border-carbo-green/40"}`}
              >
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Já foi paga</div>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-normal">Pagamento feito agora</p>
              </button>
              <button
                type="button" onClick={() => setIsPaid(false)}
                className={`rounded-lg border px-3 py-2.5 text-sm text-left transition-colors ${!isPaid ? "border-carbo-green bg-carbo-green/10 text-carbo-green font-medium" : "border-border text-muted-foreground hover:border-carbo-green/40"}`}
              >
                <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Vou pagar depois</div>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-normal">A conta a pagar nasce ao lançar a NF</p>
              </button>
            </div>
          </div>

          {/* 2º: depende da escolha acima */}
          {isPaid ? (
            <div className="space-y-1.5">
              <Label>Como foi pago? *</Label>
              <Select value={choice} onValueChange={setChoice}>
                <SelectTrigger><SelectValue placeholder="Forma de pagamento" /></SelectTrigger>
                <SelectContent>
                  {methods.length > 0 && methods.map((m) => (
                    <SelectItem key={m.id} value={`card:${m.id}`}>{labelPaymentMethod(m)}</SelectItem>
                  ))}
                  <SelectItem value="type:pix">{PAYMENT_METHOD_TYPE_LABELS.pix}</SelectItem>
                  <SelectItem value="type:boleto">{PAYMENT_METHOD_TYPE_LABELS.boleto}</SelectItem>
                  <SelectItem value="type:manual">{PAYMENT_METHOD_TYPE_LABELS.manual}</SelectItem>
                </SelectContent>
              </Select>
              {methods.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Cadastre cartões na aba "Cartões" pra escolher aqui.</p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Previsão de vencimento *</Label>
              <Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Usada pra pré-preencher a conta a pagar ao lançar a NF.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!canSubmit || register.isPending} className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white">
            {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Confirmar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Receber contra a OC ──────────────────────────────────────────────────────
// A quantidade ESPERADA é o SALDO: numa OC parcialmente recebida, o que falta.
export function ReceberDialog({ oc, onClose }: { oc: PurchaseOrder | null; onClose: () => void }) {
  const create = useCreateReceiving();
  // Mesma consulta (e cache) da lista de Recebimento — não lê nada a mais.
  const { data: receivings = [], isLoading: carregando } = usePurchaseReceivings();
  const items = (oc?.items ?? []) as any[];
  const ja = oc ? jaRecebidoPorItem(oc, receivings) : [];
  const saldo = oc ? saldoPorItem(oc, receivings) : [];
  const temAnterior = ja.some((q) => q > 0);
  const [rows, setRows] = useState<Record<number, { recebida: number; qualidade: "ok" | "parcial" | "rejeitado" }>>({});
  const [notes, setNotes] = useState("");
  // Inicializa quando abre outra OC — e só depois de os recebimentos anteriores
  // chegarem, senão o saldo nasceria igual ao pedido inteiro.
  const chave = oc && !carregando ? oc.id : null;
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (chave && chave !== lastKey) {
    setLastKey(chave);
    const init: Record<number, { recebida: number; qualidade: "ok" | "parcial" | "rejeitado" }> = {};
    items.forEach((_it, i) => (init[i] = { recebida: saldo[i] ?? 0, qualidade: "ok" }));
    setRows(init); setNotes("");
  }
  if (!chave && lastKey && !oc) setLastKey(null);
  if (!oc) return null;

  const divergente = items.some((_it, i) => {
    const r = rows[i]; if (!r) return false;
    return r.recebida !== (saldo[i] ?? 0) || r.qualidade !== "ok";
  });

  const submit = () => {
    const items_received: ReceivedItem[] = items.map((it, i) => ({
      descricao: it.descricao,
      // ⚠️ O esperado DESTE recebimento (o saldo), não o pedido inteiro.
      qtd_esperada: saldo[i] ?? 0,
      qtd_recebida: rows[i]?.recebida ?? 0,
      status_qualidade: rows[i]?.qualidade ?? "ok",
    }));
    create.mutate({ purchase_order_id: oc.id, items_received, has_divergence: divergente, divergence_notes: divergente ? notes : undefined }, { onSuccess: onClose });
  };

  return (
    <Dialog open={!!oc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receber — {oc.oc_number}</DialogTitle>
          <DialogDescription>
            Confira o que chegou de {oc.supplier_name}. Divergência de quantidade/qualidade é registrada.
            {temAnterior && " Esta OC já teve recebimento: o esperado é o que ainda falta."}
          </DialogDescription>
        </DialogHeader>
        {carregando ? (
          <p className="py-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Conferindo recebimentos anteriores…</p>
        ) : (
          <div className="space-y-2 py-1">
            <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] text-muted-foreground px-1">
              <span className="col-span-5">Item</span><span className="col-span-2 text-right">Esperado</span><span className="col-span-2 text-right">Recebido</span><span className="col-span-3">Qualidade</span>
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 items-center rounded-lg border border-border p-2 sm:grid-cols-12 sm:border-0 sm:p-0">
                <div className="col-span-2 sm:col-span-5 min-w-0">
                  <p className="text-sm truncate">{it.descricao}</p>
                  {ja[i] > 0 && (
                    <p className="text-[11px] text-muted-foreground">pedido {it.quantidade} · já chegou {ja[i]}</p>
                  )}
                </div>
                <span className="col-span-2 text-sm sm:col-span-2 sm:text-right">
                  <span className="sm:hidden text-muted-foreground">Esperado: </span>{saldo[i] ?? 0} {it.unidade}
                </span>
                <Input className="col-span-1 h-9 text-right sm:col-span-2" type="number" min={0} aria-label="Quantidade recebida" value={rows[i]?.recebida ?? 0}
                  onChange={(e) => setRows((p) => ({ ...p, [i]: { ...(p[i] ?? { qualidade: "ok" }), recebida: Number(e.target.value) } as any }))} />
                <div className="col-span-1 sm:col-span-3">
                  <Select value={rows[i]?.qualidade ?? "ok"} onValueChange={(v) => setRows((p) => ({ ...p, [i]: { ...(p[i] ?? { recebida: 0 }), qualidade: v } as any }))}>
                    <SelectTrigger className="h-9" aria-label="Qualidade"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ok">OK</SelectItem>
                      <SelectItem value="parcial">Parcial</SelectItem>
                      <SelectItem value="rejeitado">Rejeitado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            {divergente && (
              <div className="space-y-1.5 pt-1">
                <Label>Observação da divergência *</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que veio diferente?" />
                <p className="text-[11px] text-muted-foreground">Com divergência a OC fica "parcialmente recebida" e volta para esta fila com o saldo.</p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={carregando || create.isPending || (divergente && !notes.trim())} className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Registrar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Lançar NF (com 3-way match automático) + gerar conta a pagar ─────────────
export function LancarNFDialog({ oc, onClose }: { oc: PurchaseOrder | null; onClose: () => void }) {
  const createInvoice = useCreateInvoice();
  const createPayable = useCreatePayable();
  const { data: receivings = [] } = usePurchaseReceivings();

  const [numero, setNumero] = useState("");
  const [dataNF, setDataNF] = useState(today());
  const [valor, setValor] = useState<number>(0);
  const [gerarPagavel, setGerarPagavel] = useState(true);
  const [vencimento, setVencimento] = useState(today());
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  // NF já gravada cuja conta a pagar FALHOU: o botão passa a tentar só a conta.
  // Reenviar o formulário inteiro criaria uma SEGUNDA NF.
  const [nfGravada, setNfGravada] = useState<{ id: string | undefined; erro: string } | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  // OC já paga não deve gerar conta a pagar (senão duplica). "A pagar" pré-preenche
  // o vencimento com a previsão registrada na compra.
  if (oc && oc.id !== lastId) { setLastId(oc.id); setNumero(""); setDataNF(today()); setValor(Number(oc.total_value) || 0); setGerarPagavel(!oc.is_paid); setVencimento(oc.payment_due_date || today()); setFile(null); setNfGravada(null); }
  if (!oc) return null;

  // 3-way match automático: OC existe; recebimento OK existe; valor bate (tol. 1%).
  const rec = receivings.find((r: any) => r.purchase_order_id === oc.id);
  const oc_match = true;
  const receiving_match = !!rec && rec.status === "conferido_ok";
  const value_match = Math.abs(valor - Number(oc.total_value)) <= Math.max(0.01, Number(oc.total_value) * 0.01);
  const matched = oc_match && receiving_match && value_match;

  const criarConta = async (invoiceId: string | undefined) => {
    try {
      await createPayable.mutateAsync({
        purchase_order_id: oc.id, invoice_id: invoiceId, supplier_name: oc.supplier_name,
        supplier_id: (oc as any).supplier_id || undefined,
        amount: valor, due_date: vencimento,
      });
      return true;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setNfGravada({ id: invoiceId, erro: msg });
      toast.error("NF gravada, mas a conta a pagar NÃO foi criada", { description: msg, duration: 20000 });
      return false;
    }
  };

  const submit = async () => {
    if (nfGravada) {
      if (await criarConta(nfGravada.id)) { setNfGravada(null); onClose(); }
      return;
    }
    if (!numero.trim()) return;
    let inv: any;
    let etapa: "anexo" | "nf" = "anexo";
    try {
      // Anexo opcional (PDF/XML) → Supabase Storage; guarda a URL pública na NF.
      let file_url: string | undefined;
      if (file) {
        setUploading(true);
        const safe = file.name.replace(/[^\w.\-]/g, "_");
        const path = `${oc.id}/${numero.trim()}-${safe}`;
        const up = await supabase.storage.from("purchase-invoices").upload(path, file, { upsert: true, contentType: file.type || undefined });
        setUploading(false);
        if (up.error) throw new Error(`Falha ao enviar o anexo: ${up.error.message}`);
        file_url = supabase.storage.from("purchase-invoices").getPublicUrl(path).data.publicUrl;
      }
      etapa = "nf";
      inv = await createInvoice.mutateAsync({
        purchase_order_id: oc.id, receiving_id: rec?.id, invoice_number: numero.trim(),
        invoice_date: dataNF, invoice_value: valor, file_url, oc_match, receiving_match, value_match,
      });
    } catch (e: any) {
      setUploading(false);
      // Nada foi gravado: a NF não existe, pode tentar de novo. O erro do INSERT
      // da NF o `onError` do useCreateInvoice já mostra; o do anexo só a tela sabe.
      if (etapa === "anexo") toast.error("A NF não foi lançada", { description: e?.message ?? String(e) });
      return;
    }
    if (gerarPagavel && !(await criarConta(inv?.id))) return;
    onClose();
  };

  const MatchTag = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${ok ? "text-success border-success/30 bg-success/10" : "text-destructive border-destructive/30 bg-destructive/10"}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} {label}
    </span>
  );

  return (
    <Dialog open={!!oc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar NF — {oc.oc_number}</DialogTitle>
          <DialogDescription>Fornecedor {oc.supplier_name} · OC {brl(Number(oc.total_value))}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Nº da NF *</Label><Input value={numero} disabled={!!nfGravada} onChange={(e) => setNumero(e.target.value)} placeholder="000123" /></div>
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={dataNF} disabled={!!nfGravada} onChange={(e) => setDataNF(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Valor da NF (R$)</Label><Input type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(Number(e.target.value))} /></div>

          <div className="flex items-center gap-2 flex-wrap">
            <MatchTag ok={oc_match} label="OC" />
            <MatchTag ok={receiving_match} label="Recebimento" />
            <MatchTag ok={value_match} label="Valor" />
            {matched ? <CarboBadge variant="success" className="text-[10px]">3-way OK</CarboBadge> : <CarboBadge variant="warning" className="text-[10px]">Divergência</CarboBadge>}
          </div>
          {!receiving_match && <p className="text-[11px] text-muted-foreground">Sem recebimento conferido pra esta OC — receba antes pra fechar o match.</p>}

          <div className="space-y-1.5">
            <Label>Anexo da NF (PDF ou XML)</Label>
            <Input type="file" accept=".pdf,.xml,application/pdf,text/xml,application/xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file
              ? <p className="text-[11px] text-muted-foreground truncate">Anexo: {file.name}</p>
              : <p className="text-[11px] text-muted-foreground">Opcional — fica arquivado e disponível pra download depois.</p>}
          </div>

          {nfGravada && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>NF gravada, mas a conta a pagar NÃO foi criada:</strong> {nfGravada.erro}.
                Confira vencimento e valor e tente criar a conta de novo — a NF não será lançada outra vez.
              </span>
            </div>
          )}
          {oc.is_paid && <p className="text-[11px] text-success">OC já paga na compra — normalmente não gera conta a pagar.</p>}
          <label className="flex items-center gap-2 text-sm pt-1">
            <input type="checkbox" checked={gerarPagavel} disabled={!!nfGravada} onChange={(e) => setGerarPagavel(e.target.checked)} /> Gerar conta a pagar
          </label>
          {gerarPagavel && (
            <div className="space-y-1.5"><Label>Vencimento</Label><Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{nfGravada ? "Fechar sem a conta" : "Cancelar"}</Button>
          <Button onClick={submit} disabled={(!nfGravada && !numero.trim()) || uploading || createInvoice.isPending || createPayable.isPending} className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white">
            {(uploading || createInvoice.isPending || createPayable.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {uploading ? "Enviando anexo…" : nfGravada ? "Tentar criar a conta a pagar" : `Lançar NF${gerarPagavel ? " + conta" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
