import { Bug, Lightbulb, Cable, KeyRound, HelpCircle, type LucideIcon } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Tipo da demanda — FONTE ÚNICA.
//
// O TI recebe muito mais coisa do que software: cabo que queimou, login novo,
// "me ensina a fazer isso". Antes tudo isso virava "bug", o que estragava a
// métrica de qualidade do sistema e escondia o volume de suporte de bancada.
//
// Por que é pacote: o botão de reporte (BugButton) existe nos SEIS apps, com
// arquivos byte a byte idênticos, e o quadro do TI é um sétimo consumidor.
// Sete cópias de uma lista divergem — e a divergência aqui não dá erro: ela
// tira a opção da tela de alguém, sem avisar. Foi exatamente isso que
// aconteceu com as etapas do pós-venda (ver packages/posvenda).
//
// Os dois tipos originais estão INTACTOS: mesmo valor, mesma ordem, mesmos
// rótulos. Nada foi migrado; as categorias novas só somam.
//
// ⚠️ Tipo novo aqui precisa entrar no CHECK de `kind` em carbo_bug_reports
// (migração) ANTES, senão gravar dá erro de constraint. E a função
// carbo_bug_kind_label no banco decide o texto da notificação — se ela não
// conhecer o tipo, o pedido de cabo chega no sininho como "novo bug".
//
// Não existe "Outro" de propósito: categoria genérica vira lixeira e depois
// ninguém consegue responder "quanto do meu tempo foi em quê".
// ─────────────────────────────────────────────────────────────────────────────

export interface KindConfig {
  /** Valor gravado em carbo_bug_reports.kind. */
  key: string;
  /** Rótulo neutro — usado no quadro do TI, filtros e relatórios. */
  label: string;
  /**
   * Explicação curta, na voz de quem PEDE. Não é enfeite: "Bug" é palavra de
   * quem conserta, e a dica é o que traduz o rótulo para quem está reportando.
   * O botão de reporte mostra a dica do tipo selecionado numa linha fixa —
   * por isso ela precisa caber em UMA linha.
   */
  hint: string;
  /** true = demanda de software (pede o campo Sistema/app). */
  software: boolean;
  /**
   * Faz sentido perguntar "isso te impede de trabalhar?". Falso só para
   * sugestão: ideia de melhoria não bloqueia ninguém por definição, e a
   * pergunta ali soaria como convite a inflar a prioridade.
   */
  bloqueia: boolean;
}

export const KINDS: KindConfig[] = [
  { key: "bug",      label: "Bug",         hint: "Algo do sistema está errado",                    software: true,  bloqueia: true },
  { key: "sugestao", label: "Sugestão",    hint: "Ideia de melhoria no sistema",                   software: true,  bloqueia: false },
  // O pedido de dia a dia que não tem tela nenhuma — o exemplo real foi
  // "buscar um cabo pro monitor".
  { key: "infra",    label: "Equipamento", hint: "Cabo, monitor, periférico, máquina, rede",       software: false, bloqueia: true },
  // Alto volume, resolução rápida, ciclo de vida próprio. Não pede Sistema
  // porque o alvo tanto pode ser um app nosso quanto Bling, e-mail ou rede —
  // obrigar a escolher entre nossos apps só induziria resposta errada.
  { key: "acesso",   label: "Acesso",      hint: "Criar login, liberar permissão, resetar senha",  software: false, bloqueia: true },
  // Separa "não sei usar" de "está quebrado" — a confusão entre os dois é o
  // que mais distorce a contagem de bugs.
  { key: "ajuda",    label: "Ajuda",       hint: "Dúvida de uso, \"me ensina a…\"",                software: true,  bloqueia: true },
];

/** Tipo desconhecido cai em Bug — o default histórico da coluna. */
export const kindOf = (k: string | null | undefined): KindConfig =>
  KINDS.find((x) => x.key === k) ?? KINDS[0];

export const kindLabel = (k: string | null | undefined): string => kindOf(k).label;

/** Ícone e cor. Separado do KindConfig porque é detalhe de apresentação, e o
 *  contrato do KindConfig é consumido também por filtro e relatório. */
export const KIND_UI: Record<string, { Icon: LucideIcon; className: string }> = {
  bug:      { Icon: Bug,        className: "text-destructive" },
  sugestao: { Icon: Lightbulb,  className: "text-amber-500" },
  infra:    { Icon: Cable,      className: "text-sky-500" },
  acesso:   { Icon: KeyRound,   className: "text-violet-500" },
  ajuda:    { Icon: HelpCircle, className: "text-emerald-500" },
};

export const kindUi = (k: string | null | undefined) => KIND_UI[kindOf(k).key] ?? KIND_UI.bug;
