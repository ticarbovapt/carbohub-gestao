import { ArrowDownRight, ArrowUpRight, Store, Filter, Trophy, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  derivar, fmtMoeda, fmtNum, fmtPct, fmtRoas,
  type MetaPainel, type MetaAnuncio,
} from "@/hooks/useMetaAds";
import { Miniatura, StatusDoAnuncio } from "@/components/meta/SegmentosMeta";

// ─────────────────────────────────────────────────────────────────────────────
// As seções do painel que a tabela de campanhas não mostra (20261113).
//
// ⚠️ Tudo aqui vem AGREGADO do banco (`carbo_meta_ads_painel`); a tela só
// divide. E a divisão passa pelo `derivar()`, a ÚNICA conta de métrica derivada
// do módulo — ROAS do período é soma(valor) ÷ soma(gasto), nunca média de ROAS.
// ─────────────────────────────────────────────────────────────────────────────

/** Variação percentual; `null` quando não há base para comparar. */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

/**
 * O chip "▲ 12% vs. período anterior".
 * `bomQuandoSobe`: true (verde ao subir), false (verde ao cair, ex.: CPA) ou
 * undefined (neutro — investimento subir não é bom nem ruim por si).
 */
export function ChipVariacao({ pct, bomQuandoSobe }: { pct: number | null; bomQuandoSobe?: boolean }) {
  if (pct == null) return <span className="text-[11px] text-muted-foreground">sem base no período anterior</span>;
  const sobe = pct >= 0;
  // Abaixo de meio ponto é ESTÁVEL: pintar 0,2% de verde é ler sinal em ruído.
  const estavel = Math.abs(pct) < 0.5;
  const bom = bomQuandoSobe === undefined || estavel ? null : sobe === bomQuandoSobe;
  const Icone = sobe ? ArrowUpRight : ArrowDownRight;
  return (
    <span title="vs. período anterior" className={cn(
      "inline-flex items-center gap-0.5 text-[11px] font-medium",
      bom === null ? "text-muted-foreground" : bom ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
    )}>
      {estavel ? "estável vs. anterior" : (
        <><Icone className="h-3 w-3" />{Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. anterior</>
      )}
    </span>
  );
}

// ── A loja de verdade ────────────────────────────────────────────────────────

export function LojaReal({ painel, moeda, filtrandoConta }: { painel: MetaPainel; moeda: string; filtrandoConta: boolean }) {
  const { loja, atual } = painel;
  const mer = atual.spend > 0 ? loja.faturamento / atual.spend : null;
  const ticket = loja.pedidos > 0 ? loja.faturamento / loja.pedidos : null;
  const fatia = loja.faturamento > 0 ? (atual.valor / loja.faturamento) * 100 : null;
  const custoPedido = loja.pedidos > 0 ? atual.spend / loja.pedidos : null;

  const itens = [
    { titulo: "Faturamento da loja", valor: fmtMoeda(loja.faturamento, moeda),
      apoio: <ChipVariacao pct={variacao(loja.faturamento, loja.faturamento_anterior)} bomQuandoSobe /> },
    { titulo: "Pedidos na loja", valor: fmtNum(loja.pedidos), apoio: <>ticket médio {fmtMoeda(ticket, moeda)}</> },
    { titulo: "MER", valor: fmtRoas(mer), apoio: null, destaque: true },
    { titulo: "Investimento por pedido", valor: fmtMoeda(custoPedido, moeda), apoio: null },
    { titulo: "Quanto a Meta assume", valor: fmtPct(fatia), apoio: null },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="h-4 w-4 text-primary" /> O resultado real da loja própria
        </CardTitle>
        {filtrandoConta && (
          <p className="text-xs text-muted-foreground">Números da loja inteira (não se dividem por conta).</p>
        )}
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {itens.map((i) => (
          <div key={i.titulo} className={cn("rounded-lg border px-3 py-2.5", i.destaque && "border-primary/50 bg-primary/5")}>
            <p className="text-xs text-muted-foreground">{i.titulo}</p>
            <p className={cn("text-xl font-bold tabular-nums", i.destaque && "text-primary")}>{i.valor}</p>
            {i.apoio && <p className="text-[11px] text-muted-foreground">{i.apoio}</p>}
          </div>
        ))}
        {fatia != null && fatia > 100 && (
          <p className="sm:col-span-2 lg:col-span-5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A Meta está creditando a si mesma mais do que a loja vendeu no período.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── O funil: do anúncio à compra ─────────────────────────────────────────────

export function Funil({ painel, moeda }: { painel: MetaPainel; moeda: string }) {
  const f = painel.funil;
  const gasto = painel.atual.spend;
  // ⚠️ O caminho REAL do site, medido (20261114): a página da PayT leva direto
  // ao checkout, sem carrinho — checkout (7,2 mil) passa do carrinho (2 mil).
  // "Viu o produto" e "carrinho" ficam À PARTE, porque nem todo caminho os
  // dispara; metê-los na sequência daria "363% seguiram".
  const etapas = [
    { rotulo: "Cliques no link", v: f.cliques, custo: "por clique" },
    { rotulo: "Chegaram na página", v: f.pagina, custo: "por visita" },
    { rotulo: "Iniciaram o checkout", v: f.checkout, custo: "por checkout" },
    ...(f.pagamento === undefined ? [] : [{ rotulo: "Preencheram o pagamento", v: f.pagamento, custo: "por pagamento" }]),
    { rotulo: "Compraram", v: f.compras, custo: "por compra" },
  ];
  const topo = Math.max(...etapas.map((e) => e.v), 1);
  let anterior: number | null = null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="h-4 w-4 text-primary" /> Do anúncio à compra
        </CardTitle>
        <p className="text-xs text-muted-foreground">{fmtNum(f.impressoes)} impressões no período</p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {etapas.map((e) => {
          const bruta = anterior && e.v ? (e.v / anterior) * 100 : null;
          // Acima de 100% não é conversão, é evento que não segue a sequência.
          const taxa = bruta != null && bruta <= 100 ? bruta : null;
          const semEvento = e.v === 0;
          const linha = (
            <div key={e.rotulo} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 sm:grid-cols-[12rem_1fr_7rem_8rem]">
              <span className="text-sm">{e.rotulo}</span>
              <div className="relative h-7 overflow-hidden rounded-md bg-muted/50">
                <div className="h-full rounded-md bg-primary/70" style={{ width: `${Math.max((e.v / topo) * 100, semEvento ? 0 : 1.5)}%` }} />
                <span className="absolute inset-y-0 left-2 flex items-center text-xs font-semibold tabular-nums">
                  {semEvento ? "o pixel não mandou este evento" : fmtNum(e.v)}
                </span>
              </div>
              <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                {taxa == null ? "" : `${fmtPct(taxa)} seguiram`}
              </span>
              <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                {semEvento ? "—" : `${fmtMoeda(gasto / e.v, moeda)} ${e.custo}`}
              </span>
            </div>
          );
          if (!semEvento) anterior = e.v;
          return linha;
        })}
        {(f.produto > 0 || f.carrinho > 0) && (
          <p className="pt-1 text-xs text-muted-foreground">
            Fora da sequência: <span className="font-medium text-foreground">{fmtNum(f.produto)}</span> viram
            o produto · <span className="font-medium text-foreground">{fmtNum(f.carrinho)}</span> adicionaram ao carrinho
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Destaques por anúncio ────────────────────────────────────────────────────

// ⚠️ Objetivo de VENDA ou desconhecido (linha anterior ao campo existir). Campanha
// de engajamento ou alcance não vende por definição, e listá-la como "gastando
// sem vender" seria acusar o anúncio de não fazer o que ele nunca tentou.
const OBJETIVO_DE_VENDA = /SALES|CONVERSION|PURCHASE|PRODUCT_CATALOG/i;

function LinhaAnuncio({ a, moeda, detalhe }: { a: MetaAnuncio; moeda: string; detalhe: string }) {
  return (
    <li className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <Miniatura adId={a.ad_id} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate" title={a.nome ?? a.ad_id}>{a.nome ?? a.ad_id}</span>
            <StatusDoAnuncio adId={a.ad_id} />
          </p>
          <p className="truncate text-[11px] text-muted-foreground" title={a.campanha ?? ""}>{a.campanha ?? "—"}</p>
        </div>
      </div>
      <div className="shrink-0 sm:text-right">
        <p className="text-sm font-semibold tabular-nums">{detalhe}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {fmtMoeda(a.spend, moeda)} investidos · {fmtNum(a.compras)} compra(s)
        </p>
      </div>
    </li>
  );
}

export function Destaques({ painel, moeda }: { painel: MetaPainel; moeda: string }) {
  const total = painel.atual.spend;
  // Gasto mínimo para entrar no destaque: 3% do período, com piso de R$ 50.
  // Sem isso, um anúncio de R$ 4 com uma venda vira "ROAS 30x" e lidera a lista.
  const minimo = Math.max(50, total * 0.03);
  const relevantes = painel.anuncios.filter((a) => a.spend >= minimo);

  const melhores = relevantes
    .filter((a) => a.compras > 0)
    .map((a) => ({ a, d: derivar(a) }))
    .sort((x, y) => (y.d.roas ?? 0) - (x.d.roas ?? 0))
    .slice(0, 5);

  const semVenda = relevantes
    .filter((a) => a.compras === 0 && (!a.objetivo || OBJETIVO_DE_VENDA.test(a.objetivo)))
    .sort((x, y) => y.spend - x.spend)
    .slice(0, 5);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-emerald-600" /> Os anúncios que mais retornam
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Por ROAS (Meta) · investimento mínimo de {fmtMoeda(minimo, moeda)}
          </p>
        </CardHeader>
        <CardContent>
          {melhores.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum anúncio com compra acima do mínimo de gasto.</p>
          ) : (
            <ul className="divide-y">
              {melhores.map(({ a, d }) => (
                <LinhaAnuncio key={a.ad_id} a={a} moeda={moeda} detalhe={`ROAS ${fmtRoas(d.roas)} · CPA ${fmtMoeda(d.cpa, moeda)}`} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Investindo e sem venda
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Investimento mínimo de {fmtMoeda(minimo, moeda)}
          </p>
        </CardHeader>
        <CardContent>
          {semVenda.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum anúncio.</p>
          ) : (
            <ul className="divide-y">
              {semVenda.map((a) => {
                const d = derivar(a);
                return (
                  <LinhaAnuncio key={a.ad_id} a={a} moeda={moeda}
                    detalhe={`${fmtNum(a.carrinho)} carrinho(s) · CTR ${fmtPct(d.ctr)}`} />
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
