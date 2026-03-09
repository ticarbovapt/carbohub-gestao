/**
 * Supabase Mock - Mock do cliente Supabase para testes
 * 
 * Permite simular interações com o banco de dados sem
 * dependência de ambiente real.
 */

import { vi } from "vitest";

// ============ TIPO DO MOCK ============

export interface MockSupabaseResponse<T> {
  data: T | null;
  error: { message: string; code: string } | null;
}

// ============ BUILDER DE QUERY MOCK ============

export class MockQueryBuilder<T = unknown> {
  private mockData: T | T[] | null = null;
  private mockError: { message: string; code: string } | null = null;

  constructor(private tableName: string) {}

  select(_columns?: string) {
    return this;
  }

  insert(_data: Partial<T> | Partial<T>[]) {
    return this;
  }

  update(_data: Partial<T>) {
    return this;
  }

  delete() {
    return this;
  }

  eq(_column: string, _value: unknown) {
    return this;
  }

  neq(_column: string, _value: unknown) {
    return this;
  }

  in(_column: string, _values: unknown[]) {
    return this;
  }

  order(_column: string, _options?: { ascending?: boolean }) {
    return this;
  }

  limit(_count: number) {
    return this;
  }

  range(_from: number, _to: number) {
    return this;
  }

  single() {
    return this.execute();
  }

  maybeSingle() {
    return this.execute();
  }

  // Permite configurar o retorno do mock
  mockReturnData(data: T | T[] | null) {
    this.mockData = data;
    return this;
  }

  mockReturnError(message: string, code = "PGRST116") {
    this.mockError = { message, code };
    return this;
  }

  async execute(): Promise<MockSupabaseResponse<T | T[]>> {
    return {
      data: this.mockData,
      error: this.mockError,
    };
  }

  // Suporte para await direto
  then<TResult = MockSupabaseResponse<T | T[]>>(
    onfulfilled?: ((value: MockSupabaseResponse<T | T[]>) => TResult | PromiseLike<TResult>) | null
  ): Promise<TResult> {
    return this.execute().then(onfulfilled);
  }
}

// ============ MOCK DO CLIENTE SUPABASE ============

export interface MockSupabaseClient {
  from: (table: string) => MockQueryBuilder;
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<MockSupabaseResponse<unknown>>;
  auth: {
    getSession: () => Promise<{ data: { session: unknown | null }; error: null }>;
    getUser: () => Promise<{ data: { user: unknown | null }; error: null }>;
    signInWithPassword: (credentials: { email: string; password: string }) => Promise<MockSupabaseResponse<unknown>>;
    signUp: (credentials: { email: string; password: string }) => Promise<MockSupabaseResponse<unknown>>;
    signOut: () => Promise<{ error: null }>;
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => { data: { subscription: { unsubscribe: () => void } } };
  };
  storage: {
    from: (bucket: string) => {
      upload: (path: string, file: File) => Promise<MockSupabaseResponse<{ path: string }>>;
      download: (path: string) => Promise<MockSupabaseResponse<Blob>>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
  channel: (name: string) => {
    on: (event: string, filter: unknown, callback: (payload: unknown) => void) => MockSupabaseClient["channel"];
    subscribe: () => { unsubscribe: () => void };
  };
}

export function createMockSupabaseClient(): MockSupabaseClient {
  const queryBuilders: Map<string, MockQueryBuilder> = new Map();

  return {
    from: (table: string) => {
      if (!queryBuilders.has(table)) {
        queryBuilders.set(table, new MockQueryBuilder(table));
      }
      return queryBuilders.get(table)!;
    },

    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),

    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },

    storage: {
      from: (_bucket: string) => ({
        upload: vi.fn().mockResolvedValue({ data: { path: "test-path" }, error: null }),
        download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://test-url.com" } }),
      }),
    },

    channel: (_name: string) => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }) as unknown as ReturnType<MockSupabaseClient["channel"]>,
  };
}

// ============ HELPER PARA MOCK DO MÓDULO ============

export function mockSupabaseModule() {
  const mockClient = createMockSupabaseClient();
  
  vi.mock("@/integrations/supabase/client", () => ({
    supabase: mockClient,
  }));

  return mockClient;
}
