import { useEffect, useMemo, useState } from "react";
import { MapContainer, GeoJSON, useMap } from "react-leaflet";
import type { Layer, LeafletMouseEvent, PathOptions } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, MapPin, Sparkles, Store, Building2, ShoppingCart, AlertTriangle } from "lucide-react";
import {
  useCidadesConquistadas, useMunicipiosIBGE, useMalha,
  UF_POR_CODIGO, type CidadeConquistada, type FiltroPresenca,
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
const AMBAR = "#f59e0b";       // conquista dos últimos 30 dias
const APAGADO = "#1f2937";
const BORDA = "#334155";

const ALTURA = "calc(100vh - 300px)";

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
  const [filtro, setFiltro] = useState<FiltroPresenca>("todos");

  const cidades = useCidadesConquistadas();
  const municipios = useMunicipiosIBGE();
  const malha = useMalha(uf);

  const carregando = cidades.isLoading || municipios.isLoading || malha.isLoading;
  const erro = cidades.isError || municipios.isError || malha.isError;

  /** O cruzamento: nome normalizado + UF → código IBGE. */
  const cruzamento = useMemo(() => {
    const lista = (cidades.data ?? []).filter((c) => atendeFiltro(c, filtro));
    const porCodigo = new Map<number, CidadeConquistada>();
    const naoLocalizadas: CidadeConquistada[] = [];
    const totalPorUf = new Map<string, number>();

    const indice = new Map<string, number>();
    for (const m of municipios.data ?? []) {
      indice.set(`${m.nomeNorm}|${m.uf}`, m.id);
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

    return { lista, porCodigo, naoLocalizadas, totalPorUf, conquistadasPorUf };
  }, [cidades.data, municipios.data, filtro]);

  const placar = useMemo(() => {
    const l = cruzamento.lista;
    return {
      cidades: l.length,
      estados: new Set(l.map((c) => c.uf)).size,
      novas: l.filter((c) => c.conquista_recente).length,
      pedidos: l.reduce((s, c) => s + (c.pedidos ?? 0), 0),
      valor: l.reduce((s, c) => s + Number(c.valor ?? 0), 0),
      municipiosBR: municipios.data?.length ?? 0,
    };
  }, [cruzamento, municipios.data]);

  /** Pintura de uma feature da malha. No Brasil a feature é um ESTADO (codarea
   *  de 2 dígitos); dentro de um estado é um MUNICÍPIO (7 dígitos). */
  const estilo = (feature: any): PathOptions => {
    const cod = String(feature?.properties?.codarea ?? "");
    const base: PathOptions = { color: BORDA, weight: 1, fillOpacity: 0.85 };

    if (!uf) {
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
    if (c.conquista_recente) return { ...base, fillColor: AMBAR, color: "#fbbf24", weight: 2 };
    return { ...base, fillColor: VERDE_FORTE };
  };

  const aoCriarFeature = (feature: any, layer: Layer) => {
    const cod = String(feature?.properties?.codarea ?? "");

    if (!uf) {
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
    const nome = String(feature?.properties?.nome ?? cod);
    if (!c) {
      layer.bindTooltip(`<b>${nome}</b><br/>ainda não`, { sticky: true });
      return;
    }
    const partes = [
      c.tem_venda ? `${c.pedidos} pedido${c.pedidos === 1 ? "" : "s"} · ${fmtBRLCompacto(Number(c.valor))}` : null,
      c.tem_pdv ? `${c.pdvs} PDV${c.pdvs === 1 ? "" : "s"}` : null,
      c.tem_licenciado ? `${c.licenciados} licenciado${c.licenciados === 1 ? "" : "s"}` : null,
      c.conquista_recente ? "🆕 conquista deste mês" : null,
    ].filter(Boolean);
    layer.bindTooltip(`<b>${nome}</b><br/>${partes.join("<br/>")}`, { sticky: true });
    layer.on("mouseover", (e: LeafletMouseEvent) => (e.target as any).setStyle?.({ weight: 3 }));
    layer.on("mouseout", (e: LeafletMouseEvent) => (e.target as any).setStyle?.({ weight: c.conquista_recente ? 2 : 1 }));
  };

  const recentes = useMemo(
    () => cruzamento.lista
      .filter((c) => c.conquista_recente)
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
    <div className="p-4 md:p-6 space-y-4">
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Placar titulo="Cidades" valor={placar.cidades.toLocaleString("pt-BR")}
          rodape={placar.municipiosBR ? `de ${placar.municipiosBR.toLocaleString("pt-BR")} no Brasil` : "—"} />
        <Placar titulo="Estados" valor={`${placar.estados}`} rodape="de 27" />
        <Placar titulo="Novas (30 dias)" valor={`+${placar.novas}`} rodape="primeira compra no período" destaque />
        <Placar titulo="Pedidos" valor={placar.pedidos.toLocaleString("pt-BR")} rodape="nas cidades exibidas" />
        <Placar titulo="Faturamento" valor={fmtBRLCompacto(placar.valor)} rodape="nas cidades exibidas" />
      </div>

      {/* Filtro de presença */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button key={f.id} size="sm" variant={filtro === f.id ? "default" : "outline"}
            onClick={() => setFiltro(f.id)} className="gap-1.5">
            {f.icon}{f.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-3 overflow-hidden">
          <CardContent className="p-0 relative" style={{ height: ALTURA }}>
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
              style={{ height: "100%", width: "100%", background: "#0b1220" }}
            >
              {malha.data && (
                <>
                  {/* A key força o redesenho: o GeoJSON do react-leaflet não
                      reage a troca de `data` nem de `style` sozinho. */}
                  <GeoJSON
                    key={`${uf ?? "BR"}-${filtro}-${cruzamento.porCodigo.size}`}
                    data={malha.data as never}
                    style={estilo as never}
                    onEachFeature={aoCriarFeature}
                  />
                  <Enquadrar geo={malha.data} />
                </>
              )}
            </MapContainer>

            {/* Legenda */}
            <div className="absolute bottom-3 left-3 z-[500] rounded-md bg-background/90 border px-3 py-2 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: VERDE_FORTE }} />
                {uf ? "Já conquistada" : "Estado com presença (mais forte = mais cidades)"}
              </div>
              {uf && (
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: AMBAR }} />
                  Conquistada nos últimos 30 dias
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm border" style={{ background: APAGADO }} />
                Ainda não
              </div>
              {!uf && <div className="text-muted-foreground pt-1">Clique num estado para abrir os municípios.</div>}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                <Sparkles className="h-4 w-4 text-amber-500" /> Conquistas do mês
              </div>
              {recentes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma cidade nova nos últimos 30 dias.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {recentes.map((c) => (
                    <div key={`${c.cidade}-${c.uf}`} className="flex items-center justify-between text-xs">
                      <span className="truncate">{c.cidade}<span className="text-muted-foreground">/{c.uf}</span></span>
                      <Badge variant="outline" className="ml-2 shrink-0">{c.primeira_venda?.slice(5) ?? ""}</Badge>
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
              Elas contam no placar, mas não têm onde ser pintadas — quase sempre é erro de
              digitação no cadastro ou UF trocada. Corrigir na origem acende o município.
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
