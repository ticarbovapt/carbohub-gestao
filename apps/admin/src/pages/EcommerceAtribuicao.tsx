import { useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Megaphone, RefreshCw, Wallet, ShoppingBag, TrendingUp, Target,
  Eye, MousePointerClick, ChevronRight, AlertTriangle, Info, Plug,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useMetaAds, useMetaAdsContas, useMetaAdsSync, useMetaAdsUltimoSync,
  PERIOD_LABEL, fmtMoeda, fmtNum, fmtPct, fmtRoas,
  type MetaPeriod, type MetaNo, type MetaDerivadas,
} from "@/hooks/useMetaAds";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Anúncios da Meta — investimento, alcance e a conversão que a META atribui.
//
// ⚠️ O QUE ESTA TELA NÃO É (e por que isso está escrito na própria tela)
//
// "Vendas" aqui é o que a Meta diz ter vendido, pela atribuição dela
// (7 dias de clique / 1 dia de visualização). NÃO é o faturamento de
// `ecommerce_orders`. Os dois não batem, e nunca vão bater:
//
//   · a Meta credita a si mesma uma venda que o cliente fechou depois de ver o
//     anúncio e entrar pelo Google;
//   · ela não sabe de cancelamento, devolução nem estorno;
//   · ela não conhece a margem do SKU — R$ 3 de ROAS em kit de baixa margem
//     pode ser prejuízo.
//
// A ficha da atribuição própria (cruzar campanha com a venda real do banco via
// UTM) é a etapa seguinte; enquanto ela não existe, mentir por omissão seria
// deixar o usuário achar que este ROAS é o ROAS do negócio. Daí o aviso fixo no
// rodapé — ele sai quando a coluna "ROAS real" entrar ao lado.
// ─────────────────────────────────────────────────────────────────────────────

const PERIODOS: MetaPeriod[] = ["today", "yesterday", "7d", "30d", "month"];

// ── Card de indicador ────────────────────────────────────────────────────────

function Indicador({
  icone: Icone, titulo, valor, apoio, destaque,
}: {
  icone: typeof Wallet; titulo: string; valor: string; apoio?: string; destaque?: boolean;
}) {
  return (
    <Card className={cn(destaque && "border-primary/50 bg-primary/5")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icone className="h-3.5 w-3.5" /> {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold tabular-nums", destaque && "text-primary")}>{valor}</div>
        {apoio && <p className="mt-0.5 text-xs text-muted-foreground">{apoio}</p>}
      </CardContent>
    </Card>
  );
}

// ── Linha da árvore campanha → conjunto → anúncio ────────────────────────────

function LinhaNo({
  no, nivel, moeda, aberto, alternar,
}: {
  no: MetaNo; nivel: number; moeda: string;
  aberto: Set<string>; alternar: (id: string) => void;
}) {
  const temFilhos = !!no.filhos?.length;
  const estaAberto = aberto.has(no.id);

  return (
    <>
      <tr className={cn("border-t hover:bg-muted/40", nivel > 0 && "bg-muted/20")}>
        <td className="px-3 py-2">
          <button
            onClick={() => temFilhos && alternar(no.id)}
            disabled={!temFilhos}
            className={cn(
              "flex items-center gap-1.5 text-left max-w-[26rem]",
              temFilhos ? "hover:text-primary" : "cursor-default",
            )}
            style={{ paddingLeft: `${nivel * 1.25}rem` }}
          >
            {temFilhos
              ? <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", estaAberto && "rotate-90")} />
              : <span className="w-3.5 shrink-0" />}
            <span className={cn("truncate", nivel === 0 && "font-medium")} title={no.nome}>{no.nome}</span>
          </button>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(no.spend, moeda)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(no.impressions)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtPct(no.ctr)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(no.cpc, moeda)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(no.compras)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(no.cpa, moeda)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(no.valor, moeda)}</td>
        <td className="px-3 py-2 text-right">
          <span className={cn(
            "tabular-nums font-medium",
            // Sem meta de ROAS cadastrada, 1x é o único corte que não é chute:
            // abaixo disso a campanha devolve menos do que custou.
            no.roas != null && (no.roas >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"),
          )}>
            {fmtRoas(no.roas)}
          </span>
        </td>
      </tr>

      {estaAberto && no.filhos?.map((f) => (
        <LinhaNo key={f.id} no={f} nivel={nivel + 1} moeda={moeda} aberto={aberto} alternar={alternar} />
      ))}
    </>
  );
}

// ── Estados vazios: cada um com a causa e o próximo passo ───────────────────

function Vazio({ icone: Icone, titulo, children }: {
  icone: typeof Plug; titulo: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <Icone className="h-9 w-9 text-muted-foreground/60" />
        <div className="text-base font-medium">{titulo}</div>
        <div className="max-w-md text-sm text-muted-foreground">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function EcommerceAtribuicao() {
  const [period, setPeriod] = useState<MetaPeriod>("30d");
  const [actId, setActId] = useState<string>("todas");
  const [aberto, setAberto] = useState<Set<string>>(new Set());

  const contas = useMetaAdsContas();
  const { data, isLoading, error } = useMetaAds(period, undefined, actId === "todas" ? undefined : actId);
  const sync = useMetaAdsSync();
  const logs = useMetaAdsUltimoSync();

  const alternar = (id: string) =>
    setAberto((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const moeda = data?.moeda ?? "BRL";
  const t: MetaDerivadas | undefined = data?.total;
  const ultimoErro = logs.data?.find((l) => !l.ok);

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      {/* ── Cabeçalho ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6 text-primary" /> Anúncios da Meta
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Investimento, alcance e conversão das contas de anúncio, direto da Meta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(contas.data?.length ?? 0) > 1 && (
            <Select value={actId} onValueChange={setActId}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as contas</SelectItem>
                {contas.data?.map((c) => (
                  <SelectItem key={c.act_id} value={c.act_id}>{c.apelido}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={period} onValueChange={(v) => setPeriod(v as MetaPeriod)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => sync.mutate(30)} disabled={sync.isPending}>
            <RefreshCw className={cn("mr-2 h-4 w-4", sync.isPending && "animate-spin")} />
            {sync.isPending ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
        </div>
      </div>

      {/* ⚠️ Erro da ÚLTIMA rodada aparece mesmo com dado velho na tela — sem
          isto, o painel mostra números de dias atrás com cara de atual. */}
      {ultimoErro && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <span className="font-medium">A última sincronização falhou</span>
            {ultimoErro.act_id && <> na conta <code className="text-xs">{ultimoErro.act_id}</code></>}:{" "}
            <span className="text-muted-foreground">{ultimoErro.erro}</span>
            <div className="text-xs text-muted-foreground">
              Os números abaixo podem estar desatualizados.
            </div>
          </div>
        </div>
      )}

      {/* ── Corpo ── */}
      {contas.isLoading || isLoading ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Carregando…</CardContent></Card>

      ) : error ? (
        <Vazio icone={AlertTriangle} titulo="Não foi possível ler os dados">
          {error instanceof Error ? error.message : "Erro desconhecido ao consultar meta_ads_diario."}
        </Vazio>

      ) : (contas.data?.length ?? 0) === 0 ? (
        <Vazio icone={Plug} titulo="Nenhuma conta de anúncio conectada">
          Cadastre a conta em <code className="text-xs">meta_ads_accounts</code> com o id no
          formato <code className="text-xs">act_123456789</code> e configure o
          secret <code className="text-xs">META_ADS_ACCESS_TOKEN</code> com um token de
          System User com permissão <code className="text-xs">ads_read</code>. Depois clique em
          “Sincronizar agora”.
        </Vazio>

      ) : !data || data.linhas === 0 ? (
        <Vazio icone={Info} titulo="Sem veiculação no período">
          A conta está conectada, mas não há gasto registrado entre as datas selecionadas.
          Experimente um período maior ou rode a sincronização.
        </Vazio>

      ) : (
        <>
          {/* ── Indicadores ── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Indicador icone={Wallet} titulo="Investimento" valor={fmtMoeda(t!.spend, moeda)}
              apoio={`${fmtNum(t!.impressions)} impressões`} />
            <Indicador icone={ShoppingBag} titulo="Vendas (Meta)" valor={fmtMoeda(t!.valor, moeda)}
              apoio={`${fmtNum(t!.compras)} compras atribuídas`} />
            <Indicador icone={TrendingUp} titulo="ROAS (Meta)" valor={fmtRoas(t!.roas)}
              apoio="retorno sobre o investido" destaque />
            <Indicador icone={Target} titulo="CPA" valor={fmtMoeda(t!.cpa, moeda)}
              apoio="custo por compra" />
            <Indicador icone={Eye} titulo="CPM" valor={fmtMoeda(t!.cpm, moeda)}
              apoio="custo por mil impressões" />
            <Indicador icone={MousePointerClick} titulo="CTR" valor={fmtPct(t!.ctr)}
              apoio={`${fmtNum(t!.link_clicks)} cliques no link`} />
          </div>

          {/* ── Curva do período ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Investimento × retorno por dia</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.serie} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis dataKey="dia" tickFormatter={(d: string) => d.slice(8) + "/" + d.slice(5, 7)}
                    fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => v.toLocaleString("pt-BR", { notation: "compact" })} />
                  <Tooltip
                    labelFormatter={(d) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR")}
                    formatter={(v: number, nome: string) => [fmtMoeda(v, moeda), nome]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="spend" name="Investimento" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="valor" name="Vendas (Meta)"
                    stroke="#10b981" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Drilldown ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Campanhas</CardTitle>
              <p className="text-xs text-muted-foreground">
                Clique para abrir conjunto e anúncio. Ordenado por investimento.
              </p>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Campanha / conjunto / anúncio</th>
                      <th className="px-3 py-2 text-right font-medium">Investido</th>
                      <th className="px-3 py-2 text-right font-medium">Impressões</th>
                      <th className="px-3 py-2 text-right font-medium">CTR</th>
                      <th className="px-3 py-2 text-right font-medium">CPC</th>
                      <th className="px-3 py-2 text-right font-medium">Compras</th>
                      <th className="px-3 py-2 text-right font-medium">CPA</th>
                      <th className="px-3 py-2 text-right font-medium">Vendas</th>
                      <th className="px-3 py-2 text-right font-medium">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.arvore.map((no) => (
                      <LinhaNo key={no.id} no={no} nivel={0} moeda={moeda}
                        aberto={aberto} alternar={alternar} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-medium">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(t!.spend, moeda)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(t!.impressions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(t!.ctr)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(t!.cpc, moeda)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(t!.compras)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(t!.cpa, moeda)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(t!.valor, moeda)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtRoas(t!.roas)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ── O aviso que não pode sair enquanto não houver atribuição própria ── */}
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              <span className="font-medium text-foreground">“Vendas” e “ROAS” são a atribuição da própria Meta</span>{" "}
              (7 dias de clique / 1 dia de visualização) — não o faturamento do CarboHub. Ela não
              enxerga cancelamento, devolução nem margem de SKU, e credita a si mesma vendas que
              fecharam por outro caminho. Use como leitura de mídia, não como resultado do negócio.
              {data.atualizadoEm && (
                <> Última atualização: {new Date(data.atualizadoEm).toLocaleString("pt-BR")}.</>
              )}
            </p>
          </div>
        </>
      )}
    </main>
  );
}
