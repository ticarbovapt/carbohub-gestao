import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerSemTeto } from "@carbo/shell";

/**
 * Mapa da conquista — onde a Carbo já chegou.
 *
 * Três fontes de dado, três origens diferentes:
 *
 *   1. `mapa_conquista` (nosso banco) — cidade, UF e as bandeiras de presença.
 *      A regra do que é presença mora na view, não aqui.
 *   2. Lista de municípios do IBGE — para descobrir o CÓDIGO de cada cidade e
 *      quantos municípios cada estado tem (o denominador da cobertura).
 *   3. Malhas do IBGE — o desenho em si, em GeoJSON.
 *
 * ⚠️ Por que o IBGE e não a `jamef_cep_faixas`, que já está no banco: aquela
 * tabela é a COBERTURA DA JAMEF, não a lista do Brasil. Rio Branco/AC, Águas
 * Lindas/GO e Fernando de Noronha/PE não estão nela — usá-la deixaria buracos
 * permanentes em estados inteiros, e buracos que ninguém notaria, porque a
 * cidade simplesmente não apareceria.
 *
 * As APIs do IBGE são públicas, sem chave e sem custo.
 */

const IBGE = "https://servicodados.ibge.gov.br/api";

export interface CidadeConquistada {
  cidade: string;            // já normalizado pela view
  uf: string;
  pedidos: number;
  valor: number;
  pdvs: number;
  licenciados: number;
  tem_venda: boolean;
  tem_pdv: boolean;
  tem_licenciado: boolean;
  primeira_venda: string | null;
  ultima_venda: string | null;
  conquista_recente: boolean;
}

export type FiltroPresenca = "todos" | "venda" | "pdv" | "licenciado";

/** Mesma normalização da `carbo_normaliza_cidade` no banco. As duas pontas
 *  precisam concordar, senão o casamento com o IBGE falha em silêncio. */
export function normalizaCidade(nome: string): string {
  return nome
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // tira acento
    .replace(/['`´]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function useCidadesConquistadas() {
  return useQuery({
    queryKey: ["mapa-conquista"],
    queryFn: async (): Promise<CidadeConquistada[]> => {
      // Uma linha por (cidade, uf): o par é único e serve de ordem estável.
      return await lerSemTeto<CidadeConquistada>(() => (supabase as any)
        .from("mapa_conquista")
        .select("*")
        .order("uf")
        .order("cidade"));
    },
    staleTime: 5 * 60_000,
  });
}

export interface MunicipioIBGE { id: number; nome: string; nomeNorm: string; uf: string }

/** Os 5.570 municípios, uma vez só. Serve para três fins: descobrir o código
 *  IBGE das nossas cidades, saber quantos municípios cada estado tem e dar
 *  NOME aos polígonos — a malha do IBGE só traz `codarea`, sem nome. Sem isto
 *  o tooltip mostraria "3550308" em vez de "São Paulo". */
export function useMunicipiosIBGE() {
  return useQuery({
    queryKey: ["ibge-municipios"],
    queryFn: async (): Promise<MunicipioIBGE[]> => {
      const res = await fetch(`${IBGE}/v1/localidades/municipios`);
      if (!res.ok) throw new Error("IBGE indisponível (municípios)");
      const json = (await res.json()) as any[];
      return json.map((m) => ({
        id: m.id,
        nome: String(m.nome ?? ""),
        nomeNorm: normalizaCidade(String(m.nome ?? "")),
        uf: String(m?.microrregiao?.mesorregiao?.UF?.sigla
          ?? m?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ?? ""),
      }));
    },
    // A lista de municípios do Brasil muda de década em década.
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  });
}

/** Granularidade do desenho quando se está olhando o Brasil inteiro. */
export type Granularidade = "estado" | "municipio";

/** Malha (GeoJSON). Com `uf` = aquele estado por município. Sem `uf`, a
 *  granularidade escolhe: o Brasil por estado (27 polígonos) ou por município
 *  (5.570).
 *
 * ⚠️ A qualidade muda com o tamanho, de propósito. `intermediaria` dá contorno
 * bonito quando são dezenas de polígonos; nos 5.570 do Brasil inteiro ela vira
 * um arquivo enorme para desenhar detalhe que, naquele zoom, cabe em menos de
 * um pixel. Aí `minima` entrega o mesmo mapa aos olhos por uma fração do peso. */
export function useMalha(uf: string | null, granularidade: Granularidade = "estado") {
  const nacionalPorMunicipio = !uf && granularidade === "municipio";
  return useQuery({
    queryKey: ["ibge-malha", uf ?? (nacionalPorMunicipio ? "BR-mun" : "BR")],
    queryFn: async () => {
      const q = (qualidade: string, intra: string, alvo: string) =>
        `${IBGE}/v3/malhas/${alvo}?formato=application/vnd.geo+json&qualidade=${qualidade}&intrarregiao=${intra}`;
      const url = uf
        ? q("intermediaria", "municipio", `estados/${uf}`)
        : nacionalPorMunicipio
          ? q("minima", "municipio", "paises/BR")
          : q("intermediaria", "UF", "paises/BR");
      const res = await fetch(url);
      if (!res.ok) throw new Error("IBGE indisponível (malha)");
      return res.json();
    },
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  });
}

/** Código IBGE de cada UF — o `codarea` da malha do Brasil vem assim. */
export const UF_POR_CODIGO: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL",
  "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

// ─── Vendas por estado (26/11/2026, `carbo_mapa_vendas`) ─────────────────────

/** Tudo · B2B · On-line. On-line = `segmento = 'online'`; o resto é B2B. */
export type CanalMapa = "todos" | "b2b" | "online";

/** Uma UF ou cidade, com cada número em B2B e on-line SEPARADOS — é a tela
 *  que soma ou escolhe, para nenhum número sair mascarado pelo outro canal. */
export interface LinhaCanal {
  pedidos_b2b: number; pedidos_online: number;
  unidades_b2b: number; unidades_online: number;
  valor_b2b: number; valor_online: number;
}
export interface EstadoVendas extends LinhaCanal {
  uf: string; regiao: string | null;
  cidades: number; cidades_b2b: number; cidades_online: number;
}
export interface CidadeVendas extends LinhaCanal { cidade: string }
export interface ProdutoVendas {
  canal: "b2b" | "online";
  chave: string;
  produto: string;
  /** Unidades por venda (kit de 5 = 5). 1 = avulsa, ou kit sem cadastro de embalagem. */
  pack: number;
  servico: boolean;
  /** `false` = o item não casou com o catálogo: vale o nome dele e 1 por item. */
  conhecido: boolean;
  codigo: string | null;
  pedidos: number;
  quantidade: number;
  unidades: number;
  valor: number;
}
export interface MapaVendas {
  estados: EstadoVendas[];
  cidades: CidadeVendas[] | null;
  produtos: ProdutoVendas[];
}

/** O número de UMA linha no canal escolhido. */
export function noCanal(l: LinhaCanal, campo: "pedidos" | "unidades" | "valor", canal: CanalMapa): number {
  const b2b = Number(l[`${campo}_b2b`] ?? 0);
  const online = Number(l[`${campo}_online`] ?? 0);
  return canal === "b2b" ? b2b : canal === "online" ? online : b2b + online;
}

/**
 * Agregado no BANCO (jsonb): a tela não baixa pedido nenhum. Com `uf` vêm as
 * cidades e os produtos daquele estado; sem, os produtos do Brasil.
 * ⚠️ Erro SOBE: "sem acesso" ou "banco sem a função" não podem virar
 * "não vendemos nada".
 */
export function useMapaVendas(de: string, ate: string, uf: string | null, ligado = true) {
  return useQuery({
    queryKey: ["mapa-vendas", de, ate, uf],
    enabled: ligado && !!de && !!ate,
    placeholderData: (anterior) => anterior,
    queryFn: async (): Promise<MapaVendas> => {
      const { data, error } = await (supabase as any)
        .rpc("carbo_mapa_vendas", { p_de: de, p_ate: ate, p_uf: uf });
      if (error) {
        if (error.code === "PGRST202") throw new Error("O banco ainda não tem a consulta de vendas por estado.");
        throw new Error(error.message);
      }
      const num = (o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) =>
        [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && !["uf", "cidade", "codigo", "chave", "produto"].includes(k)
          ? Number(v) : v]));
      return {
        estados: ((data?.estados ?? []) as any[]).map(num) as unknown as EstadoVendas[],
        cidades: data?.cidades ? ((data.cidades as any[]).map(num) as unknown as CidadeVendas[]) : null,
        produtos: ((data?.produtos ?? []) as any[]).map(num) as unknown as ProdutoVendas[],
      };
    },
    staleTime: 60_000,
  });
}

export const NOME_UF: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais",
  MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco",
  PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia",
  RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo",
  TO: "Tocantins",
};
