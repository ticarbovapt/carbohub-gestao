import { Fragment, useMemo, useState } from "react";
import { Tags, AlertTriangle, Search, Check, Plus, Eye, EyeOff, Gift } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import {
  useFinalProducts, useSetProductPrice, useFaixasPreco, useCriarFaixaPreco,
  useProdutoNoVender, type FinalProduct, type FaixaPreco,
} from "@/hooks/useProductPrices";

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

// Linha editável: mantém o valor local e só habilita "Salvar" quando muda.
function PriceRow({ p, faixa, bonificacao }: { p: FinalProduct; faixa?: FaixaPreco; bonificacao?: boolean }) {
  const setPrice = useSetProductPrice();
  const noVender = useProdutoNoVender();
  const derivado = !!faixa || !!bonificacao;
  const [val, setVal] = useState<string>(p.sale_price == null ? "" : String(p.sale_price));
  const original = p.sale_price == null ? "" : String(p.sale_price);
  const dirty = val.trim() !== original;
  const save = () => setPrice.mutate({ productId: p.id, price: val.trim() === "" ? null : Number(val) });

  return (
    <tr className={`border-b last:border-0 hover:bg-accent/40 ${p.aparece_no_vender ? "" : "opacity-50"}`}>
      <td className="px-4 py-2">
        <div className={derivado ? "pl-5 border-l-2 border-carbo-green/30" : ""}>
          <div className="font-medium truncate max-w-[280px] flex items-center gap-2">
            {p.name}
            {faixa && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-carbo-green/10 text-carbo-green">
                {faixa.rotulo}
              </span>
            )}
            {bonificacao && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-600 flex items-center gap-1">
                <Gift className="h-3 w-3" /> bonificação
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">{p.product_code || "—"}</div>
          {/* ⚠️ Sem preço, a faixa NÃO VENDE — o /vender recusa produto sem
              preço. Dizer isso aqui é o que impede alguém criar a faixa, ver a
              linha nova na tela e achar que já está no ar. */}
          {faixa && p.sale_price == null && (
            <div className="text-[10px] text-amber-600">sem preço — não aparece para venda</div>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground">{p.stock_unit || "—"}</td>
      <td className="px-4 py-2">
        {/* ⚠️ O preço do gêmeo de bonificação é SOMENTE LEITURA: ele espelha o
            do pai por gatilho (`trg_bonificacao_espelha_preco`). Campo editável
            aqui seria um campo que o banco desfaz no próximo save do pai,
            calado. Ele aparece na lista só por causa do interruptor. */}
        {bonificacao ? (
          <span className="text-xs text-muted-foreground">
            {p.sale_price == null ? "—" : brl(p.sale_price)} <span className="opacity-60">· espelha o pai</span>
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">R$</span>
            <Input type="number" min={0} step="0.01" value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && dirty) save(); }}
              placeholder="—" className="w-28 h-8" />
          </div>
        )}
      </td>
      {/* ── No /vender ────────────────────────────────────────────────────
          ⚠️ O rótulo diz "no /vender", e não "ativo", de propósito: esconder
          NÃO desativa o produto. Ele continua no estoque, na produção e no
          MRP. Chamar isto de "ativo" faria alguém desligar um produto que tem
          saldo na prateleira achando que só estava limpando a lista. */}
      <td className="px-4 py-2">
        <label className="flex items-center gap-2 cursor-pointer" title={
          p.aparece_no_vender
            ? "Aparece no dropdown do /vender. Desligar não desativa o produto — ele continua no estoque e na produção."
            : "Escondido do /vender. O produto continua no estoque e na produção."
        }>
          <Switch checked={p.aparece_no_vender} disabled={noVender.isPending}
            onCheckedChange={(v) => noVender.mutate({ productId: p.id, aparece: !!v })} />
          {p.aparece_no_vender
            ? <Eye className="h-3.5 w-3.5 text-carbo-green" />
            : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
        </label>
      </td>
      <td className="px-4 py-2 text-[11px] text-muted-foreground whitespace-nowrap">
        {bonificacao ? "—" : p.sale_price_updated_at ? <>por {p.updated_by_name} · {fmtDate(p.sale_price_updated_at)}</> : "nunca definido"}
      </td>
      <td className="px-4 py-2 text-right">
        {!bonificacao && (
          <CarboButton size="sm" disabled={!dirty || setPrice.isPending} onClick={save}>
            <Check className="h-3.5 w-3.5 mr-1" /> Salvar
          </CarboButton>
        )}
      </td>
    </tr>
  );
}

/** Botão que cria a faixa que ainda não existe para este produto. */
function BotoesFaixa({ produto, faltando }: { produto: FinalProduct; faltando: FaixaPreco[] }) {
  const criar = useCriarFaixaPreco();
  if (!faltando.length) return null;
  return (
    <div className="flex flex-wrap gap-1 justify-end">
      {faltando.map((f) => (
        <CarboButton key={f.codigo} size="sm" variant="outline" disabled={criar.isPending}
          title={f.hint ?? undefined}
          onClick={() => criar.mutate({ productId: produto.id, faixa: f.codigo })}>
          <Plus className="h-3 w-3 mr-1" /> {f.rotulo}
        </CarboButton>
      ))}
    </div>
  );
}

export default function ProdutosPrecos() {
  const { canAdmin } = useAuth();
  const { data: produtos = [], isLoading } = useFinalProducts();
  const { data: faixas = [] } = useFaixasPreco();
  const [q, setQ] = useState("");

  /**
   * A lista vira GRUPOS: o produto real e, logo abaixo, as faixas dele.
   *
   * ⚠️ O gêmeo de BONIFICAÇÃO sai daqui. Ele nunca teve preço editável — o
   * preço dele ESPELHA o do pai por gatilho (`trg_bonificacao_espelha_preco`),
   * então um campo editável ali é um campo que o banco desfaz no próximo save,
   * calado. Ele estava na tela porque a consulta não o excluía, não porque
   * alguém decidiu que deveria estar.
   *
   * ⚠️ A busca casa no PAI e traz as faixas junto. Filtrar linha a linha
   * mostraria "CarboZé 100ml - PDV" solto, sem o pai ao lado, e ninguém
   * saberia de qual produto é aquele preço.
   */
  const grupos = useMemo(() => {
    const reais = produtos.filter((p) => !p.preco_de && !p.bonificacao_de);
    const porPai = new Map<string, FinalProduct[]>();
    const gemeoDe = new Map<string, FinalProduct>();
    for (const p of produtos) {
      if (p.bonificacao_de) { gemeoDe.set(p.bonificacao_de, p); continue; }
      if (!p.preco_de) continue;
      const arr = porPai.get(p.preco_de) ?? [];
      arr.push(p);
      porPai.set(p.preco_de, arr);
    }
    const t = q.trim().toLowerCase();
    return reais
      .filter((p) => !t || p.name.toLowerCase().includes(t) || (p.product_code ?? "").toLowerCase().includes(t))
      .map((pai) => {
        const filhas = (porPai.get(pai.id) ?? []).slice().sort((a, b) => {
          const oa = faixas.findIndex((f) => f.codigo === a.faixa_preco);
          const ob = faixas.findIndex((f) => f.codigo === b.faixa_preco);
          return oa - ob;
        });
        const temFaixa = new Set(filhas.map((f) => f.faixa_preco));
        return {
          pai, filhas,
          // ⚠️ O gêmeo de bonificação VOLTOU para a lista — sem preço editável,
          // só com o interruptor. Ele é METADE do dropdown (11 de 22 em
          // 29/09/2026) e não havia por onde escondê-lo: a tela era o único
          // lugar que o mostra, e eu o tinha tirado por causa do preço.
          gemeo: gemeoDe.get(pai.id),
          faltando: faixas.filter((f) => !temFaixa.has(f.codigo)),
        };
      });
  }, [produtos, faixas, q]);

  // ⚠️ Conta só o que é VENDÁVEL: produto real e faixa criada. O gêmeo de
  // bonificação tem preço espelhado e nunca é "lacuna de configuração".
  const vendaveis = produtos.filter((p) => !p.bonificacao_de);
  const semPreco = vendaveis.filter((p) => p.sale_price == null).length;
  // ⚠️ O número que importa aqui é o TAMANHO DO DROPDOWN, não a contagem de
  // produtos: foi ele que motivou o interruptor ("o dropdown lotado de coisa").
  // Sem mostrá-lo, esconder linha a linha é trabalho sem placar.
  const noDropdown = produtos.filter((p) => p.aparece_no_vender).length;

  if (!canAdmin) {
    return <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8"><RestrictedNotice /></main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5">
      <CarboPageHeader
        icon={Tags}
        title="Tabela de preços"
        description="Preço fixo por produto final, e as faixas por tipo de cliente. O /vender usa estes valores — o vendedor não digita preço."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto ou código…" className="pl-9" />
        </div>
        <p className="text-xs text-muted-foreground">
          {vendaveis.length} produtos{semPreco > 0 ? ` · ${semPreco} sem preço definido` : " · todos com preço"}
          {" · "}<span className="font-semibold text-foreground">{noDropdown}</span> linha(s) no dropdown do /vender
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : grupos.length === 0 ? (
        <CarboEmptyState icon={Tags} title="Nenhum produto" description="Não há produtos finais para o filtro atual." />
      ) : (
        <CarboCard>
          <CarboCardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Unidade</th>
                  <th className="px-4 py-2 font-medium">Preço fixo</th>
                  <th className="px-4 py-2 font-medium">No /vender</th>
                  <th className="px-4 py-2 font-medium">Atualizado</th>
                  <th className="px-4 py-2 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <Fragment key={g.pai.id}>
                    <PriceRow p={g.pai} />
                    {g.filhas.map((f) => (
                      <PriceRow key={f.id} p={f} faixa={faixas.find((x) => x.codigo === f.faixa_preco)} />
                    ))}
                    {g.gemeo && <PriceRow key={g.gemeo.id} p={g.gemeo} bonificacao />}
                    {g.faltando.length > 0 && (
                      <tr className="border-b last:border-0">
                        <td colSpan={6} className="px-4 pb-2 pt-0">
                          <BotoesFaixa produto={g.pai} faltando={g.faltando} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </CarboCardContent>
        </CarboCard>
      )}
    </main>
  );
}
