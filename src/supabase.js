import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseClient = null;

export function getSupabaseClient(token = null) {
  if (supabaseClient && token === null) {
    // Return existing client if no token provided (anonymous mode)
    return supabaseClient;
  }

  const options = token
    ? {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    : {};

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, options);
  return supabaseClient;
}

// For convenience, export a default client (will be overwritten after login)
export const supabase = getSupabaseClient();
