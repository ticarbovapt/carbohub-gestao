import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      const { data, error } = await (supabase as any)
        .from("mapa_conquista")
        .select("*")
        .limit(6000);
      if (error) throw error;
      return (data ?? []) as CidadeConquistada[];
    },
    staleTime: 5 * 60_000,
  });
}

export interface MunicipioIBGE { id: number; nomeNorm: string; uf: string }

/** Os 5.570 municípios, uma vez só. Serve para dois fins: descobrir o código
 *  IBGE das nossas cidades e saber quantos municípios cada estado tem. */
export function useMunicipiosIBGE() {
  return useQuery({
    queryKey: ["ibge-municipios"],
    queryFn: async (): Promise<MunicipioIBGE[]> => {
      const res = await fetch(`${IBGE}/v1/localidades/municipios`);
      if (!res.ok) throw new Error("IBGE indisponível (municípios)");
      const json = (await res.json()) as any[];
      return json.map((m) => ({
        id: m.id,
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

/** Malha (GeoJSON). Sem `uf` = Brasil dividido por estado; com `uf` = o estado
 *  dividido por município. `qualidade=intermediaria` é o meio-termo entre
 *  arquivo pequeno e contorno reconhecível numa TV. */
export function useMalha(uf: string | null) {
  return useQuery({
    queryKey: ["ibge-malha", uf ?? "BR"],
    queryFn: async () => {
      const url = uf
        ? `${IBGE}/v3/malhas/estados/${uf}?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio`
        : `${IBGE}/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=UF`;
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
