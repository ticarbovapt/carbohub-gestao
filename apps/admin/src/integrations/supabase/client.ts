import { createClient } from "@supabase/supabase-js";
import { crossSubdomainStorage, AUTH_STORAGE_KEY } from "@/lib/sso";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error("[Admin] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ausentes.");
}

// Supabase compartilhado do ecossistema. SSO: sessão num cookie .carbohub.com.br
// (lib/sso.ts), storageKey IDÊNTICO ao Hub/CRM → login único.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: crossSubdomainStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
