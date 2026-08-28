import { createClient } from "@supabase/supabase-js";
import { crossSubdomainStorage, AUTH_STORAGE_KEY } from "@/lib/sso";

// Projeto Supabase compartilhado do ecossistema. As envs VITE_* têm prioridade;
// se ausentes (ex.: deploy na Vercel ainda sem config), cai no padrão — assim o
// app não fica em tela branca. A anon key é PÚBLICA por design (segurança = RLS).
const DEFAULT_SUPABASE_URL = "https://wpkfirmapxevzpxjovjr.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwa2Zpcm1hcHhldnpweGpvdmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDQwMzAsImV4cCI6MjA5MjQ4MDAzMH0.WIqNNoO77SNQu_WvixRH_a5J3kZYSo2HEwkaXGyaPB8";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || DEFAULT_SUPABASE_ANON_KEY;

/** Base das edge functions.
 *
 * ⚠️ Existe porque `supabase.functions.invoke` serializa o corpo como JSON, e
 * upload de arquivo precisa de `multipart/form-data` — pelo invoke o FormData
 * chegaria vazio do outro lado. Ler `(supabase as any).supabaseUrl` funcionaria
 * hoje, mas é propriedade interna da biblioteca: exportar daqui é o mesmo dado
 * sem depender do que a próxima versão dela resolva esconder.
 *
 * Veio junto com a tela de Conversas, portada do `admin` em 28/08/2026 — o
 * `useConversas` a usa para enviar foto, documento e áudio ao cliente. */
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// SSO: sessão num cookie .carbohub.com.br (lib/sso.ts), storageKey IDÊNTICO ao
// Hub/CRM/Ops → login único entre os subdomínios.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: crossSubdomainStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
