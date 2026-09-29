export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}
if (!API_BASE_URL) {
  console.warn('Missing VITE_API_BASE_URL in .env');
}
