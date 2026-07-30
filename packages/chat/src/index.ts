// API pública do Carbo Chat (consumida pelos 4 apps).
export { ChatProvider } from "./context";
export { ChatApp } from "./components/ChatApp";
export { ChatBadge } from "./components/ChatBadge";
// useConversations sai junto do useUnreadTotal para as telas de início
// poderem mostrar as conversas recentes sem montar o ChatApp inteiro.
// Adição pura: nenhum app existente muda de comportamento.
export { useUnreadTotal, useConversations } from "./hooks";
export type { Conversation } from "./types";
export type { ChatUser } from "./types";
