import type { Secao } from "./tipos";
import { SECOES_BASE } from "./secoes/base";
import { SECOES_VENDER, SECOES_FIM } from "./secoes/comuns";
import { SECOES_PRODUCAO } from "./secoes/producao";
import { SECOES_SUPRIMENTOS } from "./secoes/suprimentos";
import { SECOES_LOGISTICA } from "./secoes/logistica";
import { SECOES_CAMPO } from "./secoes/campo";
import { SECOES_COMERCIAL } from "./secoes/comercial";

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo da Documentação do Carbo Ops — uma seção por tela, em
// `secoes/*.ts`. `comuns.ts` (Vender, Bugs, Perfil), `campo.ts` (Ordens de
// Serviço) e `comercial.ts` (Minha Equipe, Chat) são telas IDÊNTICAS às do
// Sales: o texto veio de lá — mudou a tela, mude nos dois apps.
//
// ⚠️ O número `n` de cada item é o MESMO marcador desenhado no print (`chave`)
// — quem mede a posição é o harness de prints (`docs-prints/`), que usa a mesma
// numeração. Mudou um botão de lugar ou de nome: refaça o print e confira.
// ⚠️ `papel: "gestor"` some para o colaborador (seção, bloco, print ou item).
// ─────────────────────────────────────────────────────────────────────────────

const TODAS = [...SECOES_BASE, ...SECOES_VENDER, ...SECOES_PRODUCAO, ...SECOES_SUPRIMENTOS,
  ...SECOES_LOGISTICA, ...SECOES_CAMPO, ...SECOES_COMERCIAL, ...SECOES_FIM];

/** A ordem do índice: a do menu. Seção que não estiver aqui vai para o fim. */
const ORDEM = ["comece", "inicio", "navegacao", "chat",
  "producao-dashboard", "producao-ordens", "mrp",
  "suprimentos", "estoque-vendedores", "compras",
  "logistica", "rastreio", "recorrencias", "viagens",
  "os", "alertas", "vender", "equipe", "bugs", "perfil"];
const pos = (id: string) => (ORDEM.indexOf(id) === -1 ? ORDEM.length : ORDEM.indexOf(id));

export const SECOES: Secao[] = [...TODAS].sort((a, b) => pos(a.id) - pos(b.id));
