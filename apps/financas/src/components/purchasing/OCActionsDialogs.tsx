import { useState } from "react";
import { PackageCheck, FileUp, Loader2, CheckCircle2, XCircle, ShoppingCart, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { supabase } from "@/integrations/supabase/client";
import { useCreateReceiving, useCreateInvoice, useCreatePayable, usePurchaseReceivings, useRegisterOCPurchase } from "@/hooks/usePurchasing";
import { usePaymentMethods, labelPaymentMethod } from "@/hooks/usePaymentMethods";
import { PAYMENT_METHOD_TYPE_LABELS, type PurchaseOrder, type ReceivedItem } from "@/types/purchasing";

const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => new Date().toISOString().slice(0, 10);

// ── Registrar compra da OC (forma de pagamento + pago) ───────────────────────
export function RegistrarCompraDialog({ oc, onClose }: { oc: PurchaseOrder | null; onClose: () => void }) {
  const register = useRegisterOCPurchase();
  const { data: methods = [] } = usePaymentMethods(true);
  // "card:<id>" pra formas cadastradas; "type:pix|boleto|manual" pra avulsas.
  const [choice, setChoice] = useState<string>("");
  const [isPaid, setIsPaid] = useState(true);
  const [lastId, setLastId] = useState<string | null>(null);
  if (oc && oc.id !== lastId) { setLastId(oc.id); setChoice(""); setIsPaid(true); }
  if (!oc) return null;

  const submit = () => {
    const [kind, val] = choice.split(":");
    const payload = kind === "card"
      ? { id: oc.id, payment_method_id: val, payment_type: null, is_paid: isPaid }
      : { id: oc.id, payment_method_id: null, payment_type: kind === "type" ? val : null, is_paid: isPaid };
    register.mutate(payload, { onSuccess: onClose });
  };

  return (
    <Dialog open={!!oc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar compra — {oc.oc_number}</DialogTitle>
          <DialogDescription>Fornecedor {oc.supplier_name} · {brl(Number(oc.total_value))}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger><SelectValue placeholder="Como foi pago?" /></SelectTrigger>
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
          <div className="space-y-1.5">
            <Label>Pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setIsPaid(true)}
                className={`rounded-lg border px-3 py-2.5 text-sm text-left transition-colors ${isPaid ? "border-carbo-green bg-carbo-green/10 text-carbo-green font-medium" : "border-border text-muted-foreground hover:border-carbo-green/40"}`}
              >
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Já paga</div>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-normal">Pagamento feito agora</p>
              </button>
              <button
                type="button" onClick={() => setIsPaid(false)}
                className={`rounded-lg border px-3 py-2.5 text-sm text-left transition-colors ${!isPaid ? "border-carbo-green bg-carbo-green/10 text-carbo-green font-medium" : "border-border text-muted-foreground hover:border-carbo-green/40"}`}
              >
                <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> A pagar</div>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-normal">Conta gerada na NF</p>
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!choice || register.isPending} className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white">
            {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Confirmar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Receber contra a OC ──────────────────────────────────────────────────────
export function ReceberDialog({ oc, onClose }: { oc: PurchaseOrder | null; onClose: () => void }) {
  const create = useCreateReceiving();
  const items = (oc?.items ?? []) as any[];
  const [rows, setRows] = useState<Record<number, { recebida: number; qualidade: "ok" | "parcial" | "rejeitado" }>>({});
  const [notes, setNotes] = useState("");
  // Inicializa quando abre outra OC
  const [lastId, setLastId] = useState<string | null>(null);
  if (oc && oc.id !== lastId) {
    setLastId(oc.id);
    const init: Record<number, { recebida: number; qualidade: "ok" | "parcial" | "rejeitado" }> = {};
    items.forEach((it, i) => (init[i] = { recebida: Number(it.quantidade) || 0, qualidade: "ok" }));
    setRows(init); setNotes("");
  }
  if (!oc) return null;

  const divergente = items.some((it, i) => {
    const r = rows[i]; if (!r) return false;
    return r.recebida !== (Number(it.quantidade) || 0) || r.qualidade !== "ok";
  });

  const submit = () => {
    const items_received: ReceivedItem[] = items.map((it, i) => ({
      descricao: it.descricao,
      qtd_esperada: Number(it.quantidade) || 0,
      qtd_recebida: rows[i]?.recebida ?? 0,
      status_qualidade: rows[i]?.qualidade ?? "ok",
    }));
    create.mutate({ purchase_order_id: oc.id, items_received, has_divergence: divergente, divergence_notes: divergente ? notes : undefined }, { onSuccess: onClose });
  };

  return (
    <Dialog open={!!oc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receber — {oc.oc_number}</DialogTitle>
          <DialogDescription>Confira o que chegou de {oc.supplier_name}. Divergência de quantidade/qualidade é registrada.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <div className="grid grid-cols-12 gap-2 text-[11px] text-muted-foreground px-1">
            <span className="col-span-5">Item</span><span className="col-span-2 text-right">Esperado</span><span className="col-span-2 text-right">Recebido</span><span className="col-span-3">Qualidade</span>
          </div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <span className="col-span-5 text-sm truncate">{it.descricao}</span>
              <span className="col-span-2 text-right text-sm">{it.quantidade} {it.unidade}</span>
              <Input className="col-span-2 h-9 text-right" type="number" min={0} value={rows[i]?.recebida ?? 0}
                onChange={(e) => setRows((p) => ({ ...p, [i]: { ...(p[i] ?? { qualidade: "ok" }), recebida: Number(e.target.value) } as any }))} />
              <div className="col-span-3">
                <Select value={rows[i]?.qualidade ?? "ok"} onValueChange={(v) => setRows((p) => ({ ...p, [i]: { ...(p[i] ?? { recebida: 0 }), qualidade: v } as any }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
              <Label>Observação da divergência</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que veio diferente?" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending} className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white">
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
  const [lastId, setLastId] = useState<string | null>(null);
  if (oc && oc.id !== lastId) { setLastId(oc.id); setNumero(""); setDataNF(today()); setValor(Number(oc.total_value) || 0); setGerarPagavel(true); setVencimento(today()); setFile(null); }
  if (!oc) return null;

  // 3-way match automático: OC existe; recebimento OK existe; valor bate (tol. 1%).
  const rec = receivings.find((r: any) => r.purchase_order_id === oc.id);
  const oc_match = true;
  const receiving_match = !!rec && rec.status === "conferido_ok";
  const value_match = Math.abs(valor - Number(oc.total_value)) <= Math.max(0.01, Number(oc.total_value) * 0.01);
  const matched = oc_match && receiving_match && value_match;

  const submit = async () => {
    if (!numero.trim()) return;
    try {
      // Anexo opcional (PDF/XML) → Supabase Storage; guarda a URL pública na NF.
      let file_url: string | undefined;
      if (file) {
        setUploading(true);
        const safe = file.name.replace(/[^\w.\-]/g, "_");
        const path = `${oc.id}/${numero.trim()}-${safe}`;
        const up = await supabase.storage.from("purchase-invoices").upload(path, file, { upsert: true, contentType: file.type || undefined });
        setUploading(false);
        if (up.error) throw up.error;
        file_url = supabase.storage.from("purchase-invoices").getPublicUrl(path).data.publicUrl;
      }
      const inv: any = await createInvoice.mutateAsync({
        purchase_order_id: oc.id, receiving_id: rec?.id, invoice_number: numero.trim(),
        invoice_date: dataNF, invoice_value: valor, file_url, oc_match, receiving_match, value_match,
      });
      if (gerarPagavel) {
        await createPayable.mutateAsync({
          purchase_order_id: oc.id, invoice_id: inv?.id, supplier_name: oc.supplier_name,
          supplier_id: (oc as any).supplier_id || undefined,
          amount: valor, due_date: vencimento,
        });
      }
      onClose();
    } catch { setUploading(false); /* erro tratado no hook */ }
  };

  const MatchTag = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${ok ? "text-success border-success/30 bg-success/10" : "text-destructive border-destructive/30 bg-destructive/10"}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} {label}
    </span>
  );

  return (
    <Dialog open={!!oc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar NF — {oc.oc_number}</DialogTitle>
          <DialogDescription>Fornecedor {oc.supplier_name} · OC {brl(Number(oc.total_value))}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Nº da NF *</Label><Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="000123" /></div>
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={dataNF} onChange={(e) => setDataNF(e.target.value)} /></div>
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

          <label className="flex items-center gap-2 text-sm pt-1">
            <input type="checkbox" checked={gerarPagavel} onChange={(e) => setGerarPagavel(e.target.checked)} /> Gerar conta a pagar
          </label>
          {gerarPagavel && (
            <div className="space-y-1.5"><Label>Vencimento</Label><Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!numero.trim() || uploading || createInvoice.isPending || createPayable.isPending} className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white">
            {(uploading || createInvoice.isPending || createPayable.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {uploading ? "Enviando anexo…" : `Lançar NF${gerarPagavel ? " + conta" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
