// js/core/auth.js
import { getSupabase } from "./supabaseClient.js";

export async function signUpWithEmail(email, password, fullName) {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || "" },
    },
  });
  if (error) throw error;

  // Optional: create profile row (works if you later add insert policy or do it server-side)
  // For now, we’ll rely on auth metadata and you can add a trigger later.

  return data;
}

export async function signInWithEmail(email, password) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const supabase = getSupabase();
  const redirectTo = `${window.location.origin}/reset-password.html`;

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
  return data;
}

export async function updatePassword(newPassword) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}
