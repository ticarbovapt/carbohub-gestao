import { useMemo, useState, useEffect } from "react";
import { Send, Plus, Trash2, Loader2, ArrowRight, Warehouse, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { toast } from "sonner";
import { useStock } from "@/hooks/useStock";
import { useRegisterEnvio, useEstoques } from "@/hooks/useStockTransfers";

// ─────────────────────────────────────────────────────────────────────────────
// Registrar envio entre DOIS estoques quaisquer.
//
// ⚠️ A lista de estoques vem da view `carbo_estoques`, NÃO da constante `HUBS`
// do `stockData.ts`. As duas parecem a mesma coisa e respondem perguntas
// diferentes: `HUBS` é "o que vira coluna na grade de Suprimentos" — e as
// caixas de vendedor ficam fora dela de propósito, porque quinze vendedores
// tornariam a grade ilegível. Aqui a pergunta é "para onde posso enviar", e a
// resposta INCLUI as caixas. Reusar `HUBS` puxaria as caixas para dentro da
// grade junto.
//
// ⚠️ E o crédito no destino continua sendo do ACEITE, nunca daqui. Registrar
// tira da origem e põe em trânsito; quem credita é o `ops_transfer_confirm`.
// Creditar na saída faria o vendedor vender de pronta entrega um produto que
// está dentro de uma van.
// ─────────────────────────────────────────────────────────────────────────────

interface EnvioRow { id: number; productId: string; destinoCode: string; quantity: string; notes: string }
let nextId = 1;
const newRow = (): EnvioRow => ({ id: nextId++, productId: "", destinoCode: "", quantity: "", notes: "" });

export function CDSPRegistrarEnvioDialog({
  open, onOpenChange, origemInicial = "HUB-RN",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** ⚠️ A origem PADRÃO é o estoque da aba em que a pessoa está. Abrir sempre
   *  em Natal faria quem está no CD SP registrar uma saída de Natal sem
   *  perceber — e o erro só apareceria no saldo, dias depois. */
  origemInicial?: string;
}) {
  const { data: products = [] } = useStock();
  const { data: estoques = [] } = useEstoques();
  const registerEnvio = useRegisterEnvio();

  const [origem, setOrigem] = useState(origemInicial);
  const [rows, setRows] = useState<EnvioRow[]>([newRow()]);

  // A aba pode mudar com o diálogo fechado; sincroniza na ABERTURA.
  useEffect(() => { if (open) setOrigem(origemInicial); }, [open, origemInicial]);

  const hubs = useMemo(() => estoques.filter((e) => e.kind === "hub"), [estoques]);
  const caixas = useMemo(() => estoques.filter((e) => e.kind === "vendedor"), [estoques]);
  const origemNome = estoques.find((e) => e.code === origem)?.name ?? origem;

  const addRow = () => setRows((r) => [...r, newRow()]);
  const removeRow = (id: number) => setRows((r) => r.filter((x) => x.id !== id));
  const updateRow = (id: number, field: keyof EnvioRow, value: string) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));

  const reset = () => setRows([newRow()]);
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const submit = async () => {
    const valid = rows.filter((r) => r.productId && r.destinoCode && Number(r.quantity) > 0);
    if (valid.length === 0) { toast.error("Adicione ao menos um envio com destino, produto e quantidade."); return; }
    // ⚠️ Barrado ANTES do banco também. A RPC recusa (origem = destino debita e
    // credita o mesmo estoque, o saldo não muda e fica um card em trânsito
    // eterno), mas errar no clique e descobrir pelo toast é pior que não poder
    // escolher.
    if (valid.some((r) => r.destinoCode === origem)) {
      toast.error("Um dos envios tem o mesmo estoque na origem e no destino.");
      return;
    }

    let feitos = 0;
    try {
      for (const row of valid) {
        const product = products.find((p) => p.id === row.productId);
        if (!product) continue;
        await registerEnvio.mutateAsync({
          productId: product.id,
          productCode: product.product_code,
          fromCode: origem,
          toCode: row.destinoCode,
          quantity: Number(row.quantity),
          notes: row.notes.trim() || undefined,
        });
        feitos += 1;
      }
      toast.success(`${feitos} envio(s) registrado(s) — saldo debitado de ${origemNome}.`);
      reset();
      onOpenChange(false);
    } catch (e) {
      // ⚠️ Diz QUANTOS passaram antes de falhar. As linhas são registradas uma a
      // uma, cada uma numa transação própria; um erro no terceiro envio não
      // desfaz os dois primeiros. Um "não foi possível registrar" seco faria a
      // pessoa repetir tudo e duplicar o que já saiu.
      const msg = e instanceof Error ? e.message : "Não foi possível registrar o envio.";
      toast.error(feitos > 0 ? `${feitos} envio(s) registrado(s); o seguinte falhou: ${msg}` : msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-carbo-blue" />
            Registrar envio entre estoques
          </DialogTitle>
        </DialogHeader>

        {/* ORIGEM é uma só para todas as linhas: um envio sai de um lugar. Uma
            origem por linha multiplicaria as chances de erro sem servir a
            nenhum caso real — quem envia de dois lugares faz duas remessas. */}
        <div className="rounded-lg border border-border p-3 bg-muted/20">
          <Label className="text-xs">Origem — sai daqui</Label>
          <Select value={origem} onValueChange={setOrigem}>
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {estoques.map((e) => (
                <SelectItem key={e.code} value={e.code}>
                  {e.name} <span className="text-muted-foreground text-xs">({e.code})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {rows.map((row, idx) => (
            <div key={row.id} className="rounded-lg border border-border p-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  Envio {idx + 1}
                  <ArrowRight className="h-3 w-3" />
                  <span className="truncate max-w-[160px]">
                    {estoques.find((e) => e.code === row.destinoCode)?.name ?? "escolha o destino"}
                  </span>
                </span>
                {rows.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeRow(row.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div>
                <Label className="text-xs">Destino</Label>
                <Select value={row.destinoCode} onValueChange={(v) => updateRow(row.id, "destinoCode", v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o destino" /></SelectTrigger>
                  <SelectContent>
                    {/* Dois grupos: galpão da empresa e caixa de gente. São
                        coisas diferentes — a segunda anda de van. */}
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 text-[11px]">
                        <Warehouse className="h-3 w-3" /> Galpões
                      </SelectLabel>
                      {hubs.filter((h) => h.code !== origem).map((h) => (
                        <SelectItem key={h.code} value={h.code}>{h.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    {caixas.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-1.5 text-[11px]">
                          <User className="h-3 w-3" /> Estoque de vendedor
                        </SelectLabel>
                        {caixas.filter((c) => c.code !== origem).map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.dono_nome ?? c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Produto</Label>
                <Select value={row.productId} onValueChange={(v) => updateRow(row.id, "productId", v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} <span className="text-muted-foreground text-xs">({p.product_code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Quantidade</Label>
                  <Input type="number" min={1} className="h-9" placeholder="Ex: 500"
                    value={row.quantity} onChange={(e) => updateRow(row.id, "quantity", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Obs. <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input className="h-9" placeholder="NF, remessa..."
                    value={row.notes} onChange={(e) => updateRow(row.id, "notes", e.target.value)} />
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 border-dashed" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Adicionar outro envio
          </Button>
        </div>

        {/* O que vai acontecer, dito antes do clique. */}
        <p className="text-[11px] text-muted-foreground">
          O saldo sai de <strong>{origemNome}</strong> agora e fica <strong>em trânsito</strong>.
          O destino só recebe quando alguém de lá der o aceite — e fica registrado quem deu.
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={registerEnvio.isPending}>Cancelar</Button>
          <Button onClick={submit} disabled={registerEnvio.isPending} className="carbo-gradient text-white gap-1.5">
            {registerEnvio.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</> : <><Send className="h-4 w-4" /> Registrar Envio</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
