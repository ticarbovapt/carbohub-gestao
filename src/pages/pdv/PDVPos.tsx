import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Plus, Minus, Trash2, ChevronLeft, CheckCircle2, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { usePDVStatus } from "@/hooks/usePDV";
import { usePDVProducts } from "@/hooks/usePDVProducts";
import { useMyPDVSeller, usePDVSellers } from "@/hooks/usePDVSellers";
import { useCreatePDVSale, PAYMENT_LABELS, type PaymentType, type PDVSaleItem } from "@/hooks/usePDVSales";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { PDVLayout } from "@/components/layouts/PDVLayout";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

interface CartItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  qty: number;
}

export default function PDVPos() {
  const navigate = useNavigate();
  const { data: pdvStatus } = usePDVStatus();
  const pdvId = pdvStatus?.pdv?.id;
  const { data: products = [], isLoading: productsLoading } = usePDVProducts();
  const { data: mySeller } = useMyPDVSeller(pdvId);
  const { data: allSellers = [] } = usePDVSellers(pdvId);
  const createSale = useCreatePDVSale();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("0");
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [rvVendedor, setRvVendedor] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState<string>(mySeller?.id ?? "");
  const [notes, setNotes] = useState("");
  const [success, setSuccess] = useState(false);

  const subtotal = cart.reduce((acc, i) => acc + i.unit_price * i.qty, 0);
  const discountVal = parseFloat(discount) || 0;
  const total = Math.max(0, subtotal - discountVal);

  function addToCart(product: { id: string; name: string; price_default: number }) {
    setCart(prev => {
      const exists = prev.find(i => i.product_id === product.id);
      if (exists) {
        return prev.map(i => i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { product_id: product.id, product_name: product.name, unit_price: product.price_default, qty: 1 }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart(prev => prev
      .map(i => i.product_id === productId ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    );
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.product_id !== productId));
  }

  function changeUnitPrice(productId: string, val: string) {
    const p = parseFloat(val);
    if (!isNaN(p) && p >= 0) {
      setCart(prev => prev.map(i => i.product_id === productId ? { ...i, unit_price: p } : i));
    }
  }

  async function handleSubmit() {
    if (!pdvId || cart.length === 0) return;

    const sellerId = selectedSellerId || mySeller?.id || null;
    const seller = allSellers.find(s => s.id === sellerId);
    const commissionRate = seller?.commission_rate ?? 0;

    const items: PDVSaleItem[] = cart.map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      qty: i.qty,
      unit_price: i.unit_price,
      subtotal: i.unit_price * i.qty,
    }));

    await createSale.mutateAsync({
      pdv_id: pdvId,
      seller_id: sellerId,
      rv_vendedor_name: rvVendedor || null,
      items,
      discount: discountVal,
      payment_type: paymentType,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      notes: notes || null,
      commission_rate: commissionRate,
    });

    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setCart([]);
      setDiscount("0");
      setCustomerName("");
      setCustomerPhone("");
      setRvVendedor("");
      setNotes("");
    }, 2000);
  }

  if (productsLoading) {
    return (
      <div className="p-4 space-y-4">
        <CarboSkeleton className="h-10 w-48" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <CarboSkeleton key={i} className="h-36" />)}
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold">Venda registrada!</h2>
        <p className="text-muted-foreground">Estoque atualizado automaticamente.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pdv/dashboard")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-bold text-lg">Nova Venda — Caixa POS</h1>
        {cart.length > 0 && (
          <Badge className="ml-auto bg-primary/10 text-primary border-0">
            {cart.length} {cart.length === 1 ? "item" : "itens"}
          </Badge>
        )}
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-auto">
        {/* Produtos — esquerda */}
        <div className="lg:flex-1 p-4 space-y-4">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Produtos</p>
          {products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nenhum produto cadastrado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {products.map(product => {
                const inCart = cart.find(i => i.product_id === product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={cn(
                      "rounded-xl border-2 p-4 text-left transition-all min-h-[120px] flex flex-col justify-between",
                      "hover:border-primary/40 hover:bg-primary/5 active:scale-95",
                      inCart ? "border-primary bg-primary/5" : "border-border"
                    )}
                  >
                    <div>
                      <p className="font-semibold text-sm">{product.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{product.unit}</p>
                    </div>
                    <div className="flex items-end justify-between mt-3">
                      <p className="text-lg font-bold text-primary">
                        {fmt(product.price_default)}
                      </p>
                      {inCart && (
                        <Badge className="bg-primary text-white border-0 text-xs">
                          {inCart.qty}×
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Carrinho — direita / bottom */}
        <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-border bg-muted/20 flex flex-col">
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Carrinho</p>

            {cart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Clique nos produtos para adicionar
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.product_id} className="rounded-xl border border-border bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{item.product_name}</p>
                      <button onClick={() => removeFromCart(item.product_id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changeQty(item.product_id, -1)}
                        className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-muted"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center font-mono font-semibold text-sm">{item.qty}</span>
                      <button
                        onClick={() => changeQty(item.product_id, 1)}
                        className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-muted"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <span className="ml-auto text-xs text-muted-foreground">×</span>
                      <input
                        type="number"
                        className="w-20 h-7 rounded-md border border-border bg-background px-2 text-xs font-mono text-right"
                        value={item.unit_price}
                        min={0}
                        step={0.01}
                        onChange={e => changeUnitPrice(item.product_id, e.target.value)}
                      />
                    </div>
                    <div className="text-right text-sm font-semibold">
                      {fmt(item.unit_price * item.qty)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <>
                <Separator />

                {/* Campos extras */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Cliente</Label>
                      <Input className="h-9 text-sm mt-1" placeholder="Nome (opcional)" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Telefone</Label>
                      <Input className="h-9 text-sm mt-1" placeholder="(00) 00000-0000" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} inputMode="tel" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Vendedor interno</Label>
                    <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                      <SelectTrigger className="h-9 text-sm mt-1">
                        <SelectValue placeholder="Selecionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allSellers.filter(s => s.is_active).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}{s.is_manager ? " (Manager)" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Vendedor RV (Grupo Carbo)</Label>
                    <Input className="h-9 text-sm mt-1" placeholder="Nome do RV..." value={rvVendedor} onChange={e => setRvVendedor(e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Pagamento</Label>
                      <Select value={paymentType} onValueChange={v => setPaymentType(v as PaymentType)}>
                        <SelectTrigger className="h-9 text-sm mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PAYMENT_LABELS).map(([k, l]) => (
                            <SelectItem key={k} value={k}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Desconto (R$)</Label>
                      <Input
                        type="number"
                        min={0}
                        className="h-9 text-sm mt-1"
                        value={discount}
                        onChange={e => setDiscount(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Observações</Label>
                    <Textarea className="text-sm mt-1 resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Obs. opcionais..." />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Total + Confirmar */}
          {cart.length > 0 && (
            <div className="p-4 border-t border-border space-y-3 bg-background">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{fmt(subtotal)}</span>
                </div>
                {discountVal > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Desconto</span>
                    <span className="text-destructive">−{fmt(discountVal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                  <span>Total</span>
                  <span className="text-primary">{fmt(total)}</span>
                </div>
              </div>
              <Button
                className="w-full h-12 text-base carbo-gradient"
                disabled={createSale.isPending || cart.length === 0}
                onClick={handleSubmit}
              >
                {createSale.isPending ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Registrando...</>
                ) : (
                  <><CheckCircle2 className="h-5 w-5 mr-2" /> Confirmar Venda · {fmt(total)}</>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
