import { useState } from "react";
import { Plus, Trash2, ShoppingCart, Info, Loader2, Boxes, User } from "lucide-react";
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
  "Produção", "Operações", "Manutenção", "Logística", "Qualidade",
  "Administrativo", "Comercial", "TI", "Marketing", "Financeiro", "RH", "P&D", "Compras",
];
const UNITS = ["un", "kg", "g", "L", "mL", "m", "cm", "m²", "m³", "pç", "cx", "pct", "par", "h", "km"];

// Compra do SETOR: motivo estruturado. Cada motivo já define a natureza contábil
// (purchase_type) — o solicitante não precisa saber de "estoque/uso direto/capex".
const MOTIVOS_SETOR: { value: string; label: string; type: string }[] = [
  { value: "reposicao_safety", label: "Reposição — estoque de segurança atingido", type: "estoque" },
  { value: "ruptura",          label: "Ruptura — item em falta / vai faltar",      type: "estoque" },
  { value: "demanda",          label: "Aumento de demanda / pico",                 type: "estoque" },
  { value: "novo_projeto",     label: "Novo produto / projeto",                    type: "estoque" },
  { value: "manutencao",       label: "Manutenção / consumo de operação",          type: "uso_direto" },
  { value: "equipamento",      label: "Equipamento / investimento (capex)",        type: "investimento" },
  { value: "outro",            label: "Outro",                                     type: "estoque" },
];

// Compra INDIVIDUAL: categoria do material pessoal.
const CATEGORIAS_IND: { value: string; label: string }[] = [
  { value: "material_escritorio", label: "Material de escritório" },
  { value: "equipamento",         label: "Equipamento / periférico" },
  { value: "epi",                 label: "EPI / segurança" },
  { value: "software",            label: "Software / licença" },
  { value: "outro",               label: "Outro" },
];

const PRIORIDADES: { value: string; label: string }[] = [
  { value: "normal",  label: "Normal" },
  { value: "alta",    label: "Alta" },
  { value: "critica", label: "Crítica" },
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

  const [escopo, setEscopo] = useState<"setor" | "individual">("setor");
  const [motivo, setMotivo] = useState("");
  const [priority, setPriority] = useState("normal");
  const [neededBy, setNeededBy] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [supplier, setSupplier] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [obs, setObs] = useState("");
  const [items, setItems] = useState<ReqItem[]>([emptyItem()]);

  const isSetor = escopo === "setor";
  const estimated = items.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);

  const updateItem = (idx: number, field: keyof ReqItem, value: any) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const addItem = () => setItems((p) => [...p, emptyItem()]);
  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const switchEscopo = (e: "setor" | "individual") => { setEscopo(e); setMotivo(""); };

  const reset = () => {
    setEscopo("setor"); setMotivo(""); setPriority("normal"); setNeededBy("");
    setCostCenter(""); setSupplier(""); setReferenceUrl(""); setObs(""); setItems([emptyItem()]);
  };

  const submit = async (asDraft: boolean) => {
    if (items.some((i) => !i.descricao.trim())) { toast.error("Descreva todos os itens."); return; }
    if (!motivo) { toast.error(isSetor ? "Selecione o motivo da requisição." : "Selecione a categoria."); return; }
    if (isSetor && !costCenter) { toast.error("Selecione o centro de custo."); return; }

    const purchase_type = isSetor
      ? (MOTIVOS_SETOR.find((m) => m.value === motivo)?.type ?? "estoque")
      : "uso_direto";

    try {
      await create.mutateAsync({
        escopo,
        motivo,
        purchase_type,
        cost_center: isSetor ? costCenter : "Pessoal",
        priority: isSetor ? priority : "normal",
        needed_by: neededBy || null,
        reference_url: isSetor ? null : (referenceUrl || null),
        suggested_supplier: isSetor ? (supplier || null) : null,
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
      <div className="space-y-6 max-w-[1100px] mx-auto">
        <CarboPageHeader
          title="Requisição de Compra"
          description="Solicite uma compra — aprovação, OC, NF e contas a pagar seguem no Carbo Finanças"
          icon={ShoppingCart}
        />

        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>A requisição enviada aqui vai para a aba <strong>Requisições</strong> do <strong>Carbo Finanças</strong>, onde é aprovada e segue o fluxo de compra.</span>
        </div>

        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Nova Requisição</CarboCardTitle></CarboCardHeader>
          <CarboCardContent className="space-y-5">
            {/* Escopo — define o formulário inteiro */}
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                { key: "setor", icon: Boxes, title: "Compra do setor", desc: "Insumo / operação — reposição de estoque, produção." },
                { key: "individual", icon: User, title: "Compra individual", desc: "Material de trabalho seu — uso pessoal." },
              ] as const).map((opt) => {
                const active = escopo === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => switchEscopo(opt.key)}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${active ? "border-carbo-green bg-carbo-green/5 ring-1 ring-carbo-green/30" : "border-border hover:border-muted-foreground/40"}`}
                  >
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-carbo-green/15 text-carbo-green" : "bg-muted text-muted-foreground"}`}>
                      <opt.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{opt.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Campos do SETOR ─────────────────────────────────────────── */}
            {isSetor ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Motivo da requisição *</Label>
                    <Select value={motivo} onValueChange={setMotivo}>
                      <SelectTrigger><SelectValue placeholder="Por que está comprando?" /></SelectTrigger>
                      <SelectContent>{MOTIVOS_SETOR.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prioridade</Label>
                    <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30 w-full">
                      {PRIORIDADES.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setPriority(p.value)}
                          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${priority === p.value
                            ? (p.value === "critica" ? "bg-destructive text-white" : p.value === "alta" ? "bg-warning text-warning-foreground" : "bg-background shadow-sm")
                            : "text-muted-foreground hover:text-foreground"}`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Centro de Custo *</Label>
                    <Select value={costCenter} onValueChange={setCostCenter}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{COST_CENTERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Precisa até (opcional)</Label>
                    <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fornecedor sugerido (opcional)</Label>
                    <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Se já tiver um" />
                  </div>
                </div>
              </div>
            ) : (
              /* ── Campos do INDIVIDUAL (enxuto) ──────────────────────────── */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Categoria *</Label>
                  <Select value={motivo} onValueChange={setMotivo}>
                    <SelectTrigger><SelectValue placeholder="O que você precisa?" /></SelectTrigger>
                    <SelectContent>{CATEGORIAS_IND.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Link de referência (opcional)</Label>
                  <Input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="Cole o link do produto, se tiver" />
                </div>
              </div>
            )}

            {/* Itens */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Itens</Label>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1"><Plus className="h-3.5 w-3.5" /> Adicionar item</Button>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
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
                    <div className="col-span-1 flex justify-center">
                      {items.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-right">
                <span className="text-sm text-muted-foreground">Valor estimado: </span>
                <span className="text-lg font-bold">{brl(estimated)}</span>
              </div>
            </div>

            {/* Observação — opcional em ambos (sem justificativa/impacto obrigatórios) */}
            <div className="space-y-1.5">
              <Label>{isSetor ? "Observações (opcional)" : "Observação (opcional)"}</Label>
              <Textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder={isSetor ? "Contexto adicional pro comprador, se precisar." : "Algo que ajude o financeiro a decidir, se precisar."}
                rows={isSetor ? 3 : 2}
              />
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
                    <CarboTableHead>Escopo</CarboTableHead>
                    <CarboTableHead className="text-right">Valor</CarboTableHead>
                    <CarboTableHead>Status</CarboTableHead>
                    <CarboTableHead>Data</CarboTableHead>
                  </CarboTableRow>
                </CarboTableHeader>
                <CarboTableBody>
                  {minhas.map((r) => {
                    const st = STATUS_LABEL[r.status] ?? { label: r.status, variant: "default" as const };
                    const esc = (r as any).escopo === "setor" ? "Do setor" : "Individual";
                    return (
                      <CarboTableRow key={r.id}>
                        <CarboTableCell className="font-medium">{r.rc_number === "TEMP" ? "—" : r.rc_number}</CarboTableCell>
                        <CarboTableCell><CarboBadge variant={(r as any).escopo === "setor" ? "info" : "secondary"}>{esc}</CarboBadge></CarboTableCell>
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
