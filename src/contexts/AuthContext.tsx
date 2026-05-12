import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// Roles legados (mantidos para compatibilidade)
type AppRole = "admin" | "manager" | "operator" | "viewer";
type DepartmentType = "venda" | "preparacao" | "expedicao" | "operacao" | "pos_venda" | "b2b" | "command" | "expansao" | "finance" | "growth" | "ops";

// Novos roles Carbo
type CarboRole = "ceo" | "gestor_adm" | "gestor_fin" | "gestor_compras" | "operador_fiscal" | "operador";
type MacroFlow = "comercial" | "operacional" | "adm_financeiro";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: DepartmentType | null;
  password_must_change: boolean;
  username: string | null;
  temp_password_expires_at: string | null;
  manager_user_id: string | null;
  funcao: string | null;
  escopo: string | null;
  allowed_interfaces: string[];
  requested_role: string | null;
}

interface CarboUserRole {
  role: CarboRole;
  scope_departments: string[];
  scope_macro_flows: MacroFlow[];
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  carboRoles: CarboUserRole[];
  isLoading: boolean;
  passwordMustChange: boolean;
  tempPasswordExpired: boolean;
  // Roles legados
  isAdmin: boolean;
  isManager: boolean;
  // Novos roles Carbo
  isCeo: boolean;
  isGestorAdm: boolean;
  isGestorFin: boolean;
  isGestorCompras: boolean;
  isOperadorFiscal: boolean;
  isOperador: boolean;
  isSuporte: boolean;
  isAnyGestor: boolean;
  isAnyOperador: boolean;
  // MasterAdmin: Admin + CEO combinados (acesso irrestrito)
  isMasterAdmin: boolean;
  // Governance & Cockpit
  canAccessGovernance: boolean;
  canAccessCockpit: boolean;
  // Portal types
  isLicensee: boolean;
  isPDV: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [carboRoles, setCarboRoles] = useState<CarboUserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }
      return data as Profile;
    } catch (err) {
      console.error("Profile fetch error:", err);
      return null;
    }
  };

  const fetchRoles = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching roles:", error);
        return [];
      }
      return (data?.map((r) => r.role) || []) as AppRole[];
    } catch (err) {
      console.error("Roles fetch error:", err);
      return [];
    }
  };

  const fetchCarboRoles = async (userId: string): Promise<CarboUserRole[]> => {
    try {
      const { data, error } = await supabase
        .from("carbo_user_roles")
        .select("*")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching carbo roles:", error);
        return [];
      }
      return (data || []).map((r) => ({
        role: r.role as CarboRole,
        scope_departments: r.scope_departments || [],
        scope_macro_flows: (r.scope_macro_flows || []) as MacroFlow[],
      }));
    } catch (err) {
      console.error("Carbo roles fetch error:", err);
      return [];
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const [profileData, rolesData, carboRolesData] = await Promise.all([
        fetchProfile(user.id),
        fetchRoles(user.id),
        fetchCarboRoles(user.id),
      ]);
      setProfile(profileData);
      setRoles(rolesData);
      setCarboRoles(carboRolesData);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // Use setTimeout to avoid potential race conditions with Supabase
          setTimeout(async () => {
            const [profileData, rolesData, carboRolesData] = await Promise.all([
              fetchProfile(currentSession.user.id),
              fetchRoles(currentSession.user.id),
              fetchCarboRoles(currentSession.user.id),
            ]);
            setProfile(profileData);
            setRoles(rolesData);
            setCarboRoles(carboRolesData);
            setIsLoading(false);

            // Record login timestamp server-side (only on SIGNED_IN event)
            if (event === "SIGNED_IN") {
              try {
                await supabase.rpc("record_user_login");
              } catch {
                // Silent fail — non-critical
              }
            }
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setCarboRoles([]);
          setIsLoading(false);
        }
      }
    );

    // THEN check initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!initialSession) {
        setIsLoading(false);
      }
      // The onAuthStateChange will handle the rest
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error ? new Error(error.message) : null };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setCarboRoles([]);
  };

  // Roles legados
  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager") || isAdmin;
  
  // Novos roles Carbo
  const carboRolesList = carboRoles.map(r => r.role);
  const isCeo = carboRolesList.includes("ceo");
  const isGestorAdm = carboRolesList.includes("gestor_adm") || isCeo;
  const isGestorFin = carboRolesList.includes("gestor_fin") || isCeo;
  const isGestorCompras = carboRolesList.includes("gestor_compras") || isCeo;
  const isOperadorFiscal = carboRolesList.includes("operador_fiscal");
  const isOperador = carboRolesList.includes("operador");
  const isSuporte = carboRolesList.includes("suporte");
  const isAnyGestor = isCeo || isGestorAdm || isGestorFin || isGestorCompras;
  const isAnyOperador = isOperadorFiscal || isOperador;

  // MasterAdmin: SOMENTE Admin legado + CEO carbo (dual-role obrigatório)
  // SECURITY FIX: Removido bypass via requested_role que permitia escalação de privilégios
  const isMasterAdmin = isAdmin && isCeo;
  
  // Governance & Cockpit access — strictly MasterAdmin only
  const canAccessGovernance = isMasterAdmin;
  const canAccessCockpit = isMasterAdmin;
  
  const passwordMustChange = profile?.password_must_change ?? false;
  
  // Check if temporary password has expired (24 hours after creation)
  const tempPasswordExpired = (() => {
    if (!profile?.password_must_change || !profile?.temp_password_expires_at) {
      return false;
    }
    const expiresAt = new Date(profile.temp_password_expires_at);
    return new Date() > expiresAt;
  })();

  // Placeholder for portal types - will be populated by hooks
  const isLicensee = false; // Determined by useLicenseeStatus hook
  const isPDV = false; // Determined by usePDVStatus hook

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        carboRoles,
        isLoading,
        // Legados
        isAdmin,
        isManager,
        // Novos Carbo
        isCeo,
        isGestorAdm,
        isGestorFin,
        isGestorCompras,
        isOperadorFiscal,
        isOperador,
        isSuporte,
        isAnyGestor,
        isAnyOperador,
        // MasterAdmin
        isMasterAdmin,
        // Governance & Cockpit
        canAccessGovernance,
        canAccessCockpit,
        // Portal types
        isLicensee,
        isPDV,
        passwordMustChange,
        tempPasswordExpired,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
