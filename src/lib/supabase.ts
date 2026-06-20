import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

console.debug('Supabase Init - URL present:', !!supabaseUrl);
console.debug('Supabase Init - Key length:', supabaseAnonKey.length);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing. Check .env file and VITE_ prefix.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
