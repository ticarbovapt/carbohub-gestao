/**
 * Carbo Core API Layer
 * 
 * Centralized abstraction over Supabase for future app-split readiness.
 * All 3 future apps (OPS, Licenciados, PDV) will import from this layer
 * instead of calling Supabase directly.
 * 
 * Tenant types:
 *  - 'ops'       → Internal Carbo team (squads)
 *  - 'licensee'  → Partner licensees
 *  - 'pdv'       → Point of sale / Products
 */

import { supabase } from "@/integrations/supabase/client";

export type TenantType = "ops" | "licensee" | "pdv";

// ============================================================
// AUTH
// ============================================================

export const CarboAuth = {
  signIn: async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  getSession: () => supabase.auth.getSession(),

  onAuthStateChange: (callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) =>
    supabase.auth.onAuthStateChange(callback),

  resolveUsername: async (username: string) => {
    const { data } = await supabase.rpc("get_user_email_by_username", {
      p_username: username.toLowerCase(),
    });
    return data as string | null;
  },
};

// ============================================================
// PROFILES (PII-safe)
// ============================================================

export const CarboProfiles = {
  /** Returns masked profile data safe for general display */
  getMyProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, department, status, username, funcao, escopo, allowed_interfaces, requested_role, manager_user_id")
      .eq("id", userId)
      .single();
    return { data, error };
  },

  getTeamProfiles: async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, department, status, username")
      .eq("status", "approved")
      .order("full_name", { ascending: true });
    return { data, error };
  },
};

// ============================================================
// ORDERS (Masked by default)
// ============================================================

export const CarboOrders = {
  /** List orders with masked PII */
  listMasked: async (filters?: { status?: string; limit?: number }) => {
    let query = supabase
      .from("carboze_orders_secure")
      .select("*");

    if (filters?.status) query = query.eq("status", filters.status as any);
    if (filters?.limit) query = query.limit(filters.limit);

    return query.order("created_at", { ascending: false });
  },

  /** Get full sensitive data — requires admin/master_admin role */
  getSensitive: async (orderId: string) => {
    const { data, error } = await supabase
      .from("carboze_orders")
      .select("*")
      .eq("id", orderId)
      .single();
    return { data, error };
  },
};

// ============================================================
// EDGE FUNCTIONS
// ============================================================

export const CarboFunctions = {
  invoke: async <T = any>(name: string, body?: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke<T>(name, { body });
    return { data, error };
  },
};
