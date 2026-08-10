import { useEffect, useMemo, useState } from "react";
import { MapContainer, GeoJSON, useMap } from "react-leaflet";
import type { Layer, LeafletMouseEvent, PathOptions } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, MapPin, Sparkles, Store, Building2, ShoppingCart, AlertTriangle, Grid3x3, Map as MapIcon } from "lucide-react";
import {
  useCidadesConquistadas, useMunicipiosIBGE, useMalha,
  UF_POR_CODIGO, type CidadeConquistada, type FiltroPresenca, type Granularidade,
} from "@/hooks/useMapaConquista";

/**
 * Mapa da conquista — onde a Carbo já chegou.
 *
 * Duas visões: o Brasil por estado e, ao clicar num estado, ele aberto por
 * município. Município aceso = tem presença (venda, PDV ou licenciado); apagado
 * = ainda não. Uma cor só, de propósito: o painel responde "chegamos ou não",
 * não "quanto vendemos" — para isso já existe o Dashboard Comercial.
 *
 * ── Onde cada peça mora ───────────────────────────────────────────────────
 *
 *   o que é presença  → view `public.mapa_conquista` (SQL)
 *   qual é o desenho  → malhas do IBGE
 *   quantos municípios existem → lista de localidades do IBGE
 *
 * A tela só cruza os três. Regra nova de presença entra na VIEW, não aqui.
 *
 * ⚠️ O casamento é por NOME normalizado (`carbo_normaliza_cidade` no banco,
 * `normalizaCidade` no hook — as duas precisam concordar). Nome que não casa
 * não some calado: aparece no rodapé "não localizadas no IBGE". Cidade que
 * simplesmente não aparecesse no mapa seria um buraco invisível, e esse é
 * exatamente o tipo de erro que ninguém encontra.
 */

const VERDE = "#22c55e";
const VERDE_FORTE = "#16a34a";
const AMBAR = "#f59e0b";       // conquista dentro do período escolhido
const APAGADO = "#1f2937";
const BORDA = "#334155";

/* ── O período do "conquistado agora" ─────────────────────────────────────
 *
 * A view expõe `conquista_recente` com uma janela FIXA de 30 dias, e o painel
 * ao lado se chamava "Conquistas do mês" — duas coisas diferentes com o mesmo
 * rótulo. Em 10 de agosto, "últimos 30 dias" inclui julho inteiro; quem lê
 * "do mês" entende agosto. Os dois números nunca iam bater e ninguém saberia
 * qual estava certo.
 *
 * A decisão sai da view e vem para cá porque a view não pode ter opinião sobre
 * um período que o usuário escolhe. Ela continua entregando `primeira_venda`,
 * que é o FATO; o recorte é leitura, e leitura é da tela.
 *
 * ⚠️ `conquista_recente` continua existindo na view e NÃO é mais usado por esta
 * tela — quem depender dele em outro lugar segue com os 30 dias fixos, que é o
 * contrato antigo e não foi quebrado.
 */
const PERIODOS: Array<{ id: string; label: string; inicio: () => Date }> = [
  { id: "mes",  label: "Este mês",       inicio: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); } },
  { id: "30d",  label: "Últimos 30 dias", inicio: () => { const d = new Date(); d.setDate(d.getDate() - 30); return d; } },
  { id: "90d",  label: "Últimos 90 dias", inicio: () => { const d = new Date(); d.setDate(d.getDate() - 90); return d; } },
  { id: "ano",  label: "Este ano",        inicio: () => new Date(new Date().getFullYear(), 0, 1) },
];

/** "10/08" — dia e mês, na ordem que se lê no Brasil.
 *
 *  ⚠️ Antes era `primeira_venda.slice(5)` sobre um `YYYY-MM-DD`, o que devolve
 *  `MM-DD` e mostrava "08-10" para 10 de agosto. Num painel que lista dias
 *  seguidos do mesmo mês, ninguém percebe a troca — só quem cruzar com outra
 *  tela, e aí já virou desconfiança do número. */
const diaMes = (iso: string | null): string => {
  if (!iso || iso.length < 10) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};

const FILTROS: Array<{ id: FiltroPresenca; label: string; icon: React.ReactNode }> = [
  { id: "todos",      label: "Toda presença", icon: <MapPin className="h-4 w-4" /> },
  { id: "venda",      label: "Com venda",     icon: <ShoppingCart className="h-4 w-4" /> },
  { id: "pdv",        label: "Com PDV",       icon: <Store className="h-4 w-4" /> },
  { id: "licenciado", label: "Licenciados",   icon: <Building2 className="h-4 w-4" /> },
];

function atendeFiltro(c: CidadeConquistada, f: FiltroPresenca): boolean {
  if (f === "venda") return c.tem_venda;
  if (f === "pdv") return c.tem_pdv;
  if (f === "licenciado") return c.tem_licenciado;
  return true;
}

const fmtBRLCompacto = (v: number) =>
  v >= 1000
    ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
    : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

/** Enquadra o mapa no que está desenhado. Sem isso o drill-down abre o estado
 *  com o zoom do Brasil e a pessoa acha que a tela travou. */
function Enquadrar({ geo }: { geo: unknown }) {
  const map = useMap();
  useEffect(() => {
    if (!geo) return;
    try {
      const b = L.geoJSON(geo as never).getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [16, 16] });
    } catch {
      /* malha malformada não pode derrubar a tela */
    }
  }, [geo, map]);
  return null;
}

export default function MapaConquista() {
  const [uf, setUf] = useState<string | null>(null);
  const [granularidade, setGranularidade] = useState<Granularidade>("estado");
  const [filtro, setFiltro] = useState<FiltroPresenca>("todos");
  const [periodo, setPeriodo] = useState("mes");

  const infoPeriodo = PERIODOS.find((p) => p.id === periodo) ?? PERIODOS[0];
  // Comparação em string ISO: `primeira_venda` é 'YYYY-MM-DD', e nesse formato
  // a ordem lexical É a cronológica. Converter para Date daria fuso de brinde.
  const inicioISO = useMemo(() => {
    const d = infoPeriodo.inicio();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [infoPeriodo]);

  const ehRecente = (c: CidadeConquistada): boolean =>
    Boolean(c.primeira_venda) && c.primeira_venda! >= inicioISO;

  const cidades = useCidadesConquistadas();
  const municipios = useMunicipiosIBGE();
  const malha = useMalha(uf, granularidade);

  // Dentro de um estado o desenho é sempre municipal — a granularidade só
  // escolhe como o BRASIL é fatiado. Ter as duas noções numa variável só
  // deixava o código perguntando "estou no Brasil?" em cinco lugares.
  const porMunicipio = uf !== null || granularidade === "municipio";

  const carregando = cidades.isLoading || municipios.isLoading || malha.isLoading;
  const erro = cidades.isError || municipios.isError || malha.isError;

  /** O cruzamento: nome normalizado + UF → código IBGE. */
  const cruzamento = useMemo(() => {
    const lista = (cidades.data ?? []).filter((c) => atendeFiltro(c, filtro));
    const porCodigo = new Map<number, CidadeConquistada>();
    const naoLocalizadas: CidadeConquistada[] = [];
    const totalPorUf = new Map<string, number>();

    const indice = new Map<string, number>();
    // A malha do IBGE só traz `codarea`. O nome vem daqui.
    const nomePorCodigo = new Map<number, string>();
    for (const m of municipios.data ?? []) {
      indice.set(`${m.nomeNorm}|${m.uf}`, m.id);
      nomePorCodigo.set(m.id, m.nome);
      totalPorUf.set(m.uf, (totalPorUf.get(m.uf) ?? 0) + 1);
    }

    for (const c of lista) {
      const id = indice.get(`${c.cidade}|${c.uf}`);
      if (id) porCodigo.set(id, c);
      else naoLocalizadas.push(c);
    }

    // Cobertura por estado: quantas das cidades do estado já acenderam.
    const conquistadasPorUf = new Map<string, number>();
    for (const c of lista) conquistadasPorUf.set(c.uf, (conquistadasPorUf.get(c.uf) ?? 0) + 1);

    return { lista, porCodigo, naoLocalizadas, totalPorUf, conquistadasPorUf, nomePorCodigo };
  }, [cidades.data, municipios.data, filtro]);

  const placar = useMemo(() => {
    const l = cruzamento.lista;
    return {
      cidades: l.length,
      estados: new Set(l.map((c) => c.uf)).size,
      novas: l.filter(ehRecente).length,
      pedidos: l.reduce((s, c) => s + (c.pedidos ?? 0), 0),
      valor: l.reduce((s, c) => s + Number(c.valor ?? 0), 0),
      municipiosBR: municipios.data?.length ?? 0,
    };
  }, [cruzamento, municipios.data]);

  /** Pintura de uma feature da malha. No Brasil a feature é um ESTADO (codarea
   *  de 2 dígitos); dentro de um estado é um MUNICÍPIO (7 dígitos). */
  const estilo = (feature: any): PathOptions => {
    const cod = String(feature?.properties?.codarea ?? "");
    // Traço fino no Brasil por município: 5.570 contornos de 1px viram uma
    // malha cinza que come a cor do preenchimento.
    const traco = !uf && granularidade === "municipio" ? 0.3 : 1;
    const base: PathOptions = { color: BORDA, weight: traco, fillOpacity: 0.85 };

    if (!porMunicipio) {
      const sigla = UF_POR_CODIGO[cod];
      const total = cruzamento.totalPorUf.get(sigla) ?? 0;
      const feitas = cruzamento.conquistadasPorUf.get(sigla) ?? 0;
      if (!feitas) return { ...base, fillColor: APAGADO };
      // Uma cor só; a intensidade é o quanto do estado já foi tomado.
      const razao = total ? Math.min(1, feitas / total) : 0;
      return { ...base, fillColor: VERDE, fillOpacity: 0.25 + razao * 0.7 };
    }

    const c = cruzamento.porCodigo.get(Number(cod));
    if (!c) return { ...base, fillColor: APAGADO, fillOpacity: 0.55 };
    if (ehRecente(c)) return { ...base, fillColor: AMBAR, color: "#fbbf24", weight: Math.max(traco, 2) };
    return { ...base, fillColor: VERDE_FORTE };
  };

  const aoCriarFeature = (feature: any, layer: Layer) => {
    const cod = String(feature?.properties?.codarea ?? "");

    if (!porMunicipio) {
      const sigla = UF_POR_CODIGO[cod];
      const total = cruzamento.totalPorUf.get(sigla) ?? 0;
      const feitas = cruzamento.conquistadasPorUf.get(sigla) ?? 0;
      layer.bindTooltip(
        `<b>${sigla ?? cod}</b><br/>${feitas} de ${total} municípios`,
        { sticky: true },
      );
      layer.on("click", () => sigla && setUf(sigla));
      return;
    }

    const c = cruzamento.porCodigo.get(Number(cod));
    const nome = cruzamento.nomePorCodigo.get(Number(cod))
      ?? String(feature?.properties?.nome ?? cod);

    // Brasil por município: clicar em qualquer um abre o estado dele. O código
    // do IBGE começa com o da UF (3550308 → 35 → SP), então não preciso do
    // cadastro para descobrir para onde ir.
    if (!uf) {
      const sigla = UF_POR_CODIGO[cod.slice(0, 2)];
      if (sigla) layer.on("click", () => setUf(sigla));
    }

    if (!c) {
      // No Brasil por município são ~5.400 polígonos apagados. Pendurar um
      // tooltip em cada um custa memória e travamento no pan sem dizer nada
      // além de "ainda não" — dentro de um estado, onde o número é pequeno,
      // saber o nome do que falta é justamente o que interessa.
      if (!uf) return;
      layer.bindTooltip(`<b>${nome}</b><br/>ainda não`, { sticky: true });
      return;
    }
    const partes = [
      c.tem_venda ? `${c.pedidos} pedido${c.pedidos === 1 ? "" : "s"} · ${fmtBRLCompacto(Number(c.valor))}` : null,
      c.tem_pdv ? `${c.pdvs} PDV${c.pdvs === 1 ? "" : "s"}` : null,
      c.tem_licenciado ? `${c.licenciados} licenciado${c.licenciados === 1 ? "" : "s"}` : null,
      ehRecente(c) ? `🆕 conquista — ${infoPeriodo.label.toLowerCase()}` : null,
    ].filter(Boolean);
    layer.bindTooltip(`<b>${nome}</b><br/>${partes.join("<br/>")}`, { sticky: true });
    layer.on("mouseover", (e: LeafletMouseEvent) => (e.target as any).setStyle?.({ weight: 3 }));
    layer.on("mouseout", (e: LeafletMouseEvent) => (e.target as any).setStyle?.({ weight: ehRecente(c) ? 2 : 1 }));
  };

  const recentes = useMemo(
    () => cruzamento.lista
      .filter(ehRecente)
      .sort((a, b) => String(b.primeira_venda).localeCompare(String(a.primeira_venda)))
      .slice(0, 12),
    [cruzamento.lista],
  );

  const rankingUf = useMemo(
    () => Array.from(cruzamento.conquistadasPorUf.entries())
      .map(([sigla, feitas]) => ({ uf: sigla, feitas, total: cruzamento.totalPorUf.get(sigla) ?? 0 }))
      .sort((a, b) => b.feitas - a.feitas),
    [cruzamento],
  );

  return (
    /* `h-full min-h-0 flex-col`: a altura vem do <main>, que já é
       `flex-1 overflow-y-auto` dentro de um `h-screen overflow-hidden`.
       ⚠️ NÃO usar `calc(100vh - X)` aqui — a Esteira já pagou essa: o número
       presume a altura exata do cabeçalho e quebra assim que uma linha nova
       entra (foi o que aconteceu agora, com o seletor de período). Todo
       ancestral do que rola precisa de `min-h-0`, senão o `flex-1` para de
       encolher e o conteúdo estoura para fora da tela. */
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-emerald-500" />
            Mapa da conquista
          </h1>
          <p className="text-sm text-muted-foreground">
            Cada município aceso é um lugar onde a Carbo já chegou — venda, PDV ou licenciado.
          </p>
        </div>
        {uf && (
          <Button variant="outline" size="sm" onClick={() => setUf(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Ver o Brasil
          </Button>
        )}
      </div>

      {/* Placar */}
      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-5">
        <Placar titulo="Cidades" valor={placar.cidades.toLocaleString("pt-BR")}
          rodape={placar.municipiosBR ? `de ${placar.municipiosBR.toLocaleString("pt-BR")} no Brasil` : "—"} />
        <Placar titulo="Estados" valor={`${placar.estados}`} rodape="de 27" />
        <Placar titulo={`Novas · ${infoPeriodo.label.toLowerCase()}`} valor={`+${placar.novas}`} rodape="primeira compra no período" destaque />
        <Placar titulo="Pedidos" valor={placar.pedidos.toLocaleString("pt-BR")} rodape="nas cidades exibidas" />
        <Placar titulo="Faturamento" valor={fmtBRLCompacto(placar.valor)} rodape="nas cidades exibidas" />
      </div>

      {/* Filtro de presença + período + granularidade do Brasil */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Button key={f.id} size="sm" variant={filtro === f.id ? "default" : "outline"}
            onClick={() => setFiltro(f.id)} className="gap-1.5">
            {f.icon}{f.label}
          </Button>
        ))}

        {/* O período manda em TRÊS lugares ao mesmo tempo: o âmbar no mapa, o
            placar de novas e a lista lateral. Um seletor que mudasse só a lista
            deixaria o mapa contando outra coisa — que era exatamente o problema
            de "30 dias" pintando o mapa enquanto o painel dizia "do mês". */}
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODOS.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Só faz sentido no Brasil: dentro de um estado já é sempre município. */}
        {!uf && (
          <div className="flex items-center gap-1 ml-auto rounded-md border p-0.5">
            <Button size="sm" variant={granularidade === "estado" ? "secondary" : "ghost"}
              onClick={() => setGranularidade("estado")} className="gap-1.5 h-7">
              <MapIcon className="h-4 w-4" /> Por estado
            </Button>
            <Button size="sm" variant={granularidade === "municipio" ? "secondary" : "ghost"}
              onClick={() => setGranularidade("municipio")} className="gap-1.5 h-7">
              <Grid3x3 className="h-4 w-4" /> Por município
            </Button>
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="flex min-h-0 flex-col overflow-hidden lg:col-span-3">
          {/* ⚠️ ALTURA POR FLEX, não por `calc(100vh - 300px)`.
              O número fixo era chute: qualquer linha nova no cabeçalho (o
              seletor de período, por exemplo) roubava altura do mapa sem que
              ninguém percebesse, e o `fitBounds` — que enquadra pela dimensão
              mais apertada — encolhia o Brasil junto. Era por isso que o mapa
              parecia "longe demais": não era o zoom, era a caixa.
              Com `flex-1` + `min-h-0`, o mapa fica com tudo que sobrar e volta
              a crescer sozinho quando algo sai do cabeçalho. */}
          <CardContent className="relative min-h-0 flex-1 p-0">
            {carregando && (
              <div className="absolute inset-0 z-[500] flex items-center justify-center bg-background/70">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {erro && !carregando && (
              <div className="absolute inset-0 z-[500] flex items-center justify-center text-sm text-muted-foreground">
                Não consegui carregar o mapa (IBGE ou banco fora do ar).
              </div>
            )}
            <MapContainer
              center={[-14.8, -52.5]}
              zoom={4}
              minZoom={3}
              scrollWheelZoom
              attributionControl={false}
              // Canvas em vez de SVG: o Brasil por município são 5.570
              // polígonos, e um <path> no DOM para cada um trava o pan e o
              // zoom. No canvas eles são um desenho só.
              preferCanvas
              style={{ height: "100%", width: "100%", background: "#0b1220" }}
            >
              {malha.data && (
                <>
                  {/* A key força o redesenho: o GeoJSON do react-leaflet não
                      reage a troca de `data` nem de `style` sozinho. */}
                  <GeoJSON
                    key={`${uf ?? `BR-${granularidade}`}-${filtro}-${cruzamento.porCodigo.size}`}
                    data={malha.data as never}
                    style={estilo as never}
                    onEachFeature={aoCriarFeature}
                  />
                  <Enquadrar geo={malha.data} />
                </>
              )}
            </MapContainer>

            {/* Legenda */}
            <div className="absolute bottom-3 left-3 z-[500] max-w-[15rem] rounded-md bg-background/90 border px-3 py-2 text-xs space-y-1">
              <div className="flex items-start gap-2">
                <span className="inline-block h-3 w-3 mt-0.5 shrink-0 rounded-sm" style={{ background: VERDE_FORTE }} />
                {porMunicipio ? "Município conquistado" : "Estado com presença (mais forte = mais cidades)"}
              </div>
              {porMunicipio && (
                <div className="flex items-start gap-2">
                  <span className="inline-block h-3 w-3 mt-0.5 shrink-0 rounded-sm" style={{ background: AMBAR }} />
                  Conquistado — {infoPeriodo.label.toLowerCase()}
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="inline-block h-3 w-3 mt-0.5 shrink-0 rounded-sm border" style={{ background: APAGADO }} />
                Ainda não
              </div>
              <div className="text-muted-foreground pt-1">
                {uf ? "Passe o mouse para ver a cidade." : "Clique para abrir o estado."}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="min-h-0 space-y-4 overflow-y-auto lg:max-h-full">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                <Sparkles className="h-4 w-4 text-amber-500" /> Conquistas · {infoPeriodo.label.toLowerCase()}
              </div>
              {recentes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma cidade nova em {infoPeriodo.label.toLowerCase()}.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {recentes.map((c) => (
                    <div key={`${c.cidade}-${c.uf}`} className="flex items-center justify-between text-xs">
                      <span className="truncate">{c.cidade}<span className="text-muted-foreground">/{c.uf}</span></span>
                      <Badge variant="outline" className="ml-2 shrink-0">{diaMes(c.primeira_venda)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold mb-2">Cidades por estado</div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {rankingUf.map((r) => (
                  <button key={r.uf} onClick={() => setUf(r.uf)}
                    className={`w-full flex items-center justify-between text-xs rounded px-2 py-1 hover:bg-muted ${uf === r.uf ? "bg-muted" : ""}`}>
                    <span className="font-medium">{r.uf}</span>
                    <span className="text-muted-foreground">
                      {r.feitas}{r.total ? ` / ${r.total}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Nada some calado: cidade que não casou com o IBGE aparece aqui. */}
      {cruzamento.naoLocalizadas.length > 0 && (
        <Card className="border-amber-500/40">
          <CardContent className="p-4">
            <div className="text-sm font-semibold flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {cruzamento.naoLocalizadas.length} cidade(s) não localizada(s) na lista do IBGE
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Elas contam no placar, mas não têm onde ser pintadas: é o comprador escrevendo
              bairro, abreviação ou forma curta no endereço do marketplace. Não adianta corrigir
              o pedido — o próximo chega igual. Uma linha em <code>carbo_cidade_alias</code>{" "}
              (nome como chega, UF, nome do IBGE) acende o município e vale daí em diante.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {cruzamento.naoLocalizadas.slice(0, 40).map((c) => (
                <Badge key={`${c.cidade}-${c.uf}`} variant="outline" className="text-xs">
                  {c.cidade}/{c.uf}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Placar({ titulo, valor, rodape, destaque }: {
  titulo: string; valor: string; rodape: string; destaque?: boolean;
}) {
  return (
    <Card className={destaque ? "border-amber-500/50" : undefined}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{titulo}</div>
        <div className={`text-2xl font-bold ${destaque ? "text-amber-500" : ""}`}>{valor}</div>
        <div className="text-[11px] text-muted-foreground">{rodape}</div>
      </CardContent>
    </Card>
  );
}
