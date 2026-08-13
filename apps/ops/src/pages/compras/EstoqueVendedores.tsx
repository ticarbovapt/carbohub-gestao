import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PackageCheck, Truck, Send, Loader2, ChevronDown, ChevronRight, Check, TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  useVendedorEstoque, useSaldoNatal, useEnviarParaVendedor,
  useEnviosEmTransito, useConfirmarChegadaVendedor,
  type CaixaVendedor,
} from "@/hooks/useVendedorEstoque";

// ─────────────────────────────────────────────────────────────────────────────
// Estoque dos Vendedores — PASSO 2 de 7
//
// Cada vendedor tem uma caixa física, abastecida por transferência a partir de
// Natal. Esta tela mostra o que tem em cada uma e manda produto para elas.
//
// ⚠️ Por que NÃO entrou na grade de Suprimentos: aquela tela é uma coluna por
// hub, e são cinco. Quinze vendedores virariam quinze colunas — a grade deixa
// de ser lida. Aqui a orientação se inverte: uma seção por vendedor, produtos
// dentro. É a pergunta que o Ops realmente faz ("o que o João tem?"), não a
// que a grade responde ("quem tem 100ml?").
//
// ⚠️ E o envio tem DUAS etapas, de propósito — as mesmas dos hubs. "Enviar"
// tira de Natal e põe em trânsito; só "chegou" credita a caixa. Creditar na
// saída faria o vendedor ver saldo de produto que está na estrada, e vender a
// pronta entrega o que ainda não está com ele.
// ─────────────────────────────────────────────────────────────────────────────

export default function EstoqueVendedores() {
  const { data: caixas, isLoading } = useVendedorEstoque();
  const { data: transito } = useEnviosEmTransito();
  const confirmar = useConfirmarChegadaVendedor();
  const [envioPara, setEnvioPara] = useState<CaixaVendedor | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [soComSaldo, setSoComSaldo] = useState(true);

  const lista = caixas ?? [];
  const totalGeral = lista.reduce((s, c) => s + c.total_unidades, 0);

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-[1200px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CarboPageHeader
            title="Estoque dos Vendedores"
            description="O que cada vendedor tem em mãos para vender a pronta entrega"
            icon={PackageCheck}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant={soComSaldo ? "default" : "outline"}
              onClick={() => setSoComSaldo((v) => !v)}>
              {soComSaldo ? "Só o que tem saldo" : "Mostrando tudo"}
            </Button>
          </div>
        </div>

        {/* ── Em trânsito ────────────────────────────────────────────────────
            Fica ACIMA das caixas porque é trabalho pendente: mercadoria que
            saiu de Natal e ainda não foi confirmada. Enquanto está aqui, ela
            não aparece no saldo de ninguém — nem de Natal, nem do vendedor —
            e é exatamente por isso que precisa estar visível. */}
        {(transito ?? []).length > 0 && (
          <CarboCard>
            <CarboCardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold">
                  A caminho ({(transito ?? []).length})
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  já saiu de Natal, ainda não está na caixa
                </span>
              </div>
              <div className="divide-y">
                {(transito ?? []).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        <strong>{t.quantidade}</strong> × {t.product_code} → {t.destino}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(t.created_at).toLocaleString("pt-BR")}
                        {t.notes ? ` · ${t.notes}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0"
                      disabled={confirmar.isPending}
                      onClick={() => confirmar.mutate(t.id, {
                        onSuccess: () => toast.success("Chegada confirmada. Saldo creditado na caixa."),
                        onError: (e: Error) => toast.error("Falhou: " + e.message),
                      })}>
                      <Check className="h-3.5 w-3.5" /> Chegou
                    </Button>
                  </div>
                ))}
              </div>
            </CarboCardContent>
          </CarboCard>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Kpi label="Vendedores com caixa" valor={lista.length} />
          <Kpi label="Unidades em campo" valor={totalGeral} />
          <Kpi label="A caminho" valor={(transito ?? []).length} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando caixas...
          </div>
        ) : lista.length === 0 ? (
          <CarboCard>
            <CarboCardContent className="py-10 text-center space-y-2">
              <PackageCheck className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">Nenhum vendedor tem caixa ainda.</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                A caixa nasce quando o perfil é marcado como vendedor. Se alguém
                deveria aparecer aqui, confira o cadastro dele.
              </p>
            </CarboCardContent>
          </CarboCard>
        ) : (
          <div className="space-y-2">
            {lista.map((c) => (
              <Caixa
                key={c.warehouse_id}
                c={c}
                soComSaldo={soComSaldo}
                aberto={!!abertos[c.warehouse_id]}
                onToggle={() => setAbertos((a) => ({ ...a, [c.warehouse_id]: !a[c.warehouse_id] }))}
                onEnviar={() => setEnvioPara(c)}
              />
            ))}
          </div>
        )}
      </div>

      <DialogEnviar caixa={envioPara} onClose={() => setEnvioPara(null)} />
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xl font-bold leading-tight">{valor}</p>
    </div>
  );
}

function Caixa({
  c, soComSaldo, aberto, onToggle, onEnviar,
}: {
  c: CaixaVendedor; soComSaldo: boolean; aberto: boolean;
  onToggle: () => void; onEnviar: () => void;
}) {
  const itens = soComSaldo ? c.itens.filter((i) => i.quantidade > 0) : c.itens;
  const vazia = c.total_unidades === 0;

  return (
    <CarboCard>
      <CarboCardContent className="p-3">
        <div className="flex items-center gap-3">
          <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
            {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{c.vendedor_nome ?? "Sem nome"}</p>
              <p className="text-[11px] text-muted-foreground">
                {vazia
                  ? "Caixa vazia"
                  : `${c.total_unidades} unidade(s) · ${c.skus_com_saldo} produto(s)`}
              </p>
            </div>
          </button>

          {!c.is_active && <Badge variant="outline" className="text-[10px]">desativada</Badge>}
          {vazia && (
            // Caixa vazia não é erro, mas é informação: vendedor sem estoque
            // não consegue vender a pronta entrega, e vai bater no bloqueio.
            <Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-700">
              <TriangleAlert className="h-3 w-3" /> não vende a pronta entrega
            </Badge>
          )}
          <Button size="sm" className="h-8 gap-1.5 shrink-0" onClick={onEnviar}>
            <Send className="h-3.5 w-3.5" /> Enviar
          </Button>
        </div>

        {aberto && (
          <div className="mt-3 border-t pt-2">
            {itens.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                {soComSaldo ? "Nada com saldo nesta caixa." : "Nenhum produto no catálogo."}
              </p>
            ) : (
              <div className="divide-y">
                {itens.map((i) => (
                  <div key={i.product_id} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">
                      {i.product_code}
                    </span>
                    <span className="text-sm flex-1 min-w-0 truncate">{i.product_name}</span>
                    <span className={`text-sm font-semibold tabular-nums ${
                      i.quantidade > 0 ? "" : "text-muted-foreground"}`}>
                      {i.quantidade} <span className="text-[11px] font-normal">{i.stock_unit ?? "un"}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CarboCardContent>
    </CarboCard>
  );
}

function DialogEnviar({ caixa, onClose }: { caixa: CaixaVendedor | null; onClose: () => void }) {
  const { data: saldoRn } = useSaldoNatal();
  const enviar = useEnviarParaVendedor();
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("");
  const [nota, setNota] = useState("");

  // O catálogo vem da própria caixa (a view traz todo Produto Final, mesmo
  // zerado), então não precisa de segunda consulta.
  const produtos = caixa?.itens ?? [];
  const escolhido = useMemo(
    () => produtos.find((p) => p.product_id === produtoId) ?? null,
    [produtos, produtoId],
  );
  const disponivelRn = escolhido ? (saldoRn?.[escolhido.product_id] ?? 0) : 0;
  const quantidade = Number(qtd) || 0;
  // O teto é mostrado ANTES do clique. A RPC recusa de qualquer jeito — mas
  // erro evitável não deveria virar toast depois que a pessoa já digitou.
  const excede = quantidade > disponivelRn;

  function fechar() {
    setProdutoId(""); setQtd(""); setNota(""); onClose();
  }

  function salvar() {
    if (!caixa || !escolhido) { toast.error("Escolha o produto."); return; }
    if (quantidade <= 0) { toast.error("Informe a quantidade."); return; }
    enviar.mutate(
      {
        productId: escolhido.product_id,
        productCode: escolhido.product_code ?? "",
        toCode: caixa.warehouse_code,
        quantity: quantidade,
        notes: nota.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Enviado. Confirme a chegada quando o vendedor receber.");
          fechar();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={!!caixa} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar para {caixa?.vendedor_nome ?? ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Sai do Hub Natal e fica <strong>em trânsito</strong>. O saldo só entra
            na caixa quando alguém confirmar a chegada.
          </p>

          <div>
            <Label className="text-xs">Produto</Label>
            <Select value={produtoId} onValueChange={setProdutoId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Escolha o produto" /></SelectTrigger>
              <SelectContent>
                {produtos.map((p) => (
                  <SelectItem key={p.product_id} value={p.product_id}>
                    {p.product_name}
                    <span className="text-muted-foreground"> · Natal: {saldoRn?.[p.product_id] ?? 0}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Quantidade</Label>
            <Input type="number" inputMode="numeric" min={1} value={qtd}
              onChange={(e) => setQtd(e.target.value)} className="h-9" />
            {escolhido && (
              <p className={`text-[11px] mt-1 ${excede ? "text-red-600" : "text-muted-foreground"}`}>
                {excede
                  ? `Natal só tem ${disponivelRn}.`
                  : `Disponível em Natal: ${disponivelRn}. Na caixa hoje: ${escolhido.quantidade}.`}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Reposição da semana, levou na viagem de terça..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={enviar.isPending || excede || !escolhido || quantidade <= 0}>
            {enviar.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
