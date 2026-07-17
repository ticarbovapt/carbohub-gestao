import { createContext, useCallback, useContext, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatUser } from "./types";
import { ChatAlerts } from "./components/ChatAlerts";

// O pacote não sabe de onde vem o supabase/usuário — cada app injeta o seu.
interface ChatCtx {
  supabase: SupabaseClient;
  currentUser: ChatUser;
  // canal aberto agora (para o alerta global não tocar/toastar o que você já vê).
  activeChannelRef: MutableRefObject<string | null>;
  // abre a conversa certa no /chat (?c=). Usado pelo toast/sininho ao clicar.
  // focus (opcional): pula até uma mensagem específica (busca).
  openConversation: (channelId: string, focus?: { messageId: string; at: string }) => void;
}

const Ctx = createContext<ChatCtx | null>(null);

export function ChatProvider({
  supabase, currentUser, navigate, children,
}: {
  supabase: SupabaseClient;
  currentUser: ChatUser;
  // navegação soft do app (ex.: react-router useNavigate). Sem ela, cai num
  // window.location.assign (recarrega, mas funciona).
  navigate?: (path: string) => void;
  children: ReactNode;
}) {
  const activeChannelRef = useRef<string | null>(null);
  const openConversation = useCallback((channelId: string, focus?: { messageId: string; at: string }) => {
    const path = `/chat?c=${channelId}` + (focus ? `&m=${focus.messageId}` : "");
    if (navigate) navigate(path);
    else window.location.assign(path);
    // Avisa um ChatApp já montado (ex.: já estava no /chat) pra trocar a conversa
    // sem recarregar. Quando vem de outra página, o próprio ?c= restaura no mount.
    try { window.dispatchEvent(new CustomEvent("carbo-chat:open", { detail: { channelId, focus } })); } catch { /* ssr */ }
  }, [navigate]);
  const value = useMemo(
    () => ({ supabase, currentUser, activeChannelRef, openConversation }),
    [supabase, currentUser, openConversation],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Alerta global: som + toast de mensagem nova em qualquer página. */}
      {currentUser.id ? <ChatAlerts /> : null}
    </Ctx.Provider>
  );
}

export function useChatCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChatCtx precisa do <ChatProvider>.");
  return ctx;
}
