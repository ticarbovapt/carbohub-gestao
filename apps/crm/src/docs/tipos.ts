// Tipos da Documentação do Carbo Sales (`/documentacao`).
//
// ⚠️ `papel` é RECORTE DE TELA, não segredo: o texto de gestor vai no mesmo
// pacote do app e quem o abrir pelo código vê. O que protege o DADO é a RLS;
// aqui o objetivo é só não mostrar ao colaborador a explicação do que ele
// não usa.
export type Papel = "todos" | "gestor";

/** Caixa do marcador, em % da imagem (0–100). Gerada pelo harness de prints. */
export interface Caixa { x: number; y: number; w: number; h: number }

export interface Item {
  /** Número do marcador no print (ausente = item só de texto). */
  n?: number;
  titulo: string;
  texto: string;
  papel?: Papel;
}

export interface Print {
  /** Chave do print: arquivo `public/docs/<chave>.jpg` e entrada em MARCADORES. */
  chave: string;
  legenda: string;
  papel?: Papel;
}

export interface Bloco {
  titulo?: string;
  texto?: string;
  print?: Print;
  itens?: Item[];
  papel?: Papel;
}

export interface Secao {
  id: string;
  titulo: string;
  /** Rota da tela documentada (link "Abrir esta tela"). */
  rota?: string;
  resumo: string;
  papel?: Papel;
  blocos: Bloco[];
  /** O que cada nível vê/pode nesta tela. */
  regras?: { colaborador: string[]; gestor: string[] };
}

export const vale = (p: Papel | undefined, isGestor: boolean) => isGestor || (p ?? "todos") === "todos";
