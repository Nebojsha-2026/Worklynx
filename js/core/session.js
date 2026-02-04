
import { getSupabase } from "./supabaseClient.js";

export async function getSession() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

// Safe: returns null if not logged in (no throwing)
export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export function onAuthStateChange(callback) {
  const supabase = getSupabase();
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ?? null);
  });
}