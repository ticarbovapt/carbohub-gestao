import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerTudo } from "@/lib/lerTudo";

// ═══════════════════════════════════════════════════════════════════════════
// CarboVAPT por PORTE — lendo a NOTA, que é o que vale
//
// Decisão do dono do processo em 28/09/2026: *"preciso disso vindo do portal
// nacional e não do nosso sistema interno, pq isso aqui é faturamento, vendas
// com nf que é o que vale para a gente"*. A primeira versão lia o `/vender`
// (`useDescarbPorte`, removido) e mostrava intenção de venda, não faturamento.
//
// ⚠️ O PORTE NÃO ESTÁ NA NOTA. Medido: a palavra nunca aparece nas 342 notas, e
// o detalhe estruturado da descrição (`texto|qtd|unit|total#`) acaba em 30/04 —
// trocaram de emissor (numeração 2120 → 50). Quem classifica é
// `carbo_carbovapt_faixa`, faixa de valor → porte, CADASTRO editável.
//
// ⚠️ A REGRA MORA NO BANCO (`carbo_carbovapt_notas`), não aqui. Se ela morasse
// no front, a próxima tela que precisasse do mesmo número teria a segunda
// cópia — e é assim que dois painéis passam a discordar sobre a mesma venda.
// ═══════════════════════════════════════════════════════════════════════════

export interface PorteLinha {
  porte: string | null;
  rotulo: string;
  hint: string;
  veiculos: number | null;
  total: number;
  notas: number;
}

export interface CarbovaptPorte {
  linhas: PorteLinha[];
  /** Fatia classificada (tem porte) e o resto — os dois somam `total`. */
  classificado: number;
  naoClassificado: number;
  total: number;
  notas: number;
  veiculos: number;
  /** Quanto do R$ veio do detalhe EXATO, e não de faixa de valor. */
  totalPorDetalhe: number;
}

export interface PorteFiltro { from?: string; to?: string }

interface Linha {
  linha_id: string;
  nsu: number;
  emitida_em: string | null;
  cancelada: boolean | null;
  origem: string | null;
  valor: number | string | null;
  porte: string | null;
  porte_rotulo: string | null;
  porte_hint: string | null;
  veiculos: number | string | null;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function useCarbovaptPorte(filtros: PorteFiltro = {}) {
  const { from, to } = filtros;
  return useQuery({
    queryKey: ["dash-comercial-carbovapt-porte", from ?? "", to ?? ""],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CarbovaptPorte> => {
      // ⚠️ `lerTudo` + ordem ESTÁVEL. A view explode a nota em linhas de
      // detalhe, então `nsu` sozinho NÃO é único — o desempate é `linha_id`
      // (`nsu:idx`), que existe na view justamente para isto. Sem ordem
      // estável, paginar por `range` devolve a mesma linha duas vezes e outra
      // nenhuma, e o erro sai como número LIGEIRAMENTE errado.
      const linhas = await lerTudo<Linha>((de, ate) =>
        supabase
          .from("carbo_carbovapt_notas" as never)
          .select("linha_id, nsu, emitida_em, cancelada, origem, valor, porte, porte_rotulo, porte_hint, veiculos")
          .order("nsu", { ascending: false, nullsFirst: false })
          .order("linha_id", { ascending: false })
          .range(de, ate) as never,
      );

      const dentro = (iso: string) => (!from || iso >= from) && (!to || iso <= to);

      const acc = new Map<string, PorteLinha>();
      const notasVistas = new Set<number>();
      let classificado = 0, naoClassificado = 0, total = 0, veiculos = 0, totalPorDetalhe = 0;

      for (const l of linhas) {
        // A nota cancelada some do TOTAL, como no card. Somá-la seria contar
        // faturamento que não existe.
        if (l.cancelada) continue;
        if (!l.emitida_em || !dentro(l.emitida_em.slice(0, 10))) continue;

        const valor = num(l.valor);
        const chave = l.porte ?? "?";
        const linha = acc.get(chave) ?? {
          porte: l.porte,
          rotulo: l.porte_rotulo ?? "Não classificado",
          hint: l.porte_hint ?? "valor fora das faixas cadastradas",
          veiculos: l.porte ? 0 : null,
          total: 0,
          notas: 0,
        };
        linha.total += valor;
        if (l.porte && linha.veiculos !== null) {
          const v = num(l.veiculos);
          linha.veiculos += v;
          veiculos += v;
        }
        acc.set(chave, linha);

        total += valor;
        if (l.porte) classificado += valor; else naoClassificado += valor;
        if (l.origem === "detalhe") totalPorDetalhe += valor;
        notasVistas.add(l.nsu);
      }

      // ⚠️ Contagem de NOTAS por porte é feita à parte: uma nota com detalhe
      // vira várias linhas, e somar `notas` linha a linha diria 3 notas onde
      // houve 1. É o mesmo erro do `count(*)` em `ecommerce_orders`.
      const notasPorPorte = new Map<string, Set<number>>();
      for (const l of linhas) {
        if (l.cancelada) continue;
        if (!l.emitida_em || !dentro(l.emitida_em.slice(0, 10))) continue;
        const k = l.porte ?? "?";
        if (!notasPorPorte.has(k)) notasPorPorte.set(k, new Set());
        notasPorPorte.get(k)!.add(l.nsu);
      }
      for (const [k, linha] of acc) linha.notas = notasPorPorte.get(k)?.size ?? 0;

      // Ordem: P, M, G (pela `ordem` do cadastro, que vem no rótulo), e o
      // "não classificado" SEMPRE por último — ele é resto, não é um porte.
      const ordenadas = [...acc.values()].sort((a, b) => {
        if (!a.porte) return 1;
        if (!b.porte) return -1;
        return a.rotulo.localeCompare(b.rotulo, "pt-BR");
      });

      return {
        linhas: ordenadas,
        classificado,
        naoClassificado,
        total,
        notas: notasVistas.size,
        veiculos,
        totalPorDetalhe,
      };
    },
  });
}
