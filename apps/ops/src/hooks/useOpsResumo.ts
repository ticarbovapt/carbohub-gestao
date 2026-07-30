import { useMemo } from "react";
import { useProductionOrders } from "./useProductionOrders";
import { useStock } from "./useStock";
import { useShipments } from "./useShipments";
import { usePayables } from "./usePayables";
import { useOS } from "./useOS";
import { minForHub } from "@/components/estoque/stockData";

// ─────────────────────────────────────────────────────────────────────────────
// Resumo operacional da home do Ops.
//
// Composto sobre os hooks que JÁ existem, não sobre SQL novo. Duas razões:
// as regras de "abaixo do mínimo", "remessa pendente" e "vencido" já estão
// escritas e testadas nesses hooks, e reescrevê-las numa view criaria uma
// segunda definição para os mesmos números — foi exatamente assim que o
// faturamento chegou a ter 14 definições de "venda que conta".
//
// Custo: 5 consultas. Todas já são feitas pelas telas internas e o
// react-query as compartilha por queryKey, então abrir a home esquenta o
// cache do resto do app em vez de desperdiçar.
//
// ⚠️ Um erro em qualquer uma NÃO derruba o painel: cada bloco reporta o
// próprio estado. Um painel meio carregado que diz o que falhou é melhor que
// um zero silencioso — zero em "abaixo do mínimo" parece estoque saudável.
// ─────────────────────────────────────────────────────────────────────────────

const hojeISO = () => new Date().toISOString().slice(0, 10);

const emDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** OPs que ainda exigem alguém: fora de concluída/cancelada. */
const OP_ABERTA = new Set([
  "rascunho", "planejada", "aguardando_separacao", "separada", "aguardando_liberacao",
  "liberada_producao", "em_producao", "envase", "rotulagem", "aguardando_confirmacao",
  "confirmada", "aguardando_qualidade", "qualidade_aprovada", "liberada",
]);
/** Chão de fábrica rodando agora. */
const OP_EM_CHAO = new Set(["em_producao", "envase", "rotulagem"]);
/** Parada esperando decisão de alguém — é o que trava a fila. */
const OP_ESPERANDO = new Set([
  "aguardando_separacao", "aguardando_liberacao", "aguardando_confirmacao", "aguardando_qualidade",
]);

/** OS que ainda vai acontecer. Concluída sai da fila. */
const OS_ABERTA = new Set(["nova", "qualificacao", "agendamento", "confirmada", "em_execucao", "pos_servico"]);

export interface BlocoEstado {
  carregando: boolean;
  erro: string | null;
}

const estado = (q: { isLoading: boolean; error: unknown }): BlocoEstado => ({
  carregando: q.isLoading,
  // Erro do Supabase NÃO é instanceof Error — é objeto com `message`.
  erro: q.error ? ((q.error as { message?: string })?.message ?? "Erro ao carregar") : null,
});

export function useOpsResumo() {
  const ops = useProductionOrders();
  const estoque = useStock();
  const remessas = useShipments();
  const pagar = usePayables();
  const os = useOS();

  const producao = useMemo(() => {
    const linhas = ops.data ?? [];
    const abertas = linhas.filter((o) => OP_ABERTA.has(o.op_status));
    return {
      ...estado(ops),
      abertas: abertas.length,
      emChao: abertas.filter((o) => OP_EM_CHAO.has(o.op_status)).length,
      esperando: abertas.filter((o) => OP_ESPERANDO.has(o.op_status)).length,
      bloqueadas: linhas.filter((o) => o.op_status === "bloqueada").length,
      // Data de necessidade já passou e a OP não fechou.
      atrasadas: abertas.filter((o) => o.need_date && o.need_date < hojeISO()).length,
    };
  }, [ops.data, ops.isLoading, ops.error]);

  const suprimentos = useMemo(() => {
    const linhas = estoque.data ?? [];
    // Um produto conta UMA vez, mesmo faltando em vários hubs — senão o
    // número vira "ocorrências" e assusta sem significar mais trabalho.
    let zerados = 0, abaixo = 0;
    const criticos: { nome: string; hub: string; qtd: number; min: number }[] = [];
    for (const p of linhas) {
      let pior: { hub: string; qtd: number; min: number } | null = null;
      for (const hub of Object.keys(p.hubs)) {
        const qtd = p.hubs[hub] ?? 0;
        const min = minForHub(p, hub) || p.safety_stock_qty || 0;
        if (min <= 0) continue;               // sem mínimo definido não há régua
        if (qtd >= min) continue;
        if (!pior || qtd - min < pior.qtd - pior.min) pior = { hub, qtd, min };
      }
      if (!pior) continue;
      if (pior.qtd <= 0) zerados++; else abaixo++;
      criticos.push({ nome: p.name || p.product_code, ...pior });
    }
    criticos.sort((a, b) => (a.qtd - a.min) - (b.qtd - b.min));
    return { ...estado(estoque), zerados, abaixo, criticos: criticos.slice(0, 5) };
  }, [estoque.data, estoque.isLoading, estoque.error]);

  const logistica = useMemo(() => {
    const linhas = (remessas.data ?? []) as { status: string }[];
    const viva = linhas.filter((s) => s.status !== "entregue" && s.status !== "cancelado");
    return {
      ...estado(remessas),
      aSeparar: viva.filter((s) => s.status === "separacao_pendente").length,
      separando: viva.filter((s) => s.status === "separando").length,
      prontas: viva.filter((s) => s.status === "separado").length,
      emTransporte: viva.filter((s) => s.status === "em_transporte").length,
    };
  }, [remessas.data, remessas.isLoading, remessas.error]);

  const financeiro = useMemo(() => {
    const linhas = pagar.data ?? [];
    const abertos = linhas.filter((p) => p.status !== "pago" && p.status !== "cancelado");
    const limite = emDias(7);
    const vencendo = abertos.filter((p) => !p.overdue && p.due_date <= limite);
    const vencidos = abertos.filter((p) => p.overdue);
    const soma = (xs: typeof abertos) => xs.reduce((n, p) => n + Number(p.amount || 0), 0);
    return {
      ...estado(pagar),
      vencidos: vencidos.length, valorVencido: soma(vencidos),
      vencendo: vencendo.length, valorVencendo: soma(vencendo),
      // Fornecedor mais antigo em atraso — dá nome ao número.
      maisAntigo: vencidos.sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null,
    };
  }, [pagar.data, pagar.isLoading, pagar.error]);

  const campo = useMemo(() => {
    const linhas = os.data ?? [];
    const abertas = linhas.filter((o) => OS_ABERTA.has(o.stage));
    const hoje = hojeISO();
    const seteDias = emDias(7);
    return {
      ...estado(os),
      abertas: abertas.length,
      hoje: abertas.filter((o) => (o.data_prevista ?? "").slice(0, 10) === hoje).length,
      semana: abertas.filter((o) => {
        const d = (o.data_prevista ?? "").slice(0, 10);
        return d && d >= hoje && d <= seteDias;
      }).length,
      // Prevista para trás e ainda aberta: alguém precisa remarcar ou fechar.
      atrasadas: abertas.filter((o) => {
        const d = (o.data_prevista ?? "").slice(0, 10);
        return d && d < hoje;
      }).length,
      semData: abertas.filter((o) => !o.data_prevista).length,
    };
  }, [os.data, os.isLoading, os.error]);

  return { producao, suprimentos, logistica, financeiro, campo };
}
