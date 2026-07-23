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
