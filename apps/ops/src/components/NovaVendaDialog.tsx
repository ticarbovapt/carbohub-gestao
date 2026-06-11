// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
// Reproduz a tela "Vender" do Carbo Sales dentro de um popup (Ops não tem a
// página Vender; aqui a venda é registrada por este dialog).
import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";

const PRODUTOS = [
  { id: "p1", name: "CarboZé 100ml", price: 28.0 },
  { id: "p2", name: "CarboZé 1L", price: 190.0 },
  { id: "p3", name: "CarboZé Sachê 10ml", price: 4.5 },
  { id: "p4", name: "CarboPRO", price: 320.0 },
  { id: "p5", name: "CarboVapt", price: 150.0 },
];
const TIPOS_PONTO = ["Posto", "Oficina", "Frota", "PDV", "Licenciado"];
const CLASSIFICACOES = ["Estratégico", "Potencial", "Regular"];
const UFS = ["SP", "RJ", "MG", "RN", "BA", "PR", "RS", "SC"];

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

interface ItemRow {
  id: string; productId: string; qty: number; unitPrice: number; hasBonus: boolean; bonusQty: number;
}
const emptyRow = (): ItemRow => ({ id: crypto.randomUUID(), productId: "", qty: 1, unitPrice: 0, hasBonus: false, bonusQty: 0 });

function CollapsibleCard({
  title, icon: Icon, open, onToggle, children,
}: { title: string; icon: React.ElementType; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <CarboCard>
      <CarboCardContent className="p-4">
        <button type="button" onClick={onToggle} className="w-full flex items-center justify-between">
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

interface NovaVendaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NovaVendaDialog({ open, onOpenChange }: NovaVendaDialogProps) {
  const { profile } = useAuth();
  const vendedor = profile?.full_name ?? profile?.username ?? "";

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

  const subtotal = useMemo(() => rows.reduce((s, r) => s + r.qty * r.unitPrice, 0), [rows]);

  function updateRow(id: string, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function onProduct(id: string, productId: string) {
    const p = PRODUTOS.find((x) => x.id === productId);
    updateRow(id, { productId, unitPrice: p ? p.price : 0 });
  }
  const hasItems = () => rows.some((r) => r.productId && r.qty > 0);

  function handleQuote() {
    if (!hasItems()) { toast.error("Adicione ao menos um item."); return; }
    toast.info("Disponível na fase de lógica");
  }
  function handleSell() {
    if (!hasItems()) { toast.error("Adicione ao menos um item."); return; }
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-carbo-green" /> Nova Venda
          </DialogTitle>
          <DialogDescription>Registre um novo pedido de venda.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Tipo de Operação */}
          <CarboCard>
            <CarboCardContent className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-carbo-green" /> Tipo de Operação</h3>
              <div className="grid grid-cols-2 gap-2 max-w-md">
                {([["venda", "Venda"], ["promo", "Ação Promocional"]] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setMode(v)}
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
                <CarboButton type="button" onClick={() => toast.info("Disponível na fase de lógica")}>
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
                <Button variant="outline" size="sm" type="button" onClick={() => toast.info("Disponível na fase de lógica")}>
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
            </CarboCardContent>
          </CarboCard>

          {/* Itens do Pedido */}
          <CarboCard>
            <CarboCardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-carbo-green" /> Itens do Pedido</h3>
                <Button variant="outline" size="sm" type="button" onClick={() => setRows((p) => [...p, emptyRow()])}>
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
                          <SelectContent>{PRODUTOS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
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
                          <button type="button" onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))}
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

          {/* Dados Estratégicos (opcional) */}
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

          {/* Observações (opcional) */}
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
        </div>

        {/* Rodapé: total + ações */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t -mx-6 px-6 py-3 mt-1 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold">{brl(subtotal)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button variant="outline" type="button" onClick={handleQuote}>
              <FileText className="h-4 w-4 mr-1" /> Gerar Orçamento
            </Button>
            <CarboButton onClick={handleSell} className="min-w-[150px]">
              <ShoppingCart className="h-4 w-4 mr-1" /> Gerar Venda
            </CarboButton>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Vendedor: <b>{vendedor || "—"}</b> (usuário logado) · Tela em port visual — CNPJ, mapa, produtos do estoque e gravação real entram na próxima fase.
        </p>
      </DialogContent>
    </Dialog>
  );
}
