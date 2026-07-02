import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  isManager, fnKey, scopeFromLevel,
  type AccessLevel, type DataScope, type Identity, type FnAccessMap,
} from "@/lib/access";

// Interface deste app em profiles.allowed_interfaces (Camada 1).
export const APP_INTERFACE = "carbo_crm";

// Perfil mínimo que o CRM precisa (identidade vem do CORE compartilhado).
export interface Profile extends Identity {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
  allowed_interfaces: string[] | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Nível derivado da identidade (Camada 2): gestor | membro. */
  level: AccessLevel;
  /** Escopo de dado derivado do nível (Camada 3). */
  scope: DataScope;
  isGestor: boolean;
  /** Camada 1: a pessoa tem este app (carbo_crm) liberado no perfil? */
  hasAppAccess: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fnMap, setFnMap] = useState<FnAccessMap>({});
  const [isLoading, setLoading] = useState(true);

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, username, department, funcao, secondary_department, secondary_funcao, allowed_interfaces")
      .eq("id", userId)
      .single();
    if (error) { console.error("[CRM] perfil:", error.message); return null; }
    return data as unknown as Profile;
  };

  // Mapa de níveis por função (a flag "gestor" que o Admin controla na Estrutura).
  // Carregado uma vez; `carbo_functions` é legível por autenticado.
  useEffect(() => {
    supabase
      .from("carbo_functions")
      .select("department, function_key, access_level")
      .eq("is_active", true)
      .then(({ data }) => {
        const m: FnAccessMap = {};
        for (const f of (data ?? []) as { department: string; function_key: string; access_level: "gestor" | "colaborador" }[]) {
          m[fnKey(f.department, f.function_key)] = f.access_level;
        }
        setFnMap(m);
      });
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(async () => {
          setProfile(await fetchProfile(s.user.id));
          setLoading(false);
          supabase.rpc("record_app_access", { _app: "carbo_crm" });
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

  // Fonte da verdade do gestor = flag do Admin (access_level da função), igual ao
  // banco (public.carbo_is_gestor). Antes usava só command/head/TI e ignorava a flag.
  const isGestor = isManager(profile, fnMap);
  const level: AccessLevel = isGestor ? "gestor" : "membro";
  const scope = scopeFromLevel(level);
  const hasAppAccess = !!profile?.allowed_interfaces?.includes(APP_INTERFACE);

  return (
    <AuthContext.Provider value={{
      user, session, profile,
      level, scope, isGestor,
      hasAppAccess,
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
