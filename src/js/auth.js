import { supabase } from './supabaseClient.js';

export async function login(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function logout() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}
