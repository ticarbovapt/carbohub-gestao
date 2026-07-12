import { useState } from "react";
import { Plus, Trash2, ShoppingCart, Info, Loader2 } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { toast } from "sonner";
import { useMyPurchaseRequests, useCreatePurchaseRequest, type ReqItem } from "@/hooks/usePurchaseRequests";

const UNITS = ["un", "kg", "g", "L", "mL", "m", "cm", "pç", "cx", "pct", "par"];

// No Sales a compra é sempre INDIVIDUAL (material de trabalho pessoal). Insumo do
// setor é pedido no Carbo Ops. Fluxo enxuto: categoria + itens + observação.
const CATEGORIAS: { value: string; label: string }[] = [
  { value: "material_escritorio", label: "Material de escritório" },
  { value: "equipamento",         label: "Equipamento / periférico" },
  { value: "epi",                 label: "EPI / segurança" },
  { value: "software",            label: "Software / licença" },
  { value: "outro",               label: "Outro" },
];

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "muted" }> = {
  rascunho: { label: "Rascunho", variant: "muted" },
  aguardando_aprovacao: { label: "Aguardando aprovação", variant: "warning" },
  aprovada: { label: "Aprovada", variant: "success" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
  convertida: { label: "Convertida em OC", variant: "default" },
};

const emptyItem = (): ReqItem => ({ descricao: "", quantidade: 1, unidade: "un", valor_unitario: 0 });

export default function RequisicaoCompra() {
  const create = useCreatePurchaseRequest();
  const { data: minhas = [], isLoading } = useMyPurchaseRequests();

  const [categoria, setCategoria] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [obs, setObs] = useState("");
  const [items, setItems] = useState<ReqItem[]>([emptyItem()]);

  const estimated = items.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);

  const updateItem = (idx: number, field: keyof ReqItem, value: any) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const addItem = () => setItems((p) => [...p, emptyItem()]);
  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const reset = () => { setCategoria(""); setReferenceUrl(""); setObs(""); setItems([emptyItem()]); };

  const submit = async (asDraft: boolean) => {
    if (!categoria) { toast.error("Selecione a categoria."); return; }
    if (items.some((i) => !i.descricao.trim())) { toast.error("Descreva todos os itens."); return; }
    try {
      await create.mutateAsync({
        escopo: "individual",
        motivo: categoria,
        purchase_type: "uso_direto",
        cost_center: "Pessoal",
        priority: "normal",
        reference_url: referenceUrl || null,
        estimated_value: estimated,
        justification: obs || null,
        items,
        status: asDraft ? "rascunho" : "aguardando_aprovacao",
      });
      reset();
    } catch { /* erro tratado no hook */ }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1000px] mx-auto">
        <CarboPageHeader
          title="Solicitar Compra"
          description="Material de trabalho para você — o financeiro aprova e faz a compra"
          icon={ShoppingCart}
        />

        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Compra <strong>pessoal</strong> (uso próprio). Vai para a aba <strong>Requisições</strong> do <strong>Carbo Finanças</strong> pra aprovação. <em>Insumo do setor é pedido no Carbo Ops.</em></span>
        </div>

        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Nova solicitação</CarboCardTitle></CarboCardHeader>
          <CarboCardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Categoria *</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger><SelectValue placeholder="O que você precisa?" /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Link de referência (opcional)</Label>
                <Input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="Cole o link do produto, se tiver" />
              </div>
            </div>

            {/* Itens */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Itens</Label>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1"><Plus className="h-3.5 w-3.5" /> Adicionar item</Button>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-6">
                      {idx === 0 && <Label className="text-xs">Descrição</Label>}
                      <Input value={item.descricao} onChange={(e) => updateItem(idx, "descricao", e.target.value)} placeholder="O que comprar" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <Label className="text-xs">Qtd</Label>}
                      <Input type="number" min={1} value={item.quantidade} onChange={(e) => updateItem(idx, "quantidade", Number(e.target.value))} />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <Label className="text-xs">Un.</Label>}
                      <Select value={item.unidade} onValueChange={(v) => updateItem(idx, "unidade", v)}>
                        <SelectTrigger className="h-9 px-2 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <Label className="text-xs">Valor Unit.</Label>}
                      <Input type="number" min={0} step={0.01} value={item.valor_unitario} onChange={(e) => updateItem(idx, "valor_unitario", Number(e.target.value))} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-right">
                <span className="text-sm text-muted-foreground">Valor estimado: </span>
                <span className="text-lg font-bold">{brl(estimated)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Pra que você precisa, se ajudar o financeiro a decidir." rows={2} />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={reset} disabled={create.isPending}>Limpar</Button>
              <Button variant="secondary" onClick={() => submit(true)} disabled={create.isPending}>
                {create.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando…</> : "Salvar rascunho"}
              </Button>
              <Button onClick={() => submit(false)} disabled={create.isPending} className="bg-carbo-green hover:bg-carbo-green/90 text-white">
                Enviar para aprovação
              </Button>
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* Minhas solicitações */}
        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Minhas Solicitações</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : minhas.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Você ainda não fez solicitações.</p>
            ) : (
              <CarboTable>
                <CarboTableHeader>
                  <CarboTableRow>
                    <CarboTableHead>Nº</CarboTableHead>
                    <CarboTableHead className="text-right">Valor</CarboTableHead>
                    <CarboTableHead>Status</CarboTableHead>
                    <CarboTableHead>Data</CarboTableHead>
                  </CarboTableRow>
                </CarboTableHeader>
                <CarboTableBody>
                  {minhas.map((r) => {
                    const st = STATUS_LABEL[r.status] ?? { label: r.status, variant: "default" as const };
                    return (
                      <CarboTableRow key={r.id}>
                        <CarboTableCell className="font-medium">{r.rc_number === "TEMP" ? "—" : r.rc_number}</CarboTableCell>
                        <CarboTableCell className="text-right">{brl(Number(r.estimated_value))}</CarboTableCell>
                        <CarboTableCell><CarboBadge variant={st.variant}>{st.label}</CarboBadge></CarboTableCell>
                        <CarboTableCell>{fmtDate(r.created_at)}</CarboTableCell>
                      </CarboTableRow>
                    );
                  })}
                </CarboTableBody>
              </CarboTable>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>
    </div>
  );
}
