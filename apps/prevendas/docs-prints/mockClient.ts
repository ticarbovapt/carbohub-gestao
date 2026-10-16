// Cliente Supabase FALSO dos prints da Documentação (docs-prints/README.md).
// Só existe no `vite.config.ts` desta pasta: o build do app nunca o vê.
// Cliente Supabase falso: qualquer cadeia de consulta resolve a partir de
// FIXTURES (tabela/rpc → linhas), com eq/in/is/neq/gte/lte aplicados.
import { FIXTURES, RPC, USUARIO } from "./fixtures";

export const FUNCTIONS_URL = "http://localhost/functions/v1";
const LOG = (window as unknown as { __mockLog: string[] }).__mockLog = [];

type Filtro = (r: Record<string, unknown>) => boolean;
function builder(tabela: string) {
  const filtros: Filtro[] = [];
  let unico: "single" | "maybe" | null = null;
  let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  let payload: unknown = null;
  let limite: number | null = null;
  const resolver = async () => {
    LOG.push(`${op} ${tabela}`);
    if (op !== "select") {
      const d = Array.isArray(payload) ? payload : payload ? [payload] : [];
      const linhas = d.map((x) => ({ id: crypto.randomUUID(), ...(x as object) }));
      return { data: unico ? linhas[0] ?? null : linhas, error: null, count: linhas.length };
    }
    const fonte = FIXTURES[tabela];
    let linhas = (typeof fonte === "function" ? fonte() : fonte ?? []) as Record<string, unknown>[];
    linhas = linhas.filter((r) => filtros.every((f) => f(r)));
    if (limite != null) linhas = linhas.slice(0, limite);
    if (unico) return { data: linhas[0] ?? null, error: null };
    return { data: linhas, error: null, count: linhas.length };
  };
  const campo = (r: Record<string, unknown>, c: string) => {
    if (c.includes("->")) return undefined;
    return r[c];
  };
  const tem = (r: Record<string, unknown>, c: string) => c in r && !c.includes("->");
  const b: Record<string, unknown> = {};
  const self = new Proxy(b, {
    get(_t, prop: string) {
      if (prop === "then") return (ok: (v: unknown) => void, err: (e: unknown) => void) => resolver().then(ok, err);
      if (prop === "single") return () => { unico = "single"; return self; };
      if (prop === "maybeSingle") return () => { unico = "maybe"; return self; };
      if (prop === "insert" || prop === "update" || prop === "upsert") return (p: unknown) => { op = prop; payload = p; return self; };
      if (prop === "delete") return () => { op = "delete"; return self; };
      if (prop === "limit") return (n: number) => { limite = n; return self; };
      if (prop === "eq") return (c: string, v: unknown) => { filtros.push((r) => !tem(r, c) || String(campo(r, c)) === String(v)); return self; };
      if (prop === "neq") return (c: string, v: unknown) => { filtros.push((r) => !tem(r, c) || String(campo(r, c)) !== String(v)); return self; };
      if (prop === "in") return (c: string, v: unknown[]) => { filtros.push((r) => !tem(r, c) || v.map(String).includes(String(campo(r, c)))); return self; };
      if (prop === "is") return (c: string, v: unknown) => { filtros.push((r) => !tem(r, c) || (v === null ? campo(r, c) == null : campo(r, c) === v)); return self; };
      if (prop === "gte") return (c: string, v: unknown) => { filtros.push((r) => !tem(r, c) || campo(r, c) == null || String(campo(r, c)) >= String(v)); return self; };
      if (prop === "lte") return (c: string, v: unknown) => { filtros.push((r) => !tem(r, c) || campo(r, c) == null || String(campo(r, c)) <= String(v)); return self; };
      return () => self;
    },
  });
  return self;
}

let sessao: unknown = { access_token: "x", user: USUARIO.auth };
const subs: ((e: string, s: unknown) => void)[] = [];
const canal = () => {
  const c: Record<string, unknown> = {};
  const p: unknown = new Proxy(c, { get: (_t, k) => (k === "subscribe" ? (cb?: (s: string) => void) => { cb?.("SUBSCRIBED"); return p; } : () => p) });
  return p;
};
export const supabase = {
  from: (t: string) => builder(t),
  rpc: (nome: string, args?: Record<string, unknown>) => {
    LOG.push(`rpc ${nome}`);
    const f = RPC[nome];
    const data = typeof f === "function" ? f(args ?? {}) : f ?? null;
    const p = Promise.resolve({ data, error: null });
    return Object.assign(p, { single: () => p, maybeSingle: () => p, select: () => p, throwOnError: () => p });
  },
  channel: () => canal(),
  removeChannel: async () => "ok",
  removeAllChannels: async () => [],
  getChannels: () => [],
  storage: { from: () => ({
    getPublicUrl: (p: string) => ({ data: { publicUrl: `/docs-mock/${p}` } }),
    createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }),
    createSignedUrls: async () => ({ data: [], error: null }),
    upload: async () => ({ data: { path: "x" }, error: null }),
    remove: async () => ({ data: [], error: null }),
    list: async () => ({ data: [], error: null }),
  }) },
  functions: { invoke: async () => ({ data: null, error: null }) },
  auth: {
    getSession: async () => ({ data: { session: sessao } }),
    getUser: async () => ({ data: { user: (sessao as { user?: unknown } | null)?.user ?? null }, error: null }),
    onAuthStateChange: (f: (e: string, s: unknown) => void) => {
      subs.push(f); setTimeout(() => f("INITIAL_SESSION", sessao), 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    signInWithPassword: async () => ({ data: { session: sessao }, error: null }),
    signOut: async () => { sessao = null; subs.forEach((f) => f("SIGNED_OUT", null)); return { error: null }; },
    updateUser: async () => ({ data: {}, error: null }),
    refreshSession: async () => ({ data: { session: sessao }, error: null }),
  },
};
