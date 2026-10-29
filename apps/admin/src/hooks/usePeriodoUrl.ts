import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { presetRange, type PeriodRange } from "@/components/ui/PeriodPicker";

// ─────────────────────────────────────────────────────────────────────────────
// O período do `PeriodPicker` (7 dias · 15 dias · Mês atual · Personalizado)
// morando na URL, para o F5 e o link mandado a alguém abrirem no MESMO recorte.
// Pedido do dono do processo (29/10/2026): "o F5 vai persistir pela slug e não
// por forçar o código". Antes era `useState(presetRange("month"))` e todo F5
// voltava ao mês atual, com o seletor dizendo outra coisa do que a pessoa via.
//
//   ?periodo=7d | 15d          atalho RELATIVO: "últimos 7 dias" contados de HOJE
//   (sem nada)                 o padrão da tela (o mês atual)
//   ?de=AAAA-MM-DD&ate=…       intervalo livre, datas fixas
//
// ⚠️ O atalho vai para a URL como ATALHO, nunca como datas: o link "últimos 7
// dias" aberto amanhã tem de dizer os 7 dias de amanhã. Gravar as datas
// congelaria o recorte e o seletor deixaria de acender o botão.
//
// ⚠️ UMA escrita com as três chaves, partindo de `window.location.search` (a
// mesma razão do `useParamUrl`): o seletor troca `periodo`, `de` e `ate` no
// mesmo clique, e três gravações separadas apagariam umas às outras.
//
// ⚠️ Intervalo pela metade não existe: `de` sem `ate` vale até hoje, data
// inválida cai no padrão. Endereço digitado à mão não pode virar tela quebrada.
// ─────────────────────────────────────────────────────────────────────────────

type Atalho = "7d" | "15d" | "month";
const NA_URL: Record<Atalho, string> = { "7d": "7d", "15d": "15d", month: "mes" };
const DA_URL: Record<string, Atalho> = { "7d": "7d", "15d": "15d", mes: "month" };
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export function usePeriodoUrl(
  padrao: Atalho = "month",
  opts: { extrasZerar?: string[] } = {},
): [PeriodRange, (r: PeriodRange) => void] {
  const [params, setParams] = useSearchParams();
  const pPeriodo = params.get("periodo") ?? "";
  const pDe = params.get("de") ?? "";
  const pAte = params.get("ate") ?? "";

  const range = useMemo<PeriodRange>(() => {
    if (DIA.test(pDe)) {
      const hoje = presetRange("month").to;
      const ate = DIA.test(pAte) && pAte >= pDe ? pAte : hoje;
      return { from: pDe, to: ate };
    }
    return presetRange(DA_URL[pPeriodo] ?? padrao);
  }, [pPeriodo, pDe, pAte, padrao]);

  const extras = opts.extrasZerar?.join("|") ?? "";
  const setRange = useCallback(
    (r: PeriodRange) => {
      const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      p.delete("periodo"); p.delete("de"); p.delete("ate");
      // Trocar o recorte volta a lista para a 1ª página (quando a tela pagina).
      for (const k of extras ? extras.split("|") : []) p.delete(k);
      const atalho = (["7d", "15d", "month"] as const).find((a) => {
        const x = presetRange(a);
        return x.from === r.from && x.to === r.to;
      });
      if (atalho) {
        if (atalho !== padrao) p.set("periodo", NA_URL[atalho]);
      } else {
        if (r.from) p.set("de", r.from);
        if (r.to) p.set("ate", r.to);
      }
      setParams(p);
    },
    [padrao, setParams, extras],
  );

  return [range, setRange];
}
