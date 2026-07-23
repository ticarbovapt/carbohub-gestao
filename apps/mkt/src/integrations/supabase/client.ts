import { createClient } from "@supabase/supabase-js";
import { crossSubdomainStorage, AUTH_STORAGE_KEY } from "@/lib/sso";

// Projeto Supabase compartilhado do ecossistema. As envs VITE_* têm prioridade;
// se ausentes (ex.: preview na Vercel sem config), cai no padrão — assim o app
// não fica em tela branca. A anon key é PÚBLICA por design (segurança = RLS).
const DEFAULT_SUPABASE_URL = "https://wpkfirmapxevzpxjovjr.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwa2Zpcm1hcHhldnpweGpvdmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDQwMzAsImV4cCI6MjA5MjQ4MDAzMH0.WIqNNoO77SNQu_WvixRH_a5J3kZYSo2HEwkaXGyaPB8";

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || DEFAULT_SUPABASE_ANON_KEY;

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
