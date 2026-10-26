import type { Secao } from "./tipos";
import { SECOES_BASE } from "./secoes/base";
import { SECOES_VENDER, SECOES_FIM } from "./secoes/comuns";
import { SECOES_DEMANDAS } from "./secoes/demandas";
import { SECOES_SISTEMA } from "./secoes/sistema";
import { SECOES_USUARIOS } from "./secoes/usuarios";
import { SECOES_AUDITORIA } from "./secoes/auditoria";
import { SECOES_COMERCIAL } from "./secoes/comercial";

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo da Documentação do Carbo TI — uma seção por tela, em `secoes/*.ts`.
// `comuns.ts` (Vender, Bugs, Perfil) e `comercial.ts` (Minha Equipe, Chat) vêm
// do Sales/Ops/Marketing — mudou a tela, mude o texto nos apps que a documentam.
//
// ⚠️ O número `n` de cada item é o MESMO marcador desenhado no print (`chave`)
// — quem mede a posição é o harness de prints (`docs-prints/`), que usa a mesma
// numeração. Mudou um botão de lugar ou de nome: refaça o print e confira.
// ⚠️ `papel: "gestor"` some para o colaborador (seção, bloco, print ou item).
// ─────────────────────────────────────────────────────────────────────────────

const TODAS = [...SECOES_BASE, ...SECOES_DEMANDAS, ...SECOES_SISTEMA, ...SECOES_USUARIOS,
  ...SECOES_AUDITORIA, ...SECOES_VENDER, ...SECOES_COMERCIAL, ...SECOES_FIM];

/** A ordem do índice: a do menu. Seção que não estiver aqui vai para o fim. */
const ORDEM = ["comece", "inicio", "navegacao", "demandas", "chat",
  "bugs", "status", "academy",
  "usuarios", "estrutura", "avisos-venda",
  "auditoria", "acompanhamento", "ultimo-acesso", "chat-adocao",
  "vender", "equipe", "perfil"];
const pos = (id: string) => (ORDEM.indexOf(id) === -1 ? ORDEM.length : ORDEM.indexOf(id));

export const SECOES: Secao[] = [...TODAS].sort((a, b) => pos(a.id) - pos(b.id));
