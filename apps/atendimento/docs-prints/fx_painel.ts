// Fixtures da área "painel" (ver areas.ts): a tela /painel (Painel do atendimento).
// O payload veio do banco de TESTE (dados gerados), com os nomes das pessoas
// trocados pelos FICTÍCIOS de pessoas.ts. Os horários andam com o relógio:
// tudo é deslocado para "agora", senão a fila diria que esperam há dias.
import dados from "./fx_painel_dados.json";
import pessoa from "./fx_painel_pessoa.json";

const ISO = /^\d{4}-\d{2}-\d{2}T/;
const desloca = <T,>(v: T, ms: number): T => {
  if (typeof v === "string") return (ISO.test(v) ? new Date(new Date(v).getTime() + ms).toISOString() : v) as T;
  if (Array.isArray(v)) return v.map((x) => desloca(x, ms)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, desloca(x, ms)])) as T;
  return v;
};
const delta = () => Date.now() - new Date((dados as { gerado_em: string }).gerado_em).getTime();
const VAZIO = { respondidas: [], fechadas_sem_resposta: [], reabertas: [], por_hora: [] };
// O detalhe gerado é o da primeira pessoa; as outras abrem sem lista.
const PRIMEIRA = (dados as { atendentes: { chave: string }[] }).atendentes[0]?.chave;

export const RPC_FX: Record<string, unknown> = {
  carbo_atendimento_painel: () => desloca(dados, delta()),
  carbo_atendimento_pessoa: (a: { p_pessoa?: string }) => desloca(a.p_pessoa === PRIMEIRA ? pessoa : VAZIO, delta()),
  carbo_atendimento_config_definir: null,
};
