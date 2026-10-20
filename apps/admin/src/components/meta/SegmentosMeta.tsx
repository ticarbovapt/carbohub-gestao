import { createContext, useContext, useMemo, useState } from "react";
import { ImageOff, Users, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  derivar, fmtMoeda, fmtNum, fmtPct, fmtRoas,
  type Brutos, type MetaCriativo, type MetaSegmento, type MetaSegmentos,
} from "@/hooks/useMetaAds";

// ─────────────────────────────────────────────────────────────────────────────
// O criativo de cada anúncio e "quem compra, onde" (20261115).
//
// ⚠️ A miniatura vem da Meta com URL ASSINADA que vence em dias; o sync a relê
// 3×/dia. Imagem que não abre vira ícone, nunca um quadrado quebrado.
// ⚠️ A Meta MODELA parte das compras por segmento (iOS, consentimento): a soma
// dos segmentos não fecha com o total, e a seção diz isso.
// ─────────────────────────────────────────────────────────────────────────────

// ── Miniatura ────────────────────────────────────────────────────────────────

const CriativosCtx = createContext<Map<string, MetaCriativo>>(new Map());
export const CriativosProvider = CriativosCtx.Provider;

const STATUS: Record<string, string> = {
  ACTIVE: "ativo", PAUSED: "pausado", CAMPAIGN_PAUSED: "campanha pausada",
  ADSET_PAUSED: "conjunto pausado", ARCHIVED: "arquivado", DELETED: "excluído",
  DISAPPROVED: "reprovado", PENDING_REVIEW: "em revisão", WITH_ISSUES: "com problema",
  IN_PROCESS: "processando",
};

export function Miniatura({ adId, tamanho = 44 }: { adId: string; tamanho?: number }) {
  const c = useContext(CriativosCtx).get(adId);
  const [falhou, setFalhou] = useState(false);
  const src = c?.thumbnail_url ?? c?.image_url ?? null;
  const caixa = { width: tamanho, height: tamanho };
  if (!src || falhou) {
    return (
      <span style={caixa} className="flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <ImageOff className="h-4 w-4" />
      </span>
    );
  }
  return (
    <a href={c?.image_url ?? src} target="_blank" rel="noreferrer" className="shrink-0" title={c?.titulo ?? c?.texto ?? "Abrir o criativo"}>
      <img src={src} alt="" loading="lazy" style={caixa} onError={() => setFalhou(true)}
        className="rounded-md object-cover ring-1 ring-border" />
    </a>
  );
}

/** "pausado", "ativo"… — só quando o status é conhecido. */
export function StatusDoAnuncio({ adId }: { adId: string }) {
  const s = useContext(CriativosCtx).get(adId)?.status;
  if (!s) return null;
  const ativo = s === "ACTIVE";
  return (
    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
      ativo ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
      {STATUS[s] ?? s.toLowerCase()}
    </span>
  );
}

// ── Rótulos dos segmentos ────────────────────────────────────────────────────

const PLATAFORMA: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network",
  messenger: "Messenger", threads: "Threads", whatsapp: "WhatsApp",
};
const POSICAO: Record<string, string> = {
  feed: "Feed", story: "Stories", instagram_stories: "Stories", facebook_stories: "Stories",
  reels: "Reels", instagram_reels: "Reels", facebook_reels: "Reels", facebook_reels_overlay: "Reels (sobreposição)",
  instagram_explore: "Explorar", instagram_explore_grid_home: "Explorar (grade)", instagram_explore_reels: "Explorar (Reels)",
  instagram_profile_feed: "Feed do perfil", profile_feed: "Feed do perfil", instagram_search: "Busca",
  marketplace: "Marketplace", video_feeds: "Feed de vídeos", right_hand_column: "Coluna da direita",
  search: "Busca", instream_video: "Vídeo in-stream", an_classic: "Rede de público",
  rewarded_video: "Vídeo com recompensa", messenger_inbox: "Caixa de entrada", notification: "Notificações",
  threads_feed: "Feed",
};
const GENERO: Record<string, string> = { female: "Mulheres", male: "Homens", unknown: "Não informado" };
const bonito = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function somar(linhas: MetaSegmento[]): Brutos {
  return linhas.reduce<Brutos>((a, l) => ({
    spend: a.spend + l.spend, impressions: a.impressions + l.impressions,
    link_clicks: a.link_clicks + l.link_clicks, compras: a.compras + l.compras, valor: a.valor + l.valor,
  }), { spend: 0, impressions: 0, link_clicks: 0, compras: 0, valor: 0 });
}

function agruparPor(linhas: MetaSegmento[], chave: (l: MetaSegmento) => string) {
  const m = new Map<string, MetaSegmento[]>();
  for (const l of linhas) {
    const k = chave(l);
    m.set(k, [...(m.get(k) ?? []), l]);
  }
  return [...m.entries()].map(([rotulo, ls]) => ({ rotulo, b: somar(ls), linhas: ls }));
}

// ── A tabela comum às três abas ──────────────────────────────────────────────

function Tabela({ linhas, moeda, extra }: {
  linhas: Array<{ rotulo: string; b: Brutos; nota?: string }>;
  moeda: string;
  extra?: { titulo: string; valor: (l: { rotulo: string; b: Brutos }) => React.ReactNode };
}) {
  const max = Math.max(...linhas.map((l) => l.b.spend), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Segmento</th>
            <th className="px-3 py-2 text-left font-medium">Investido</th>
            <th className="px-3 py-2 text-right font-medium">CTR</th>
            <th className="px-3 py-2 text-right font-medium">Compras</th>
            <th className="px-3 py-2 text-right font-medium">CPA</th>
            <th className="px-3 py-2 text-right font-medium">ROAS</th>
            {extra && <th className="px-3 py-2 text-right font-medium">{extra.titulo}</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const d = derivar(l.b);
            return (
              <tr key={l.rotulo} className="border-t">
                <td className="px-3 py-2">
                  <span className="font-medium">{l.rotulo}</span>
                  {l.nota && <span className="block text-[11px] text-muted-foreground">{l.nota}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 shrink-0 overflow-hidden rounded bg-muted">
                      <div className="h-full rounded bg-rose-500/80" style={{ width: `${(l.b.spend / max) * 100}%` }} />
                    </div>
                    <span className="tabular-nums">{fmtMoeda(l.b.spend, moeda)}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(d.ctr)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.b.compras)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(d.cpa, moeda)}</td>
                <td className="px-3 py-2 text-right">
                  <span className={cn("tabular-nums font-medium",
                    d.roas != null && (d.roas >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"))}>
                    {fmtRoas(d.roas)}
                  </span>
                </td>
                {extra && <td className="px-3 py-2 text-right text-xs tabular-nums">{extra.valor(l)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── A seção ──────────────────────────────────────────────────────────────────

const ORDEM_IDADE = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

export function Segmentos({ segmentos, moeda }: { segmentos: MetaSegmentos; moeda: string }) {
  const [todasRegioes, setTodasRegioes] = useState(false);

  const idade = useMemo(() => {
    const ls = segmentos.idade_genero ?? [];
    const pos = (r: string) => { const i = ORDEM_IDADE.indexOf(r); return i < 0 ? 99 : i; };
    return agruparPor(ls, (l) => l.chave1).sort((a, b) => pos(a.rotulo) - pos(b.rotulo));
  }, [segmentos]);
  const genero = useMemo(() => agruparPor(segmentos.idade_genero ?? [], (l) => GENERO[l.chave2] ?? bonito(l.chave2))
    .sort((a, b) => b.b.spend - a.b.spend), [segmentos]);
  const posicao = useMemo(() => agruparPor(segmentos.posicionamento ?? [],
    (l) => `${PLATAFORMA[l.chave1] ?? bonito(l.chave1)} · ${POSICAO[l.chave2] ?? bonito(l.chave2)}`)
    .sort((a, b) => b.b.spend - a.b.spend), [segmentos]);
  const plataforma = useMemo(() => agruparPor(segmentos.posicionamento ?? [], (l) => PLATAFORMA[l.chave1] ?? bonito(l.chave1))
    .sort((a, b) => b.b.spend - a.b.spend), [segmentos]);
  const regiao = useMemo(() => agruparPor(segmentos.regiao ?? [], (l) => l.chave1.replace(/\s*\(state\)\s*$/i, ""))
    .sort((a, b) => b.b.spend - a.b.spend), [segmentos]);

  const vazio = !idade.length && !posicao.length && !regiao.length;

  // Mulheres × homens dentro de cada faixa: o ROAS dos dois lado a lado.
  const roasPorGenero = (faixa: string) => {
    const ls = (segmentos.idade_genero ?? []).filter((l) => l.chave1 === faixa);
    const r = (g: string) => derivar(somar(ls.filter((l) => l.chave2 === g))).roas;
    return <>M {fmtRoas(r("female"))} · H {fmtRoas(r("male"))}</>;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Quem compra, e onde
        </CardTitle>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A Meta estima parte das compras por segmento (iOS e consentimento de cookies), então a soma dos
          segmentos pode não fechar com o total da página. Use para comparar segmentos entre si.
        </p>
      </CardHeader>
      <CardContent>
        {vazio ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ainda sem dado por segmento — ele chega na próxima leitura da Meta.
          </p>
        ) : (
          <Tabs defaultValue="idade">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="idade">Idade e gênero</TabsTrigger>
              <TabsTrigger value="posicao">Posicionamento</TabsTrigger>
              <TabsTrigger value="regiao">Região</TabsTrigger>
            </TabsList>

            <TabsContent value="idade" className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {genero.map((g) => {
                  const d = derivar(g.b);
                  return (
                    <div key={g.rotulo} className="rounded-lg border px-3 py-2">
                      <p className="text-xs text-muted-foreground">{g.rotulo}</p>
                      <p className="text-lg font-bold tabular-nums">{fmtRoas(d.roas)} <span className="text-xs font-normal text-muted-foreground">ROAS</span></p>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        {fmtMoeda(g.b.spend, moeda)} · {fmtNum(g.b.compras)} compra(s) · CPA {fmtMoeda(d.cpa, moeda)}
                      </p>
                    </div>
                  );
                })}
              </div>
              <Tabela linhas={idade} moeda={moeda}
                extra={{ titulo: "ROAS mulheres · homens", valor: (l) => roasPorGenero(l.rotulo) }} />
            </TabsContent>

            <TabsContent value="posicao" className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {plataforma.slice(0, 3).map((p) => {
                  const d = derivar(p.b);
                  return (
                    <div key={p.rotulo} className="rounded-lg border px-3 py-2">
                      <p className="text-xs text-muted-foreground">{p.rotulo}</p>
                      <p className="text-lg font-bold tabular-nums">{fmtRoas(d.roas)} <span className="text-xs font-normal text-muted-foreground">ROAS</span></p>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        {fmtMoeda(p.b.spend, moeda)} · {fmtNum(p.b.compras)} compra(s) · CPA {fmtMoeda(d.cpa, moeda)}
                      </p>
                    </div>
                  );
                })}
              </div>
              <Tabela linhas={posicao} moeda={moeda} />
            </TabsContent>

            <TabsContent value="regiao" className="space-y-3">
              <Tabela linhas={todasRegioes ? regiao : regiao.slice(0, 12)} moeda={moeda} />
              {regiao.length > 12 && (
                <Button variant="ghost" size="sm" onClick={() => setTodasRegioes((v) => !v)}>
                  {todasRegioes ? "Mostrar só as 12 principais" : `Mostrar as ${regiao.length} regiões`}
                </Button>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
