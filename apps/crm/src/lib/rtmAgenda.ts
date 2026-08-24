// ─────────────────────────────────────────────────────────────────────────────
// rtmAgenda — as regras da agenda, puras e testáveis
//
// A tela ganhou duas visões (lista e mês) e, com elas, o risco de sempre: a
// mesma conta escrita duas vezes. Aderência calculada inline no componente e
// depois copiada para o resumo do mês são duas cópias — e duas cópias divergem
// sem dar erro, que é exatamente como o `quotePdf.ts` do `mkt` passou meses
// imprimindo um PDF diferente na mão do cliente.
//
// Aqui não há IO nem React. Só as regras que os testes alcançam.
// ─────────────────────────────────────────────────────────────────────────────

import type { RtmSituacaoAgenda } from "@/hooks/useRtm";

/**
 * ⚠️ MEIO-DIA de propósito.
 *
 * `new Date("2026-08-24")` é meia-noite UTC e, no Brasil, volta como dia 23.
 * É o mesmo erro que jogava o faturamento do dia 31 para o mês seguinte no
 * `useMetaEcommerce`. Todo `Date` desta tela nasce às 12h e nunca vira o dia,
 * nem no horário de verão.
 */
export const doDia = (s: string): Date => new Date(`${s}T12:00:00`);

/**
 * A chave de um dia, SEMPRE local.
 *
 * ⚠️ Nunca `toISOString().slice(0, 10)`: às 21h de Brasília ele devolve o dia
 * seguinte, e a visita apareceria na célula errada do calendário.
 */
export function chaveDia(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * A ordem em que o polegar quer ler o dia: o que ainda dá para fazer primeiro,
 * o histórico depois.
 *
 * ⚠️ Concluída vai para o FIM, não intercalada. Quem está de pé quer o próximo
 * PDV no topo, não o relatório da manhã.
 */
export const PESO_SITUACAO: Record<RtmSituacaoAgenda, number> = {
  em_andamento: 0, pendente: 1, nao_cumprida: 2, concluida: 3, cancelada: 4,
};

export interface ContagemSituacao {
  pendente: number; em_andamento: number; concluida: number;
  nao_cumprida: number; cancelada: number;
}

export function contar(linhas: { situacao: RtmSituacaoAgenda }[]): ContagemSituacao {
  const c: ContagemSituacao = {
    pendente: 0, em_andamento: 0, concluida: 0, nao_cumprida: 0, cancelada: 0,
  };
  for (const l of linhas) c[l.situacao] += 1;
  return c;
}

/**
 * Aderência: cumpridas ÷ planejadas.
 *
 * ⚠️ A cancelada sai do DENOMINADOR. Visita cancelada com motivo não é falha de
 * execução — contá-la puniria o vendedor por um pedido do cliente, e a primeira
 * coisa que uma métrica injusta produz é gente deixando de registrar o
 * cancelamento.
 *
 * Devolve `null` quando não há denominador: zero visitas planejadas não é 0% de
 * aderência, é ausência de medida. Mostrar 0% ali seria acusar alguém de não
 * cumprir um plano que não existe.
 */
export function aderenciaDe(c: ContagemSituacao, planejadas: number): number | null {
  const denominador = planejadas - c.cancelada;
  if (denominador <= 0) return null;
  return Math.round((c.concluida / denominador) * 100);
}

export interface ResumoDoMes {
  planejadas: number;
  concluidas: number;
  naoCumpridas: number;
  /** ⚠️ Só os dias JÁ DECORRIDOS — ver a justificativa em `resumirMes`. */
  aderencia: number | null;
}

export interface DiaResumo {
  planejadas: number; pendentes: number; em_andamento: number;
  concluidas: number; nao_cumpridas: number; canceladas: number;
}

/**
 * O resumo do mês, a partir das contagens por dia.
 *
 * ⚠️ A aderência do mês conta APENAS os dias já decorridos, e o rótulo na tela
 * diz isso ("até hoje"). Sobre o mês inteiro, no dia 3 de agosto ela diria 10%
 * — porque 27 dias ainda não aconteceram. Um indicador que é sempre vermelho
 * ensina a pessoa a ignorar a faixa inteira, e aí os outros três morrem junto.
 *
 * As outras três leem o mês todo: "planejadas no mês" é a CARGA do mês, que é
 * informação útil e que hoje não existe em lugar nenhum.
 *
 * `mesmoMes` é injetado porque a grade do calendário traz os dias vizinhos
 * (27/jul aparece na grade de agosto) e eles não entram no indicador do mês.
 */
export function resumirMes(
  porDia: Map<string, DiaResumo>,
  hoje: string,
  mesmoMes: (chave: string) => boolean,
): ResumoDoMes {
  let planejadas = 0, concluidas = 0, naoCumpridas = 0;
  let feitasAte = 0, baseAte = 0;

  for (const [d, r] of porDia) {
    if (!mesmoMes(d)) continue;
    planejadas += r.planejadas;
    concluidas += r.concluidas;
    naoCumpridas += r.nao_cumpridas;
    if (d <= hoje) {
      feitasAte += r.concluidas;
      baseAte += r.planejadas - r.canceladas;
    }
  }

  return {
    planejadas, concluidas, naoCumpridas,
    aderencia: baseAte > 0 ? Math.round((feitasAte / baseAte) * 100) : null,
  };
}

export interface JanelaAgrupada<T> {
  /** Não cumpridas de dias ANTERIORES a hoje — o débito que a lista precisa
   *  mostrar sem que ninguém volte o seletor de data. */
  atrasadas: T[];
  /** As do dia âncora, já na ordem do polegar. */
  doDia: T[];
  /** Dias à frente, do mais próximo para o mais distante. */
  proximos: [string, T[]][];
}

/**
 * Divide a janela de dias nos três grupos da lista.
 *
 * ⚠️ "Atrasadas" existe porque a linha não cumprida é a informação mais
 * importante da tela — é dela que sai a aderência — e numa lista que começa em
 * "hoje" ela só reaparece se alguém voltar a data para terça-feira. Ninguém
 * volta.
 */
export function agruparJanela<T extends { data_prevista: string; situacao: RtmSituacaoAgenda }>(
  janela: T[], dia: string, hoje: string,
): JanelaAgrupada<T> {
  const atrasadas = janela
    .filter((l) => l.data_prevista < hoje && l.situacao === "nao_cumprida")
    .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));

  const doDiaLista = janela
    .filter((l) => l.data_prevista === dia)
    .sort((a, b) => PESO_SITUACAO[a.situacao] - PESO_SITUACAO[b.situacao]);

  const mapa = new Map<string, T[]>();
  for (const l of janela) {
    if (l.data_prevista <= dia) continue;
    const atual = mapa.get(l.data_prevista);
    if (atual) atual.push(l); else mapa.set(l.data_prevista, [l]);
  }

  return {
    atrasadas,
    doDia: doDiaLista,
    proximos: [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)),
  };
}
