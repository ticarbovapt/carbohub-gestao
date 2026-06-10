import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ShoppingCart, Plus, Trash2, Building2, User, MapPin, Repeat, Package, FileText,
} from "lucide-react";
import { generateQuotePdf } from "@/lib/quotePdf";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ⚠️ PORT VISUAL — sem lógica real (CNPJ lookup, mapa, SKUs, submit no banco).
// TODO: ligar useCreateOrder/useSkus/geocode na fase de lógica.

const PRODUTOS = [
  { id: "p1", name: "CarboZé 100ml", price: 28.0 },
  { id: "p2", name: "CarboZé 1L", price: 190.0 },
  { id: "p3", name: "CarboZé Sachê 10ml", price: 4.5 },
  { id: "p4", name: "CarboPRO", price: 320.0 },
  { id: "p5", name: "CarboVapt", price: 150.0 },
];
const OPERADORES = ["Lucas Padilha", "Marcio Vannucci", "Marcius D'Ávila"];
const TIPOS_PEDIDO = ["Venda", "Bonificação", "Amostra", "Troca"];
const UFS = ["SP", "RJ", "MG", "RN", "BA", "PR", "RS", "SC"];

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

interface CartItem { id: string; productId: string; name: string; price: number; qty: number; }

const inputCls = ""; // usa o Input do kit

export default function Vender() {
  const [mode, setMode] = useState<"venda" | "promo">("venda");
  const [doc, setDoc] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [operador, setOperador] = useState("");
  const [notes, setNotes] = useState("");
  const [isLicenciado, setIsLicenciado] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [pickProduct, setPickProduct] = useState("");
  const [pickQty, setPickQty] = useState(1);
  const [recorrente, setRecorrente] = useState(false);
  const [generating, setGenerating] = useState(false);

  const total = useMemo(() => items.reduce((s, i) => s + i.price * i.qty, 0), [items]);

  function addItem() {
    const p = PRODUTOS.find((x) => x.id === pickProduct);
    if (!p || pickQty < 1) return;
    setItems((prev) => [...prev, { id: crypto.randomUUID(), productId: p.id, name: p.name, price: p.price, qty: pickQty }]);
    setPickProduct(""); setPickQty(1);
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function handleSubmit() {
    toast.success("Pedido criado! (demonstração — lógica real entra na próxima fase)");
  }

  async function handleQuote() {
    if (items.length === 0) return;
    setGenerating(true);
    try {
      await generateQuotePdf({
        customer_name: customerName || "Cliente",
        cnpj: doc || undefined,
        vendedor_name: operador || undefined,
        items: items.map((i) => ({ name: i.name, quantity: i.qty, unit_price: i.price })),
        total,
        notes: notes || undefined,
        created_at: new Date().toISOString(),
        validityDays: 7,
      });
      toast.success("Orçamento gerado!");
    } catch (e) {
      toast.error("Erro ao gerar orçamento: " + (e instanceof Error ? e.message : "tente de novo"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full space-y-5 pb-24">
      <CarboPageHeader title="Nova venda" description="Monte o pedido e finalize a venda" icon={ShoppingCart} />

      {/* Tipo de Operação */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> Tipo de Operação</h3>
          <div className="grid grid-cols-2 gap-2">
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

      {/* Cliente */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Cliente</h3>
          <div className="space-y-1.5">
            <Label>CNPJ / CPF</Label>
            <div className="flex gap-2">
              <Input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="00.000.000/0000-00" />
              <Button variant="outline" type="button" onClick={() => toast.info("Busca de CNPJ entra na fase de lógica.")}>Buscar</Button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Nome / Razão Social *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Cliente" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" placeholder="cliente@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input placeholder="(00) 00000-0000" />
            </div>
          </div>
          <label className="flex items-center gap-2 pt-1">
            <Switch checked={isLicenciado} onCheckedChange={setIsLicenciado} />
            <span className="text-sm">É licenciado?</span>
          </label>
        </CarboCardContent>
      </CarboCard>

      {/* Operador */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><User className="h-4 w-4 text-primary" /> Operador responsável</h3>
          <Select value={operador} onValueChange={setOperador}>
            <SelectTrigger><SelectValue placeholder="Selecione o operador" /></SelectTrigger>
            <SelectContent>
              {OPERADORES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </CarboCardContent>
      </CarboCard>

      {/* Itens do Pedido */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-primary" /> Itens do pedido</h3>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Select value={pickProduct} onValueChange={setPickProduct}>
                <SelectTrigger><SelectValue placeholder="Escolha um produto" /></SelectTrigger>
                <SelectContent>
                  {PRODUTOS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {brl(p.price)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input type="number" min={1} value={pickQty} onChange={(e) => setPickQty(Number(e.target.value))} className="sm:w-24" />
            <CarboButton type="button" onClick={addItem} disabled={!pickProduct}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </CarboButton>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6 border rounded-xl border-dashed">
              Nenhum item adicionado.
            </p>
          ) : (
            <div className="border rounded-xl divide-y">
              {items.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{i.name}</p>
                    <p className="text-xs text-muted-foreground">{i.qty} × {brl(i.price)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{brl(i.price * i.qty)}</span>
                    <button onClick={() => removeItem(i.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CarboCardContent>
      </CarboCard>

      {/* Endereço de Entrega */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Endereço de entrega</h3>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1.5 md:col-span-2"><Label>Logradouro</Label><Input placeholder="Rua / Av." /></div>
            <div className="space-y-1.5"><Label>Número</Label><Input placeholder="123" /></div>
            <div className="space-y-1.5"><Label>Bairro</Label><Input /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input /></div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>CEP</Label><Input placeholder="00000-000" /></div>
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Tipo e Recorrência */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Repeat className="h-4 w-4 text-primary" /> Tipo e recorrência</h3>
          <div className="space-y-1.5">
            <Label>Tipo do pedido</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{TIPOS_PEDIDO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2">
            <Switch checked={recorrente} onCheckedChange={setRecorrente} />
            <span className="text-sm">Pedido recorrente</span>
          </label>
          {recorrente && (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Intervalo (dias)</Label><Input type="number" placeholder="30" /></div>
              <div className="space-y-1.5"><Label>Próxima entrega</Label><Input type="date" /></div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações do pedido" />
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Resumo / total + ação */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t -mx-4 md:-mx-6 px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold">{brl(total)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleQuote} disabled={items.length === 0 || generating}>
            <FileText className="h-4 w-4 mr-1" /> {generating ? "Gerando..." : "Gerar orçamento"}
          </Button>
          <CarboButton onClick={handleSubmit} disabled={items.length === 0} className="min-w-[150px]">
            <ShoppingCart className="h-4 w-4 mr-1" /> Criar pedido
          </CarboButton>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Tela em port visual — dados de exemplo. Busca de CNPJ, produtos do estoque e gravação real entram na próxima fase.
      </p>
    </div>
  );
}
