// js/core/session.js
import { getSupabase } from "./supabaseClient.js";

export async function getSession() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function getUser() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user || null;
}

export function onAuthStateChange(callback) {
  const supabase = getSupabase();
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session || null);
  });
}

