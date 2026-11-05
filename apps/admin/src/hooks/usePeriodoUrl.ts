import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { intervaloDoAtalho, detectarAtalho, diaIso, type Periodo } from "@carbo/shell";
import { atalhosDoFiltro } from "@/components/ui/PeriodoFiltro";

// ─────────────────────────────────────────────────────────────────────────────
// O período do `PeriodoFiltro` (o mesmo seletor das Vendas Online) morando na
// URL, para o F5 e o link mandado a alguém abrirem no MESMO recorte.
// Pedido do dono do processo (29/10/2026): "o F5 vai persistir pela slug e não
// por forçar o código".
//
//   ?periodo=hoje|ontem|7d|30d|este-mes   atalho RELATIVO, contado de HOJE
//   (sem nada)                            o padrão da tela (o mês atual)
//   ?de=AAAA-MM-DD&ate=…                  mês fechado ou intervalo livre
//
// ⚠️ O atalho vai para a URL como ATALHO, nunca como datas: o link "últimos 7
// dias" aberto amanhã tem de dizer os 7 dias de amanhã. Gravar as datas
// congelaria o recorte.
//
// ⚠️ Link ANTIGO (do `PeriodPicker`, até 05/11/2026) continua abrindo:
// `?periodo=mes` é o mês atual, `?periodo=7d` são os últimos 7 dias, e
// `?periodo=15d` — que o seletor novo não tem — abre o MESMO intervalo de
// antes (de 15 dias atrás até hoje), como "Por período…".
//
// ⚠️ UMA escrita com as três chaves, partindo de `window.location.search` (a
// mesma razão do `useParamUrl`): o seletor troca `periodo`, `de` e `ate` no
// mesmo clique, e três gravações separadas apagariam umas às outras.
//
// ⚠️ Intervalo pela metade não existe: `de` sem `ate` vale até hoje, data
// inválida cai no padrão. Endereço digitado à mão não pode virar tela quebrada.
// ─────────────────────────────────────────────────────────────────────────────

type Atalho = "today" | "yesterday" | "7d" | "30d" | "month";
const NA_URL: Record<Atalho, string> = {
  today: "hoje", yesterday: "ontem", "7d": "7d", "30d": "30d", month: "este-mes",
};
const DA_URL: Record<string, Atalho> = {
  hoje: "today", ontem: "yesterday", "7d": "7d", "30d": "30d", "este-mes": "month",
  mes: "month", // o nome antigo do mês atual
};
const OPCOES = atalhosDoFiltro();
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** `?periodo=15d` do seletor antigo: de 15 dias atrás até hoje. */
function quinzeDiasAntigo(): Periodo {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  const hoje = diaIso(d);
  d.setDate(d.getDate() - 15);
  return { from: diaIso(d), to: hoje };
}

export function usePeriodoUrl(
  padrao: Atalho = "month",
  opts: { extrasZerar?: string[] } = {},
): [Periodo, (r: Periodo) => void] {
  const [params, setParams] = useSearchParams();
  const pPeriodo = params.get("periodo") ?? "";
  const pDe = params.get("de") ?? "";
  const pAte = params.get("ate") ?? "";

  const range = useMemo<Periodo>(() => {
    if (DIA.test(pDe)) {
      const hoje = intervaloDoAtalho("today").to;
      const ate = DIA.test(pAte) && pAte >= pDe ? pAte : hoje;
      return { from: pDe, to: ate };
    }
    if (pPeriodo === "15d") return quinzeDiasAntigo();
    return intervaloDoAtalho(DA_URL[pPeriodo] ?? padrao);
  }, [pPeriodo, pDe, pAte, padrao]);

  const extras = opts.extrasZerar?.join("|") ?? "";
  const setRange = useCallback(
    (r: Periodo) => {
      const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      p.delete("periodo"); p.delete("de"); p.delete("ate");
      // Trocar o recorte volta a lista para a 1ª página (quando a tela pagina).
      for (const k of extras ? extras.split("|") : []) p.delete(k);
      const { atalho } = detectarAtalho(r, OPCOES);
      if (atalho in NA_URL) {
        if (atalho !== padrao) p.set("periodo", NA_URL[atalho as Atalho]);
      } else {
        if (r.from) p.set("de", r.from);
        if (r.to) p.set("ate", r.to);
      }
      setParams(p, { replace: true });
    },
    [padrao, setParams, extras],
  );

  return [range, setRange];
}
