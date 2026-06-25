import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { seesEverything, type Identity } from "@/lib/access";

export interface Profile extends Identity {
  id: string;
  full_name: string | null;
  username: string | null;
  allowed_interfaces: string[] | null;
}

// Chave que o Admin concede (allowed_interfaces) para liberar o app Finanças.
// Mesmo modelo do Hub: carbo_financas → Finanças.
const FINANCAS_INTERFACE = "carbo_financas";

/** Acesso ao Finanças: liberado pelo Admin (allowed_interfaces) OU gestão/TI. */
export function canAccess(p: Profile | null): boolean {
  if (!p) return false;
  if (seesEverything(p)) return true; // command / head / TI sempre entram
  const ifaces = p.allowed_interfaces;
  if (!Array.isArray(ifaces) || ifaces.length === 0) return false; // nada liberado
  return ifaces.map((i) => i.toLowerCase()).includes(FINANCAS_INTERFACE);
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Quem "manda" (command / head / TI). */
  canAdmin: boolean;
  /** Tem o Finanças liberado (Admin via allowed_interfaces, ou gestão/TI). */
  canAccess: boolean;
  // Compat com telas portadas do controle. SEM legado de papel: quem tem acesso
  // ao app (flag carbo_financas) vê tudo. O gating gestor/membro entra depois.
  isCeo: boolean;
  isAnyGestor: boolean;
  isMasterAdmin: boolean;
  isAdmin: boolean;
  isGestorCompras: boolean;
  isManager: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setLoading] = useState(true);

  const loadIdentity = async (userId: string) => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, full_name, username, department, funcao, secondary_department, secondary_funcao, allowed_interfaces")
      .eq("id", userId)
      .maybeSingle();
    setProfile((prof as Profile) ?? null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(async () => {
          await loadIdentity(s.user.id);
          setLoading(false);
        }, 0);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setSession(null); setProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      user, session, profile,
      canAdmin: seesEverything(profile),
      canAccess: canAccess(profile),
      // Tudo aberto por ora (sem legado de papel) — gating entra na fase de permissões.
      isCeo: true, isAnyGestor: true, isMasterAdmin: true, isAdmin: true, isGestorCompras: true, isManager: true,
      isLoading, signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}

