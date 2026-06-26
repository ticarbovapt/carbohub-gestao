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

const COST_CENTERS = [
  "Operações", "Manutenção", "Logística", "Administrativo", "Comercial", "TI",
  "Marketing", "Qualidade", "Financeiro", "RH", "Jurídico", "P&D", "Compras", "Produção",
];
const UNITS = ["un", "kg", "g", "L", "mL", "m", "cm", "m²", "m³", "pç", "cx", "pct", "par", "h", "km"];

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "muted" }> = {
  rascunho: { label: "Rascunho", variant: "muted" },
  aguardando_aprovacao: { label: "Aguardando aprovação", variant: "warning" },
  aprovada: { label: "Aprovada", variant: "success" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
  convertida_pc: { label: "Convertida em OC", variant: "default" },
};

const emptyItem = (): ReqItem => ({ descricao: "", quantidade: 1, unidade: "un", valor_unitario: 0 });

export default function RequisicaoCompra() {
  const create = useCreatePurchaseRequest();
  const { data: minhas = [], isLoading } = useMyPurchaseRequests();

  const [costCenter, setCostCenter] = useState("");
  const [purchaseType, setPurchaseType] = useState("uso_direto");
  const [supplier, setSupplier] = useState("");
  const [justification, setJustification] = useState("");
  const [impact, setImpact] = useState("");
  const [items, setItems] = useState<ReqItem[]>([emptyItem()]);

  const estimated = items.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);

  const updateItem = (idx: number, field: keyof ReqItem, value: any) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const addItem = () => setItems((p) => [...p, emptyItem()]);
  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const reset = () => {
    setCostCenter(""); setPurchaseType("uso_direto"); setSupplier("");
    setJustification(""); setImpact(""); setItems([emptyItem()]);
  };

  const submit = async (asDraft: boolean) => {
    if (!costCenter) { toast.error("Selecione o centro de custo."); return; }
    if (!justification.trim()) { toast.error("Preencha a justificativa."); return; }
    if (items.some((i) => !i.descricao.trim())) { toast.error("Descreva todos os itens."); return; }
    try {
      await create.mutateAsync({
        cost_center: costCenter,
        purchase_type: purchaseType,
        suggested_supplier: supplier || null,
        estimated_value: estimated,
        justification,
        operational_impact: impact || null,
        items,
        status: asDraft ? "rascunho" : "aguardando_aprovacao",
      });
      reset();
    } catch { /* erro tratado no hook */ }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1100px] mx-auto">
        <CarboPageHeader
          title="Requisição de Compra"
          description="Solicite uma compra — o restante do fluxo (aprovação, OC, NF, contas a pagar) acontece no Carbo Finanças"
          icon={ShoppingCart}
        />

        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>A requisição enviada aqui aparece na aba <strong>Requisições</strong> do <strong>Carbo Finanças</strong>, onde é aprovada e segue o fluxo de compra.</span>
        </div>

        {/* Formulário */}
        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Nova Requisição</CarboCardTitle></CarboCardHeader>
          <CarboCardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Centro de Custo *</Label>
                <Select value={costCenter} onValueChange={setCostCenter}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{COST_CENTERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Compra</Label>
                <Select value={purchaseType} onValueChange={setPurchaseType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estoque">Estoque</SelectItem>
                    <SelectItem value="uso_direto">Uso Direto</SelectItem>
                    <SelectItem value="investimento">Investimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fornecedor Sugerido</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Opcional" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Justificativa *</Label>
              <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Descreva a necessidade..." />
            </div>
            <div className="space-y-1.5">
              <Label>Impacto Operacional</Label>
              <Textarea value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Descreva o impacto se não aprovado..." />
            </div>

            {/* Itens */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Itens da Requisição</Label>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1"><Plus className="h-3.5 w-3.5" /> Adicionar Item</Button>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      {idx === 0 && <Label className="text-xs">Descrição</Label>}
                      <Input value={item.descricao} onChange={(e) => updateItem(idx, "descricao", e.target.value)} placeholder="Descrição do item" />
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
                    <div className="col-span-1 flex justify-center">
                      {items.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-right">
                <span className="text-sm text-muted-foreground">Valor Estimado: </span>
                <span className="text-lg font-bold">{brl(estimated)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={reset} disabled={create.isPending}>Limpar</Button>
              <Button variant="secondary" onClick={() => submit(true)} disabled={create.isPending}>
                {create.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando…</> : "Salvar Rascunho"}
              </Button>
              <Button onClick={() => submit(false)} disabled={create.isPending} className="bg-carbo-green hover:bg-carbo-green/90 text-white">
                Enviar para Aprovação
              </Button>
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* Minhas requisições */}
        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Minhas Requisições</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : minhas.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Você ainda não criou requisições.</p>
            ) : (
              <CarboTable>
                <CarboTableHeader>
                  <CarboTableRow>
                    <CarboTableHead>Nº RC</CarboTableHead>
                    <CarboTableHead>Centro de Custo</CarboTableHead>
                    <CarboTableHead>Tipo</CarboTableHead>
                    <CarboTableHead className="text-right">Valor Estimado</CarboTableHead>
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
                        <CarboTableCell>{r.cost_center}</CarboTableCell>
                        <CarboTableCell className="capitalize">{r.purchase_type?.replace(/_/g, " ")}</CarboTableCell>
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
