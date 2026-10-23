import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerSemTeto } from "@carbo/shell";
import { hojeISO, somarDias } from "@/lib/datas";
import type { Ordem } from "@/components/financeiro/ContasUI";

// ─────────────────────────────────────────────────────────────────────────────
// Contas a receber / a pagar da FILIAL (Bling 2) — SOMENTE LEITURA.
//
// `bling2_contas_receber` e `bling2_contas_pagar` são espelho do Bling da conta
// 2, escritos pelo `bling2-sync` (varredura) e pela `bling2-contas` (os abertos,
// a cada 10 min). A tela não grava: a baixa pedida aqui vai ao Bling 2 pela
// função (`lib/bling2Baixa.ts`), e é ela que atualiza o espelho.
// Ficam SEGMENTADAS da matriz de propósito (decisão do dono do processo, 21/10:
// "pq qualquer coisa só apagamos") — nunca somadas a `receivables`.
//
// ⚠️ `situacao` é o id do Bling em TEXTO: '1' em aberto · '2' recebido/pago ·
// '3' parcialmente · '4' devolvido · '5' cancelado. Valor desconhecido aparece
// CRU na tela — nunca vira "em aberto" por omissão.
// ⚠️ "Em aberto" = '1' ou '3'. "Vencido" = em aberto e vencimento < hoje
// (Brasília, `hojeISO`).
// ⚠️ São ~1.400 títulos abertos na conta a receber (acima do teto de 1.000 do
// PostgREST): contagem no BANCO (`head: true`), soma por `lerSemTeto`, lista
// paginada com `.range()` e ordem estável (vencimento, id).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export type Bling2Tipo = "receber" | "pagar";
export type FiltroBling2 = "fila" | "aberto" | "quitados" | "todos";

export const SITUACOES_ABERTAS = ["1", "3"] as const;

export interface Bling2Conta {
  id: string;
  bling_id: number;
  numero: string | null;
  nome: string | null;          // cliente (receber) ou fornecedor (pagar)
  valor: number | null;
  saldo: number | null;
  vencimento: string | null;
  data_emissao: string | null;
  data_pagamento: string | null;
  situacao: string | null;
  historico: string | null;
  /** A baixa feita AQUI que chegou ao Bling 2 (migração 20261131). */
  cb_baixa_em: string | null;
  cb_baixa_por_nome: string | null;
  cb_baixa_bordero: number | null;
  /** A última recusa do Bling 2 a uma baixa pedida daqui. */
  cb_baixa_erro: string | null;
  /** Conta a PAGAR criada aqui no Bling 2 (`fin-contas-pagar`, migração 20261132). */
  cb_criado_nome: string | null;
  /** Conta e ajustes da baixa feita AQUI (20261133). */
  baixa_ajustes: Record<string, any> | null;
}

export const tabelaBling2 = (tipo: Bling2Tipo) =>
  tipo === "receber" ? "bling2_contas_receber" : "bling2_contas_pagar";
export const colunaNomeBling2 = (tipo: Bling2Tipo) => (tipo === "receber" ? "cliente" : "fornecedor");

const COLUNAS = (tipo: Bling2Tipo) =>
  `id, bling_id, numero, ${colunaNomeBling2(tipo)}, valor, saldo, vencimento, data_emissao, data_pagamento, situacao, historico`;
// ⚠️ Colunas da baixa pela tela (20261131). Front no ar antes do SQL: a consulta
// com elas falha (42703) e a tela relê SEM elas — nunca fica vazia por isso.
const COLUNAS_BAIXA = "cb_baixa_em, cb_baixa_por_nome, cb_baixa_bordero, cb_baixa_erro";
// Quem a criou aqui: pagar desde a 20261132, receber desde a 20261134.
const COLUNAS_CRIADO = "cb_criado_nome";
// A conta e os ajustes da baixa feita aqui (20261133).
const COLUNAS_AJUSTES = "baixa_ajustes";
const faltaColuna = (e: any) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || (/cb_(baixa|criado)_|baixa_ajustes/.test(String(e.message ?? "")) && /does not exist|schema cache|Could not find/i.test(String(e.message ?? ""))));

/** A linha crua do banco → `Bling2Conta` (também usada para a conta recém-criada pela tela). */
export const paraConta = (tipo: Bling2Tipo) => (r: any): Bling2Conta => ({
  id: r.id, bling_id: r.bling_id, numero: r.numero ?? null,
  nome: r[colunaNomeBling2(tipo)] ?? null,
  valor: r.valor == null ? null : Number(r.valor),
  saldo: r.saldo == null ? null : Number(r.saldo),
  vencimento: r.vencimento ?? null, data_emissao: r.data_emissao ?? null,
  data_pagamento: r.data_pagamento ?? null, situacao: r.situacao == null ? null : String(r.situacao),
  historico: r.historico ?? null,
  cb_baixa_em: r.cb_baixa_em ?? null,
  cb_baixa_por_nome: r.cb_baixa_por_nome ?? null,
  cb_baixa_bordero: r.cb_baixa_bordero == null ? null : Number(r.cb_baixa_bordero),
  cb_baixa_erro: r.cb_baixa_erro ?? null,
  cb_criado_nome: r.cb_criado_nome ?? null,
  baixa_ajustes: r.baixa_ajustes ?? null,
});

/** Quanto falta: parcial ('3') vale o SALDO; em aberto ('1') vale o valor do título. */
export function valorEmAberto(c: { situacao: string | null; valor: number | null; saldo: number | null }): number {
  if (c.situacao === "3" && c.saldo != null) return c.saldo;
  return c.valor ?? 0;
}

/** O texto da busca vai dentro de um `.or()` do PostgREST: vírgula, parêntese e curinga quebram a sintaxe. */
const limparBusca = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

function falhou(error: any): never {
  throw new Error(error?.message ? `${error.message}${error.code ? ` (${error.code})` : ""}` : "erro desconhecido");
}

export interface ResumoBling2 {
  aberto: { qtd: number; valor: number };
  vencido: { qtd: number; valor: number };
  semana: { qtd: number; valor: number };
  ultimaSincronizacao: string | null;
}

/**
 * Cartões do topo. Contagem no BANCO; valor somado sobre TODO o em aberto
 * (lido sem teto). "Semana" = vence de hoje até hoje + 7 — somado ao vencido,
 * fecha exatamente com a fila.
 */
export function useBling2Resumo(tipo: Bling2Tipo) {
  return useQuery({
    queryKey: ["bling2-contas-resumo", tipo, hojeISO()],
    queryFn: async (): Promise<ResumoBling2> => {
      const hoje = hojeISO();
      const ate7 = somarDias(hoje, 7);
      const tabela = tabelaBling2(tipo);
      const contar = async (montar: (q: any) => any) => {
        const { count, error } = await montar(
          db.from(tabela).select("id", { count: "exact", head: true }).in("situacao", SITUACOES_ABERTAS as unknown as string[]),
        );
        if (error) falhou(error);
        return count ?? 0;
      };
      const [qAberto, qVencido, qSemana, abertas, ultima] = await Promise.all([
        contar((q) => q),
        contar((q) => q.lt("vencimento", hoje)),
        contar((q) => q.gte("vencimento", hoje).lte("vencimento", ate7)),
        lerSemTeto<any>(() =>
          db.from(tabela).select("id, valor, saldo, vencimento, situacao")
            .in("situacao", SITUACOES_ABERTAS as unknown as string[])
            .order("vencimento", { ascending: true }).order("id", { ascending: true })),
        db.from(tabela).select("synced_at").order("synced_at", { ascending: false }).limit(1),
      ]);
      if (ultima?.error) falhou(ultima.error);
      const soma = (arr: any[]) => arr.reduce((s, r) => s + valorEmAberto({
        situacao: r.situacao == null ? null : String(r.situacao),
        valor: r.valor == null ? null : Number(r.valor),
        saldo: r.saldo == null ? null : Number(r.saldo),
      }), 0);
      const venc = (r: any) => (r.vencimento ? String(r.vencimento).slice(0, 10) : null);
      return {
        aberto: { qtd: qAberto, valor: soma(abertas) },
        vencido: { qtd: qVencido, valor: soma(abertas.filter((r) => { const v = venc(r); return v != null && v < hoje; })) },
        semana: { qtd: qSemana, valor: soma(abertas.filter((r) => { const v = venc(r); return v != null && v >= hoje && v <= ate7; })) },
        ultimaSincronizacao: ultima?.data?.[0]?.synced_at ?? null,
      };
    },
  });
}

/**
 * Lista paginada no servidor. Fila/aberto do mais antigo para o mais novo;
 * quitados/todos do mais recente para trás (o histórico vai a anos).
 */
export function useBling2ContasPaged(params: {
  tipo: Bling2Tipo; filtro: FiltroBling2; busca: string; page: number; pageSize: number;
  ordem?: Ordem;
  /** Recorte por VENCIMENTO (dia ISO); vazio = sem aquela ponta. */
  de?: string; ate?: string;
}) {
  return useQuery({
    queryKey: ["bling2-contas-paged", params, hojeISO()],
    queryFn: async () => {
      const hoje = hojeISO();
      const nome = colunaNomeBling2(params.tipo);
      const montar = (colunas: string) => {
        let q = db.from(tabelaBling2(params.tipo)).select(colunas, { count: "exact" });
        switch (params.filtro) {
          case "fila": q = q.in("situacao", SITUACOES_ABERTAS as unknown as string[]).lte("vencimento", somarDias(hoje, 7)); break;
          case "aberto": q = q.in("situacao", SITUACOES_ABERTAS as unknown as string[]); break;
          case "quitados": q = q.eq("situacao", "2"); break;
          default: break;
        }
        if (params.de) q = q.gte("vencimento", params.de);
        if (params.ate) q = q.lte("vencimento", params.ate);
        const b = limparBusca(params.busca);
        if (b) q = q.or(`${nome}.ilike.%${b}%,numero.ilike.%${b}%`);
        // Ordem escolhida na tela; nula = a padrão (fila/abertos do mais antigo,
        // quitados e todos do mais recente).
        const asc = params.ordem ? params.ordem.asc : params.filtro === "fila" || params.filtro === "aberto";
        const coluna = !params.ordem ? "vencimento"
          : { nome, vencimento: "vencimento", valor: "valor", quitado: "data_pagamento" }[params.ordem.col];
        const de = params.page * params.pageSize;
        return q.order(coluna, { ascending: asc, nullsFirst: false })
          .order("id", { ascending: asc })
          .range(de, de + params.pageSize - 1);
      };
      // Do mais completo ao mais antigo: coluna que ainda não existe derruba só
      // o que depende dela, nunca a lista.
      // ⚠️ O receber só ganhou "quem criou" na 20261134: antes dela a 1ª
      // tentativa falha e cai na segunda, sem a coluna.
      const tentativas = [
        `${COLUNAS(params.tipo)}, ${COLUNAS_BAIXA}, ${COLUNAS_CRIADO}, ${COLUNAS_AJUSTES}`,
        `${COLUNAS(params.tipo)}, ${COLUNAS_BAIXA}, ${COLUNAS_AJUSTES}`,
        `${COLUNAS(params.tipo)}, ${COLUNAS_BAIXA}, ${COLUNAS_CRIADO}`,
        `${COLUNAS(params.tipo)}, ${COLUNAS_BAIXA}`,
        COLUNAS(params.tipo),
      ];
      let { data, error, count } = await montar(tentativas[0]);
      for (const cols of tentativas.slice(1)) {
        if (!faltaColuna(error)) break;
        ({ data, error, count } = await montar(cols));
      }
      if (error) falhou(error);
      return { rows: ((data ?? []) as any[]).map(paraConta(params.tipo)), count: count ?? 0 };
    },
  });
}
