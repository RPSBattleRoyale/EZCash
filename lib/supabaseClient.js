import { createClient } from '@supabase/supabase-js';

// Use service_role key (keep it secret! Only in serverless functions)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
