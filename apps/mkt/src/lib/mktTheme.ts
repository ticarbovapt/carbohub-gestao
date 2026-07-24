// Fundos de quadro (chave → CSS background) e paleta de etiquetas.

export const BOARD_BG: Record<string, string> = {
  blue: "linear-gradient(135deg, #0079BF, #005a8c)",
  green: "linear-gradient(135deg, #519839, #3f7a2c)",
  orange: "linear-gradient(135deg, #D29034, #b5761f)",
  red: "linear-gradient(135deg, #B04632, #8f3626)",
  purple: "linear-gradient(135deg, #89609E, #6d4c80)",
  pink: "linear-gradient(135deg, #CD5A91, #b03f76)",
  lime: "linear-gradient(135deg, #4BBF6B, #37a055)",
  sky: "linear-gradient(135deg, #00AECC, #0090a8)",
  gray: "linear-gradient(135deg, #838C91, #6b7378)",
  dark: "linear-gradient(135deg, #1f2937, #0b1220)",
};
export const BOARD_BG_KEYS = Object.keys(BOARD_BG);

export const LABEL_COLORS: Record<string, string> = {
  green: "#61BD4F",
  yellow: "#F2D600",
  orange: "#FF9F1A",
  red: "#EB5A46",
  purple: "#C377E0",
  blue: "#0079BF",
  sky: "#00C2E0",
  lime: "#51E898",
  pink: "#FF78CB",
  black: "#4D4D4D",
};
export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS);

// Cor sólida por chave de fundo de lista (BOARD_BG keys) — p/ pontos/chips.
export const LIST_DOT: Record<string, string> = {
  blue: "#0079BF", green: "#519839", orange: "#D29034", red: "#B04632",
  purple: "#89609E", pink: "#CD5A91", sky: "#00AECC", gray: "#838C91",
  lime: "#4BBF6B", dark: "#334155",
};
// Paleta ciclada p/ colorir listas que não têm cor definida.
export const LIST_PALETTE = ["#0079BF", "#519839", "#D29034", "#B04632", "#89609E", "#CD5A91", "#00AECC", "#4BBF6B"];

/* ═══════════════════════════════════════════════════════════════════════════
   CLEAN PREMIUM — acentos sutis (adições; nada acima foi removido/alterado)
   Direção: BOARD_BG fica APOSENTADO como fundo de superfície. A cor do
   quadro/lista passa a viver como ACENTO sólido (dot / faixa 3px / borda 2px).
   `LIST_DOT[key]` é a leitura de cor de quadro/lista canônica em superfícies.
   ═══════════════════════════════════════════════════════════════════════════ */

// Alias semântico: cor de acento sólida por chave (mesmo mapa de LIST_DOT).
// Use este nome quando a intenção for "acento do quadro/lista" (dot/faixa/borda).
export const BOARD_ACCENT: Record<string, string> = { ...LIST_DOT };
export const BOARD_ACCENT_KEYS = Object.keys(BOARD_ACCENT);

// Fundo de canvas SUAVE por chave — tint quase imperceptível para dar
// profundidade sem cor saturada. Opcional; o padrão continua sendo neutro
// (.board-layer / bg-background). Nunca use como fundo full-bleed vibrante.
export const CANVAS_SOFT: Record<string, string> = {
  blue: "rgba(0,121,191,0.05)",
  green: "rgba(81,152,57,0.05)",
  orange: "rgba(210,144,52,0.05)",
  red: "rgba(176,70,50,0.05)",
  purple: "rgba(137,96,158,0.05)",
  pink: "rgba(205,90,145,0.05)",
  sky: "rgba(0,174,204,0.05)",
  gray: "rgba(131,140,145,0.05)",
  lime: "rgba(75,191,107,0.05)",
  dark: "rgba(51,65,85,0.05)",
};

// Swatches curados p/ o seletor de cor (alinhados aos acentos, não à paleta
// Trello inteira). Cada item: chave + hex sólido de acento (via LIST_DOT).
export const ACCENT_SWATCHES: Array<{ key: string; color: string }> =
  BOARD_ACCENT_KEYS.map((key) => ({ key, color: BOARD_ACCENT[key] }));

/**
 * getAccent — resolve a cor de acento sólida de um quadro/lista.
 * Ordem: LIST_DOT[key] → LIST_PALETTE[i] (ciclado) → LIST_DOT.gray.
 * É o helper único para renderizar dot / faixa 3px / borda 2px de acento.
 * @param key   chave de cor (BOARD_BG/LIST_DOT), ex.: board.background / list.color
 * @param index índice da lista/quadro para ciclar a paleta quando não há key
 */
export function getAccent(key?: string | null, index = 0): string {
  if (key && LIST_DOT[key]) return LIST_DOT[key];
  return LIST_PALETTE[index % LIST_PALETTE.length] ?? LIST_DOT.gray;
}

// Etiqueta "tinted" (§5): fundo color/15, texto color, borda color/30.
// Legível em light e dark; elimina text-white sobre cor cheia.
// Aceita hex (#RRGGBB) — resolve os canais e devolve estilos inline prontos.
export function tintedLabelStyle(color: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  const hex = color.replace("#", "");
  const full =
    hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return {
    backgroundColor: `rgba(${r},${g},${b},0.15)`,
    color,
    borderColor: `rgba(${r},${g},${b},0.30)`,
  };
}
