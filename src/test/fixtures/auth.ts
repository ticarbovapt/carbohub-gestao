/**
 * Auth Fixtures - Fixtures reutilizáveis para testes de autenticação e autorização
 * 
 * Baseado nos princípios do pytest:
 * - Fixtures isoladas e reutilizáveis
 * - Escopos bem definidos
 * - Dados de teste nunca afetam dados reais
 */

import type { User, Session } from "@supabase/supabase-js";

// ============ TIPOS DE USUÁRIO MOCK ============

export interface MockProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: "venda" | "preparacao" | "expedicao" | "operacao" | "pos_venda" | null;
  password_must_change: boolean;
  username: string | null;
  temp_password_expires_at: string | null;
}

export interface MockCarboRole {
  role: "ceo" | "gestor_adm" | "gestor_fin" | "gestor_compras" | "operador_fiscal" | "operador";
  scope_departments: string[];
  scope_macro_flows: ("comercial" | "operacional" | "adm_financeiro")[];
}

// ============ FIXTURES DE USUÁRIO ============

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "test-user-id-" + Math.random().toString(36).substr(2, 9),
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "test@carbo.com",
    phone: null,
    confirmed_at: new Date().toISOString(),
    email_confirmed_at: new Date().toISOString(),
    phone_confirmed_at: undefined,
    last_sign_in_at: new Date().toISOString(),
    role: "authenticated",
    updated_at: new Date().toISOString(),
    ...overrides,
  } as User;
}

export function createMockSession(user: User): Session {
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
}

export function createMockProfile(overrides: Partial<MockProfile> = {}): MockProfile {
  return {
    id: "test-profile-id",
    full_name: "Test User",
    avatar_url: null,
    department: null,
    password_must_change: false,
    username: "testuser",
    temp_password_expires_at: null,
    ...overrides,
  };
}

// ============ FIXTURES DE ROLES ============

export const MOCK_ROLES = {
  ceo: (): MockCarboRole => ({
    role: "ceo",
    scope_departments: [],
    scope_macro_flows: ["comercial", "operacional", "adm_financeiro"],
  }),

  gestorAdm: (): MockCarboRole => ({
    role: "gestor_adm",
    scope_departments: ["preparacao", "expedicao"],
    scope_macro_flows: ["operacional"],
  }),

  gestorFin: (): MockCarboRole => ({
    role: "gestor_fin",
    scope_departments: [],
    scope_macro_flows: ["adm_financeiro"],
  }),

  gestorCompras: (): MockCarboRole => ({
    role: "gestor_compras",
    scope_departments: [],
    scope_macro_flows: ["operacional"],
  }),

  operadorFiscal: (): MockCarboRole => ({
    role: "operador_fiscal",
    scope_departments: [],
    scope_macro_flows: ["adm_financeiro"],
  }),

  operador: (): MockCarboRole => ({
    role: "operador",
    scope_departments: ["venda", "preparacao"],
    scope_macro_flows: ["comercial", "operacional"],
  }),
} as const;

// ============ FIXTURES DE CONTEXTO AUTH ============

export interface MockAuthContext {
  user: User | null;
  session: Session | null;
  profile: MockProfile | null;
  roles: ("admin" | "manager" | "operator" | "viewer")[];
  carboRoles: MockCarboRole[];
  isLoading: boolean;
  passwordMustChange: boolean;
  tempPasswordExpired: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isCeo: boolean;
  isGestorAdm: boolean;
  isGestorFin: boolean;
  isGestorCompras: boolean;
  isOperadorFiscal: boolean;
  isOperador: boolean;
  isAnyGestor: boolean;
  isAnyOperador: boolean;
  isLicensee: boolean;
  isPDV: boolean;
  signIn: () => Promise<{ error: Error | null }>;
  signUp: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export function createMockAuthContext(
  role: keyof typeof MOCK_ROLES = "operador",
  overrides: Partial<MockAuthContext> = {}
): MockAuthContext {
  const user = createMockUser();
  const carboRole = MOCK_ROLES[role]();
  const carboRoles = [carboRole];
  
  const isCeo = role === "ceo";
  const isGestorAdm = role === "gestorAdm" || isCeo;
  const isGestorFin = role === "gestorFin" || isCeo;
  const isGestorCompras = role === "gestorCompras" || isCeo;
  const isOperadorFiscal = role === "operadorFiscal";
  const isOperador = role === "operador";
  const isAnyGestor = isCeo || isGestorAdm || isGestorFin || isGestorCompras;
  const isAnyOperador = isOperadorFiscal || isOperador;

  return {
    user,
    session: createMockSession(user),
    profile: createMockProfile(),
    roles: [],
    carboRoles,
    isLoading: false,
    passwordMustChange: false,
    tempPasswordExpired: false,
    isAdmin: isCeo,
    isManager: isAnyGestor,
    isCeo,
    isGestorAdm,
    isGestorFin,
    isGestorCompras,
    isOperadorFiscal,
    isOperador,
    isAnyGestor,
    isAnyOperador,
    isLicensee: false,
    isPDV: false,
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ============ HELPER PARA CRIAR CONTEXTO NÃO AUTENTICADO ============

export function createUnauthenticatedContext(): MockAuthContext {
  return {
    user: null,
    session: null,
    profile: null,
    roles: [],
    carboRoles: [],
    isLoading: false,
    passwordMustChange: false,
    tempPasswordExpired: false,
    isAdmin: false,
    isManager: false,
    isCeo: false,
    isGestorAdm: false,
    isGestorFin: false,
    isGestorCompras: false,
    isOperadorFiscal: false,
    isOperador: false,
    isAnyGestor: false,
    isAnyOperador: false,
    isLicensee: false,
    isPDV: false,
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
  };
}
