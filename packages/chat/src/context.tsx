import { createContext, useContext, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatUser } from "./types";

// O pacote não sabe de onde vem o supabase/usuário — cada app injeta o seu.
interface ChatCtx {
  supabase: SupabaseClient;
  currentUser: ChatUser;
}

const Ctx = createContext<ChatCtx | null>(null);

export function ChatProvider({
  supabase, currentUser, children,
}: {
  supabase: SupabaseClient;
  currentUser: ChatUser;
  children: ReactNode;
}) {
  return <Ctx.Provider value={{ supabase, currentUser }}>{children}</Ctx.Provider>;
}

export function useChatCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChatCtx precisa do <ChatProvider>.");
  return ctx;
}
