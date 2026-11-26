import { useMemo, useState } from "react";
import { useParamUrl } from "@carbo/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, Loader2, Package, Wrench } from "lucide-react";
import {
  useMapaVendas, noCanal, NOME_UF,
  type CanalMapa, type EstadoVendas, type ProdutoVendas,
} from "@/hooks/useMapaConquista";

/**
 * Mapa da Conquista · Vendas por estado (26/11/2026).
 *
 * Pedido do dono do processo: ver, estado a estado, quanto se vende (pedidos,
 * unidades, faturamento), em quais cidades e de que produto — com B2B e
 * on-line SEPARADOS, para decidir de onde vale despachar (Natal × CD de SP).
 *
 * ⚠️ Os números vêm prontos do banco (`carbo_mapa_vendas`), cada um em B2B e
 * on-line; a tela só escolhe o canal e ordena. "Tudo" soma os dois e mostra a
 * barra do mix — é o que impede 99 mil de B2B de esconder mil de on-line.
 */

type Medida = "pedidos" | "unidades" | "valor";

const CANAIS: Array<{ id: CanalMapa; rotulo: string }> = [
  { id: "todos", rotulo: "Tudo" },
  { id: "b2b", rotulo: "B2B" },
  { id: "online", rotulo: "On-line" },
];
const MEDIDAS: Array<{ id: Medida; rotulo: string }> = [
  { id: "pedidos", rotulo: "Pedidos" },
  { id: "unidades", rotulo: "Unidades" },
  { id: "valor", rotulo: "Faturamento" },
];
const REGIOES = ["Nordeste", "Sudeste", "Sul", "Centro-Oeste", "Norte"];
const COR_B2B = "#16a34a";
const COR_ONLINE = "#0ea5e9";

const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: v > 0 && v < 10 ? 1 : 0 })}%`;
const fmtMedida = (m: Medida, v: number) => (m === "valor" ? fmtBRL(v) : fmtInt(v));
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s|-|\/)(\p{L})/gu, (_x, a: string, b: string) => a + b.toUpperCase())
  .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());

function Segmentos<T extends string>({ itens, valor, aoMudar }: {
  itens: Array<{ id: T; rotulo: string }>; valor: T; aoMudar: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border p-0.5">
      {itens.map((i) => (
        <Button key={i.id} size="sm" variant={valor === i.id ? "secondary" : "ghost"}
                className="h-7 px-3" onClick={() => aoMudar(i.id)}>
          {i.rotulo}
        </Button>
      ))}
    </div>
  );
}

/**
 * UMA barra: o comprimento é o tamanho da linha (`escala` = o maior valor da
 * lista) e, dentro dela, a parte B2B e a parte on-line — nas cores do canal.
 * Com um canal escolhido, só a cor dele aparece.
 */
function Barra({ b2b, online, escala, canal }: { b2b: number; online: number; escala: number; canal: CanalMapa }) {
  const b = canal === "online" ? 0 : b2b;
  const o = canal === "b2b" ? 0 : online;
  const pct = (v: number) => (escala > 0 ? Math.max(0, Math.min(100, (v / escala) * 100)) : 0);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
         title={canal === "todos" && b + o > 0 ? `B2B ${fmtPct((b / (b + o)) * 100)} · On-line ${fmtPct((o / (b + o)) * 100)}` : undefined}>
      <div style={{ width: `${pct(b)}%`, background: COR_B2B }} />
      <div style={{ width: `${pct(o)}%`, background: COR_ONLINE }} />
    </div>
  );
}

export default function VendasPorEstado({ de, ate, rotuloPeriodo, uf, setUf }: {
  de: string; ate: string; rotuloPeriodo: string;
  uf: string | null; setUf: (v: string | null) => void;
}) {
  const [canalUrl, setCanalUrl] = useParamUrl("canal", "todos");
  const canal: CanalMapa = CANAIS.some((c) => c.id === canalUrl) ? (canalUrl as CanalMapa) : "todos";
  const [medidaUrl, setMedidaUrl] = useParamUrl("medida", "pedidos");
  const medida: Medida = MEDIDAS.some((m) => m.id === medidaUrl) ? (medidaUrl as Medida) : "pedidos";
  const [cidadesTodas, setCidadesTodas] = useState(false);

  const q = useMapaVendas(de, ate, uf);
  const dados = q.data;

  const estados = useMemo(() => {
    const lista = (dados?.estados ?? []).map((e) => ({
      ...e,
      pedidos: noCanal(e, "pedidos", canal),
      unidades: noCanal(e, "unidades", canal),
      valor: noCanal(e, "valor", canal),
      ncidades: canal === "b2b" ? e.cidades_b2b : canal === "online" ? e.cidades_online : e.cidades,
    })).filter((e) => e.pedidos > 0);
    lista.sort((a, b) => b[medida] - a[medida] || a.uf.localeCompare(b.uf));
    return lista;
  }, [dados, canal, medida]);

  const total = useMemo(() => estados.reduce(
    (s, e) => ({ pedidos: s.pedidos + e.pedidos, unidades: s.unidades + e.unidades, valor: s.valor + e.valor }),
    { pedidos: 0, unidades: 0, valor: 0 }), [estados]);

  const regioes = useMemo(() => REGIOES.map((r) => {
    const dela = estados.filter((e) => e.regiao === r);
    const v = dela.reduce((s, e) => s + e[medida], 0);
    return {
      regiao: r, valor: v, estados: dela.length, pct: total[medida] ? (v / total[medida]) * 100 : 0,
      b2b: dela.reduce((s, e) => s + noCanal(e, medida, "b2b"), 0),
      online: dela.reduce((s, e) => s + noCanal(e, medida, "online"), 0),
    };
  }), [estados, medida, total]);

  const estadoSel = uf ? (dados?.estados ?? []).find((e) => e.uf === uf) ?? null : null;

  const cidades = useMemo(() => {
    const lista = (dados?.cidades ?? []).map((c) => ({
      ...c,
      pedidos: noCanal(c, "pedidos", canal),
      unidades: noCanal(c, "unidades", canal),
      valor: noCanal(c, "valor", canal),
    })).filter((c) => c.pedidos > 0);
    lista.sort((a, b) => b[medida] - a[medida] || a.cidade.localeCompare(b.cidade));
    return lista;
  }, [dados, canal, medida]);
  const totalCidades = cidades.reduce((s, c) => s + c[medida], 0);

  // Produtos: com "Tudo", B2B e on-line do MESMO produto e embalagem viram uma linha.
  const produtos = useMemo(() => {
    const m = new Map<string, ProdutoVendas & { b2b: number; online: number }>();
    for (const p of dados?.produtos ?? []) {
      if (canal !== "todos" && p.canal !== canal) continue;
      const k = `${p.chave}|${p.pack}|${p.servico}`;
      const atual = m.get(k);
      const un = Number(p.unidades);
      if (!atual) {
        m.set(k, { ...p, b2b: p.canal === "b2b" ? un : 0, online: p.canal === "online" ? un : 0 });
      } else {
        atual.pedidos += Number(p.pedidos);
        atual.quantidade += Number(p.quantidade);
        atual.unidades += un;
        atual.valor += Number(p.valor);
        if (p.canal === "b2b") atual.b2b += un; else atual.online += un;
      }
    }
    const lista = Array.from(m.values());
    lista.sort((a, b) => b.unidades - a.unidades || a.produto.localeCompare(b.produto));
    return {
      itens: lista.filter((p) => !p.servico),
      servicos: lista.filter((p) => p.servico),
    };
  }, [dados, canal]);
  const unidadesProdutos = produtos.itens.reduce((s, p) => s + p.unidades, 0);
  const semCadastro = produtos.itens.filter((p) => !p.conhecido).length;

  const embalagem = (p: ProdutoVendas) =>
    p.pack > 1 ? `Kit c/ ${fmtInt(p.pack)}` : /kit/i.test(p.produto) ? "Kit" : "Avulsa";

  if (q.isError) {
    return (
      <Card className="border-red-500/40">
        <CardContent className="flex items-center gap-2 p-4 text-sm text-red-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Não consegui carregar as vendas: {(q.error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const MEDIDA_ROTULO = MEDIDAS.find((m) => m.id === medida)!.rotulo.toLowerCase();

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmentos itens={CANAIS} valor={canal} aoMudar={(v) => setCanalUrl(v === "todos" ? null : v)} />
        <Segmentos itens={MEDIDAS} valor={medida} aoMudar={(v) => setMedidaUrl(v === "pedidos" ? null : v)} />
        {canal === "todos" && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COR_B2B }} />B2B</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COR_ONLINE }} />On-line</span>
          </div>
        )}
        {q.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <span className="ml-auto text-xs text-muted-foreground">
          {fmtInt(total.pedidos)} pedidos · {fmtInt(total.unidades)} unidades · {fmtBRL(total.valor)} · {rotuloPeriodo}
        </span>
      </div>

      {/* Regiões */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {regioes.map((r) => (
          <Card key={r.regiao}>
            <CardContent className="space-y-1.5 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{r.regiao}</span>
                <span>{r.estados} UF</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xl font-bold">{fmtPct(r.pct)}</span>
                <span className="truncate text-xs text-muted-foreground">{fmtMedida(medida, r.valor)}</span>
              </div>
              <Barra b2b={r.b2b} online={r.online} escala={total[medida]} canal={canal} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Ranking de estados */}
        <Card className="xl:col-span-2">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Estados por {MEDIDA_ROTULO}</span>
              <span className="text-xs text-muted-foreground">{estados.length} de 27</span>
            </div>
            {q.isLoading ? (
              <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : estados.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma venda no período.</p>
            ) : (
              <div className="divide-y">
                {estados.map((e, i) => {
                  const pct = total[medida] ? (e[medida] / total[medida]) * 100 : 0;
                  return (
                    <button key={e.uf} type="button" onClick={() => setUf(uf === e.uf ? null : e.uf)}
                            className={`grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2 text-left text-sm
                                        hover:bg-muted/50 ${uf === e.uf ? "bg-muted" : ""}`}>
                      <span className="text-xs text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{e.uf}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">{NOME_UF[e.uf] ?? ""}</span>
                      </span>
                      <span className="text-right font-medium tabular-nums">
                        {fmtMedida(medida, e[medida])}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">{fmtPct(pct)}</span>
                      </span>
                      <span />
                      <Barra b2b={noCanal(e, medida, "b2b")} online={noCanal(e, medida, "online")}
                             escala={estados[0][medida]} canal={canal} />
                      <span className="text-right text-[11px] text-muted-foreground tabular-nums">
                        {fmtInt(e.pedidos)} ped · {fmtInt(e.unidades)} un · {e.ncidades} cid.
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* O estado escolhido (ou o Brasil) */}
        <div className="min-w-0 space-y-4 xl:col-span-3">
          {uf && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold">{NOME_UF[uf] ?? uf}</div>
                    <div className="text-xs text-muted-foreground">{estadoSel?.regiao ?? ""} · {rotuloPeriodo}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setUf(null)}>
                    <ArrowLeft className="mr-1 h-4 w-4" /> Brasil
                  </Button>
                </div>
                {estadoSel ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {([
                        ["Pedidos", fmtInt(noCanal(estadoSel, "pedidos", canal))],
                        ["Unidades", fmtInt(noCanal(estadoSel, "unidades", canal))],
                        ["Faturamento", fmtBRL(noCanal(estadoSel, "valor", canal))],
                        ["Cidades", String(canal === "b2b" ? estadoSel.cidades_b2b : canal === "online" ? estadoSel.cidades_online : estadoSel.cidades)],
                      ] as const).map(([t, v]) => (
                        <div key={t} className="rounded-md border px-3 py-2">
                          <div className="text-xs text-muted-foreground">{t}</div>
                          <div className="text-lg font-bold tabular-nums">{v}</div>
                        </div>
                      ))}
                    </div>
                    {canal === "todos" && (
                      <div className="space-y-1">
                        <Barra b2b={noCanal(estadoSel, medida, "b2b")} online={noCanal(estadoSel, medida, "online")}
                               escala={noCanal(estadoSel, medida, "todos")} canal="todos" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>B2B {fmtMedida(medida, noCanal(estadoSel, medida, "b2b"))}</span>
                          <span>On-line {fmtMedida(medida, noCanal(estadoSel, medida, "online"))}</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma venda neste estado no período.</p>
                )}
              </CardContent>
            </Card>
          )}

          {uf && (
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm font-semibold">Cidades por {MEDIDA_ROTULO}</span>
                  <span className="text-xs text-muted-foreground">{cidades.length}</span>
                </div>
                {cidades.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">Nenhuma cidade com venda neste canal.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_4.5rem_6.5rem] gap-x-3 border-b px-4 py-1.5 text-[11px] text-muted-foreground">
                      <span>#</span><span>Cidade</span>
                      <span className="text-right">Pedidos</span><span className="text-right">Unidades</span>
                      <span className="text-right">Faturamento</span>
                    </div>
                    <div className="divide-y">
                      {(cidadesTodas ? cidades : cidades.slice(0, 30)).map((c, i) => (
                        <div key={c.cidade}
                             className="grid grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_4.5rem_6.5rem] items-center gap-x-3 px-4 py-1.5 text-sm">
                          <span className="text-xs text-muted-foreground">{i + 1}</span>
                          <span className="min-w-0">
                            <span className="block truncate">{titulo(c.cidade)}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {totalCidades ? fmtPct((c[medida] / totalCidades) * 100) : ""} do estado
                            </span>
                          </span>
                          <span className="text-right tabular-nums">{fmtInt(c.pedidos)}</span>
                          <span className="text-right tabular-nums">{fmtInt(c.unidades)}</span>
                          <span className="text-right tabular-nums">{fmtBRL(c.valor)}</span>
                        </div>
                      ))}
                    </div>
                    {cidades.length > 30 && (
                      <div className="border-t p-2 text-center">
                        <Button variant="ghost" size="sm" onClick={() => setCidadesTodas((v) => !v)}>
                          {cidadesTodas ? "Mostrar menos" : `Mostrar todas · faltam ${cidades.length - 30}`}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Produtos · {uf ? (NOME_UF[uf] ?? uf) : "Brasil"}
                </span>
                <span className="text-xs text-muted-foreground">{fmtInt(unidadesProdutos)} unidades</span>
              </div>
              {semCadastro > 0 && (
                <div className="flex items-center gap-1.5 border-b bg-amber-500/5 px-4 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {semCadastro} item(ns) sem cadastro no catálogo ou no mapa de SKU — contados como 1 unidade por item.
                </div>
              )}
              {produtos.itens.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nenhum produto no período.</p>
              ) : (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_4.5rem_5rem_4.5rem] gap-x-3 border-b px-4 py-1.5 text-[11px] text-muted-foreground">
                    <span>Produto</span><span>Embalagem</span>
                    <span className="text-right">Pedidos</span><span className="text-right">Vendidos</span>
                    <span className="text-right">Unidades</span><span className="text-right">% un.</span>
                  </div>
                  <div className="divide-y">
                    {produtos.itens.map((p) => (
                      <div key={`${p.chave}|${p.pack}`}
                           className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_4.5rem_5rem_4.5rem] items-center gap-x-3 px-4 py-1.5 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate" title={p.codigo ? `Código ${p.codigo}` : undefined}>{p.produto}</span>
                          {!p.conhecido && <Badge variant="outline" className="mt-0.5 border-amber-500/50 text-[10px] text-amber-600 dark:text-amber-400">sem cadastro{p.codigo ? ` · ${p.codigo}` : ""}</Badge>}
                          {canal === "todos" && p.b2b > 0 && p.online > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              B2B {fmtInt(p.b2b)} · On-line {fmtInt(p.online)}
                            </span>
                          )}
                          {canal === "todos" && !(p.b2b > 0 && p.online > 0) && (
                            <span className="block text-[11px] text-muted-foreground">{p.online > 0 ? "On-line" : "B2B"}</span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">{embalagem(p)}</span>
                        <span className="text-right tabular-nums">{fmtInt(p.pedidos)}</span>
                        <span className="text-right tabular-nums">{fmtInt(p.quantidade)}</span>
                        <span className="text-right font-medium tabular-nums">{fmtInt(p.unidades)}</span>
                        <span className="text-right text-xs text-muted-foreground tabular-nums">
                          {unidadesProdutos ? fmtPct((p.unidades / unidadesProdutos) * 100) : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {produtos.servicos.length > 0 && (
                <div className="border-t px-4 py-2">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Wrench className="h-3 w-3" /> Serviços
                  </div>
                  {produtos.servicos.map((p) => (
                    <div key={p.chave} className="flex items-center justify-between text-xs">
                      <span className="truncate">{p.produto}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {fmtInt(p.pedidos)} pedido(s) · {fmtInt(p.quantidade)} veículo(s)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export type { EstadoVendas };
