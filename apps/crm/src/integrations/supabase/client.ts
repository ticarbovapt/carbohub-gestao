import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { crossSubdomainStorage, AUTH_STORAGE_KEY } from "@/lib/sso";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// SSO: sessão num cookie .carbohub.com.br (lib/sso.ts), storageKey IDÊNTICO ao
// Hub/Admin → login único do ecossistema.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: crossSubdomainStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});