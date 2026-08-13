import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PackageCheck, Truck, Loader2, Search, PackageX, Undo2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMeuEstoque, useACaminho, useSaindoDaMinhaCaixa } from "@/hooks/useMeuEstoque";
import { useVendedoresDir } from "@/hooks/useVendas";

// ─────────────────────────────────────────────────────────────────────────────
// Meu Estoque — PASSO 6 de 7
//
// O que o vendedor tem em mãos para vender a pronta entrega.
//
// ⚠️ Esta tela não destrava nada: a venda já confere o saldo sozinha, e o banco
// recusa o que não tem. Ela existe para a pergunta que vem ANTES da venda —
// "dá para eu oferecer isso hoje?" — que hoje é respondida abrindo a mala.
//
// ⚠️ E é SÓ LEITURA. Quem corrige saldo é o Ops, e de propósito: a caixa é do
// vendedor, mas deixá-lo ajustar o próprio número tiraria o sentido de conferir
// qualquer coisa. Divergência de contagem vira conversa, não um campo editável.
// ─────────────────────────────────────────────────────────────────────────────

export default function MeuEstoque() {
  const { profile, isGestor } = useAuth();
  // Gestor pode olhar a caixa de outro; vendedor vê só a dele (a RLS confirma).
  const [alvo, setAlvo] = useState<string>(() => profile?.id ?? "");
  const { data: vendedores } = useVendedoresDir();
  const { data: estoque, isLoading } = useMeuEstoque(alvo || profile?.id);
  const { data: aCaminho } = useACaminho(alvo || profile?.id);
  const { data: saindo } = useSaindoDaMinhaCaixa(alvo || profile?.id);
  const [busca, setBusca] = useState("");
  const [soComSaldo, setSoComSaldo] = useState(true);

  const itens = useMemo(() => {
    let l = estoque?.itens ?? [];
    if (soComSaldo) l = l.filter((i) => i.quantidade > 0);
    const t = busca.trim().toLowerCase();
    if (t) l = l.filter((i) =>
      i.product_name.toLowerCase().includes(t) ||
      (i.product_code ?? "").toLowerCase().includes(t));
    return l;
  }, [estoque, busca, soComSaldo]);

  const emTransito = (aCaminho ?? []).reduce((s, t) => s + t.quantidade, 0);

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CarboPageHeader
            title="Meu Estoque"
            description="O que você tem em mãos para vender a pronta entrega"
            icon={PackageCheck}
          />
          {isGestor && (
            <Select value={alvo} onValueChange={setAlvo}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                {(vendedores ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.full_name ?? "Sem nome"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
          </div>
        ) : !estoque?.temCaixa ? (
          <CarboCard>
            <CarboCardContent className="py-10 text-center space-y-2">
              <PackageX className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">Você não tem caixa de estoque.</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Sem ela não dá para vender a pronta entrega — toda venda sua vai
                para produção. Fale com o time de Operações para abrir a sua.
              </p>
            </CarboCardContent>
          </CarboCard>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Kpi label="Unidades" valor={estoque.totalUnidades} />
              <Kpi label="Produtos" valor={estoque.itens.filter((i) => i.quantidade > 0).length} />
              <Kpi label="A caminho" valor={emTransito} destaque={emTransito > 0} />
            </div>

            {/* ── A caminho ──────────────────────────────────────────────────
                Fica antes do saldo porque explica uma ausência: enquanto está
                aqui, o produto não está em lugar nenhum — nem em Natal, nem na
                caixa. Sem isso, "sumiu" é a leitura natural. */}
            {(aCaminho ?? []).length > 0 && (
              <CarboCard>
                <CarboCardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-amber-600" />
                    <h2 className="text-sm font-semibold">A caminho</h2>
                    <span className="text-[11px] text-muted-foreground">
                      já saiu de Natal — ainda não dá para vender
                    </span>
                  </div>
                  <div className="divide-y">
                    {(aCaminho ?? []).map((t) => (
                      <div key={t.id} className="py-1.5">
                        <p className="text-sm">
                          <strong>{t.quantidade}</strong> × {t.product_code}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Enviado em {new Date(t.enviado_em).toLocaleDateString("pt-BR")}
                          {t.notes ? ` · ${t.notes}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Recebeu? Avise o time de Operações para confirmar a chegada —
                    o saldo só entra aqui depois disso.
                  </p>
                </CarboCardContent>
              </CarboCard>
            )}

            {/* ── Saindo ─────────────────────────────────────────────────────
                Espelho de "A caminho", invertido. A devolução debita a caixa na
                hora, mas o destino só credita na confirmação — sem esta lista o
                produto some do saldo e não aparece em lugar nenhum, e a leitura
                natural é "o sistema comeu meu estoque". */}
            {(saindo ?? []).length > 0 && (
              <CarboCard>
                <CarboCardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Undo2 className="h-4 w-4 text-sky-600" />
                    <h2 className="text-sm font-semibold">Saindo da sua caixa</h2>
                    <span className="text-[11px] text-muted-foreground">
                      já saiu do seu saldo — aguardando confirmação
                    </span>
                  </div>
                  <div className="divide-y">
                    {(saindo ?? []).map((t) => (
                      <div key={t.id} className="py-1.5">
                        <p className="text-sm"><strong>{t.quantidade}</strong> × {t.product_code}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Registrado em {new Date(t.enviado_em).toLocaleDateString("pt-BR")}
                          {t.notes ? ` · ${t.notes}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </CarboCardContent>
              </CarboCard>
            )}

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="h-9 pl-8" placeholder="Buscar produto..."
                  value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <Button size="sm" variant={soComSaldo ? "default" : "outline"} className="h-9"
                onClick={() => setSoComSaldo((v) => !v)}>
                {soComSaldo ? "Só o que tenho" : "Tudo"}
              </Button>
            </div>

            <CarboCard>
              <CarboCardContent className="p-4">
                {itens.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {soComSaldo
                      ? "Sua caixa está vazia. Toda venda sua vai para produção."
                      : "Nenhum produto encontrado."}
                  </p>
                ) : (
                  <div className="divide-y">
                    {itens.map((i) => (
                      <div key={i.product_id} className="flex items-center gap-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{i.product_name}</p>
                          <p className="text-[11px] text-muted-foreground">{i.product_code}</p>
                        </div>
                        {i.quantidade > 0 ? (
                          <span className="text-base font-bold tabular-nums">
                            {i.quantidade}
                            <span className="text-[11px] font-normal text-muted-foreground ml-1">
                              {i.stock_unit ?? "un"}
                            </span>
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">zerado</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CarboCardContent>
            </CarboCard>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, valor, destaque }: { label: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${
      destaque ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "bg-card"}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xl font-bold leading-tight">{valor}</p>
    </div>
  );
}
