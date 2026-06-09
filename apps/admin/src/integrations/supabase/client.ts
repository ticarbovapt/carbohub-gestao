import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error("[Admin] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ausentes.");
}

// Supabase compartilhado do ecossistema. O Admin escreve a identidade
// (profiles, user_roles) reusando a edge function create-team-member.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
