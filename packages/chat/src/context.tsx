import { createContext, useContext, useRef, type MutableRefObject, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatUser } from "./types";
import { ChatAlerts } from "./components/ChatAlerts";

// O pacote não sabe de onde vem o supabase/usuário — cada app injeta o seu.
interface ChatCtx {
  supabase: SupabaseClient;
  currentUser: ChatUser;
  // canal aberto agora (para o alerta global não tocar/toastar o que você já vê).
  activeChannelRef: MutableRefObject<string | null>;
}

const Ctx = createContext<ChatCtx | null>(null);

export function ChatProvider({
  supabase, currentUser, children,
}: {
  supabase: SupabaseClient;
  currentUser: ChatUser;
  children: ReactNode;
}) {
  const activeChannelRef = useRef<string | null>(null);
  return (
    <Ctx.Provider value={{ supabase, currentUser, activeChannelRef }}>
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
