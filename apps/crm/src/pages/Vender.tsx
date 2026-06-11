import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ShoppingCart, Plus, Trash2, Building2, MapPin, Package, Gift, FileText, Search, Target, ChevronDown,
} from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { generateQuotePdf } from "@/lib/quotePdf";
import { useCreateVenda } from "@/hooks/useVendas";
import { useProdutos } from "@/hooks/useProdutos";

// Vender — grava a venda de verdade (crm_vendas) e lê o catálogo real (mrp_products).
// Pendências de fora do escopo de venda: lookup de CNPJ e mapa (próximas fases).
// O VENDEDOR é o usuário logado (não há dropdown de vendedor).

const TIPOS_PONTO = ["Posto", "Oficina", "Frota", "PDV", "Licenciado"];
const CLASSIFICACOES = ["Estratégico", "Potencial", "Regular"];
const UFS = ["SP", "RJ", "MG", "RN", "BA", "PR", "RS", "SC"];

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

interface ItemRow {
  id: string; productId: string; qty: number; unitPrice: number; hasBonus: boolean; bonusQty: number;
}
const emptyRow = (): ItemRow => ({ id: crypto.randomUUID(), productId: "", qty: 1, unitPrice: 0, hasBonus: false, bonusQty: 0 });

// Cabeçalho clicável de seção opcional (recolhível).
function CollapsibleCard({
  title, icon: Icon, open, onToggle, children,
}: { title: string; icon: React.ElementType; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <CarboCard>
      <CarboCardContent className="p-4">
        <button onClick={onToggle} className="w-full flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Icon className="h-4 w-4 text-carbo-green" /> {title}
            <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
          </h3>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && <div className="mt-4 space-y-3">{children}</div>}
      </CarboCardContent>
    </CarboCard>
  );
}

export default function Vender() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const vendedor = profile?.full_name ?? profile?.username ?? "";
  const createVenda = useCreateVenda();
  const { data: produtos = [] } = useProdutos();

  const [mode, setMode] = useState<"venda" | "promo">("venda");
  const [doc, setDoc] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isLicenciado, setIsLicenciado] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [obsPublica, setObsPublica] = useState("");
  const [showEstrategicos, setShowEstrategicos] = useState(false);
  const [showObs, setShowObs] = useState(false);
  const [generating, setGenerating] = useState(false);

  const subtotal = useMemo(() => rows.reduce((s, r) => s + r.qty * r.unitPrice, 0), [rows]);

  function updateRow(id: string, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function onProduct(id: string, productId: string) {
    // O catálogo (mrp_products) não tem preço de venda; o vendedor informa o preço.
    updateRow(id, { productId });
  }
  const validItems = () =>
    rows.filter((r) => r.productId && r.qty > 0).map((r) => ({
      name: produtos.find((p) => p.id === r.productId)?.name ?? "Produto",
      quantity: r.qty, unit_price: r.unitPrice, bonus_quantity: r.hasBonus ? r.bonusQty : 0,
    }));

  // Monta o payload de gravação (cabeçalho + itens) a partir do estado da tela.
  function buildPayload(status: "orcamento" | "pedido") {
    return {
      tipo: mode,
      status,
      customer_name: customerName || undefined,
      customer_doc: doc || undefined,
      customer_email: email || undefined,
      customer_phone: phone || undefined,
      is_licenciado: isLicenciado,
      total: subtotal,
      notes: obsPublica || undefined,
      itens: validItems().map((i) => ({
        produto: i.name,
        quantidade: i.quantity,
        preco_unitario: i.unit_price,
        bonificacao: i.bonus_quantity,
      })),
    } as const;
  }

  // Limpa o formulário após salvar.
  function resetForm() {
    setMode("venda"); setDoc(""); setCustomerName(""); setEmail(""); setPhone("");
    setIsLicenciado(false); setRows([emptyRow()]); setObsPublica("");
  }

  async function handleQuote() {
    const items = validItems();
    if (items.length === 0) { toast.error("Adicione ao menos um item."); return; }
    setGenerating(true);
    try {
      // 1) Gera o PDF do orçamento (como antes).
      await generateQuotePdf({
        customer_name: customerName || "Cliente", cnpj: doc || undefined,
        vendedor_name: vendedor || undefined, items, total: subtotal,
        notes: obsPublica || undefined, created_at: new Date().toISOString(), validityDays: 7,
      });
      // 2) Salva o orçamento (status = orcamento).
      await createVenda.mutateAsync(buildPayload("orcamento"));
      toast.success("Orçamento gerado e salvo!");
      resetForm();
    } catch (e) {
      toast.error("Erro ao gerar/salvar orçamento: " + (e instanceof Error ? e.message : "tente de novo"));
    } finally { setGenerating(false); }
  }

  async function handleSell() {
    if (validItems().length === 0) { toast.error("Adicione ao menos um item."); return; }
    try {
      await createVenda.mutateAsync(buildPayload("pedido"));
      toast.success("Venda registrada!");
      resetForm();
      navigate("/pedidos");
    } catch (e) {
      toast.error("Erro ao registrar venda: " + (e instanceof Error ? e.message : "tente de novo"));
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full space-y-5 pb-24">
      {/* Tipo de Operação */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-carbo-green" /> Tipo de Operação</h3>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            {([["venda", "Venda"], ["promo", "Ação Promocional"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setMode(v)}
                className={`rounded-xl border p-3 text-sm font-medium transition-all ${
                  mode === v ? "border-carbo-green bg-carbo-green/5 text-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Busca por CNPJ ou CPF */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Search className="h-4 w-4 text-carbo-green" /> Busca por CNPJ ou CPF</h3>
          <p className="text-xs text-muted-foreground">
            CNPJ busca os dados automaticamente. CPF (pessoa física) é validado e segue com preenchimento manual.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="CNPJ ou CPF" />
            <CarboButton type="button" onClick={() => toast.info("Busca de CNPJ entra na fase de lógica.")}>
              <Search className="h-4 w-4 mr-1" /> Buscar dados
            </CarboButton>
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Informações do Cliente */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-carbo-green" /> Informações do Cliente</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome / Razão Social *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">É Licenciado?</p>
                <p className="text-xs text-muted-foreground">Marque se o cliente é um licenciado Carbo</p>
              </div>
              <Switch checked={isLicenciado} onCheckedChange={setIsLicenciado} />
            </div>
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Endereço de Entrega */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-carbo-green" /> Endereço de Entrega</h3>
            <Button variant="outline" size="sm" onClick={() => toast.info("Mapa entra na fase de lógica.")}>
              <MapPin className="h-4 w-4 mr-1" /> Localizar no mapa
            </Button>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1.5 md:col-span-2"><Label>Logradouro</Label><Input placeholder="Rua, Avenida, etc." /></div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <div className="flex gap-2"><Input placeholder="Nº" /><Button variant="outline" type="button" className="shrink-0">S/N</Button></div>
            </div>
            <div className="space-y-1.5"><Label>Bairro</Label><Input placeholder="Bairro" /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input placeholder="Cidade" /></div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>CEP</Label><Input placeholder="00000-000" /></div>
          </div>
          <div className="rounded-xl border border-dashed flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <MapPin className="h-6 w-6" />
            <p className="text-sm px-6">Preencha o endereço e clique em <b>Localizar no mapa</b> para visualizar e ajustar o ponto de entrega.</p>
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Itens do Pedido — pôr o produto e fechar a venda */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-carbo-green" /> Itens do Pedido</h3>
            <Button variant="outline" size="sm" onClick={() => setRows((p) => [...p, emptyRow()])}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar Item
            </Button>
          </div>

          {rows.map((r) => {
            const lineTotal = r.qty * r.unitPrice;
            return (
              <div key={r.id} className="rounded-xl border p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_120px_auto] gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label>Produto</Label>
                    <Select value={r.productId} onValueChange={(v) => onProduct(r.id, v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{produtos.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Quantidade</Label>
                    <Input type="number" min={1} value={r.qty} onChange={(e) => updateRow(r.id, { qty: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Preço Unit. (R$)</Label>
                    <Input type="number" min={0} step="0.01" value={r.unitPrice} onChange={(e) => updateRow(r.id, { unitPrice: Number(e.target.value) })} placeholder="0,00" />
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:pb-2">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-semibold">{brl(lineTotal)}</p>
                    </div>
                    {rows.length > 1 && (
                      <button onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <Switch checked={r.hasBonus} onCheckedChange={(v) => updateRow(r.id, { hasBonus: v })} />
                    <span className="text-sm flex items-center gap-1"><Gift className="h-3.5 w-3.5 text-carbo-green" /> Tem bonificação</span>
                  </label>
                  {r.hasBonus && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Qtd bonificada</Label>
                      <Input type="number" min={0} value={r.bonusQty} onChange={(e) => updateRow(r.id, { bonusQty: Number(e.target.value) })} className="w-24" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex justify-end border-t pt-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Subtotal</p>
              <p className="text-lg font-bold">{brl(subtotal)}</p>
            </div>
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Dados Estratégicos (opcional, recolhível) */}
      <CollapsibleCard title="Dados Estratégicos" icon={Target} open={showEstrategicos} onToggle={() => setShowEstrategicos((o) => !o)}>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo de Ponto</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>{TIPOS_PONTO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Classificação Interna</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Classificar como" /></SelectTrigger>
              <SelectContent>{CLASSIFICACOES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Volume Médio Mensal (veículos)</Label>
          <Input type="number" placeholder="Ex: 500" />
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span className="text-sm font-medium">Atua com Diesel?</span><Switch />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span className="text-sm font-medium">Atua com Frotas?</span><Switch />
          </label>
        </div>
      </CollapsibleCard>

      {/* Observações (opcional, recolhível) */}
      <CollapsibleCard title="Observações" icon={FileText} open={showObs} onToggle={() => setShowObs((o) => !o)}>
        <div className="space-y-1.5">
          <Label>Observações Públicas</Label>
          <Textarea value={obsPublica} onChange={(e) => setObsPublica(e.target.value)} placeholder="Visíveis para o cliente" />
        </div>
        <div className="space-y-1.5">
          <Label>Notas Internas</Label>
          <Textarea placeholder="Visíveis apenas internamente" />
        </div>
      </CollapsibleCard>

      {/* Rodapé: total + ações */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t -mx-4 md:-mx-6 px-4 md:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold">{brl(subtotal)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate("/pedidos")}>Cancelar</Button>
          <Button variant="outline" onClick={handleQuote} disabled={generating}>
            <FileText className="h-4 w-4 mr-1" /> {generating ? "Gerando..." : "Gerar Orçamento"}
          </Button>
          <CarboButton onClick={handleSell} className="min-w-[150px]">
            <ShoppingCart className="h-4 w-4 mr-1" /> Gerar Venda
          </CarboButton>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Vendedor: <b>{vendedor || "—"}</b> (usuário logado) · Produtos do catálogo real e gravação ativos. CNPJ e mapa entram nas próximas fases.
      </p>
    </div>
  );
}
