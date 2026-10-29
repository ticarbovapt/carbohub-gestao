import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { EMPTY_FILTERS, type DashFilters } from "@/components/comercial/ComercialFilterBar";

// ─────────────────────────────────────────────────────────────────────────────
// A barra Período · Vendedor · Canal do Painel Comercial e dos Dados Comerciais
// na URL (`?de=&ate=&vendedor=&canal=`). As DUAS telas usam as MESMAS chaves, e
// é isso que deixa o seletor "Gráficos ↔ Dados (fonte)" levar o recorte junto:
// "mesma base, mesmos filtros" passa a valer também para o endereço.
//
// ⚠️ UMA escrita com os quatro campos: o "Limpar" zera todos no mesmo clique, e
// quatro gravações separadas apagariam umas às outras. Parte de
// `window.location.search` (não do `prev` do roteador, que é o do último render)
// pela razão registrada no `useParamUrl` do shell.
//
// `extrasZerar`: chaves que perdem o sentido quando o recorte muda — a página
// da lista, por exemplo, volta para a primeira.
// ─────────────────────────────────────────────────────────────────────────────
export function useFiltrosComerciaisUrl(
  extrasZerar: string[] = [],
): [DashFilters, (f: DashFilters) => void] {
  const [params, setParams] = useSearchParams();
  const pDe = params.get("de") ?? "", pAte = params.get("ate") ?? "";
  const pVend = params.get("vendedor") ?? "all", pCanal = params.get("canal") ?? "all";
  const filtros = useMemo<DashFilters>(
    () => ({ ...EMPTY_FILTERS, from: pDe, to: pAte, vendedor: pVend, segmento: pCanal }),
    [pDe, pAte, pVend, pCanal],
  );
  const extras = extrasZerar.join("|");
  const setFiltros = useCallback(
    (f: DashFilters) => {
      const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      const grava = (k: string, v: string, padrao: string) => (v && v !== padrao ? p.set(k, v) : p.delete(k));
      grava("de", f.from, ""); grava("ate", f.to, "");
      grava("vendedor", f.vendedor, "all"); grava("canal", f.segmento, "all");
      for (const k of extras ? extras.split("|") : []) p.delete(k);
      setParams(p);
    },
    [setParams, extras],
  );
  return [filtros, setFiltros];
}

// As chaves que o recorte comercial usa — para quem precisa LEVAR o recorte de
// uma tela para a outra (o seletor Gráficos ↔ Dados, os "Ver pedidos →").
export const CHAVES_FILTRO_COMERCIAL = ["de", "ate", "vendedor", "canal"] as const;

export function queryDoRecorte(search: string): string {
  const atual = new URLSearchParams(search);
  const p = new URLSearchParams();
  for (const k of CHAVES_FILTRO_COMERCIAL) {
    const v = atual.get(k);
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
