// js/core/orgContext.js
import { getSupabase } from "./supabaseClient.js";

let cachedOrg = null;

function applyOrgTheme(theme) {
  if (!theme) return;

  const root = document.documentElement;

  if (theme.brand) root.style.setProperty("--brand", theme.brand);
  if (theme.brandSoft) root.style.setProperty("--brand-soft", theme.brandSoft);
  if (theme.brandBorder) root.style.setProperty("--brand-border", theme.brandBorder);
}

function emitOrgUpdated(org) {
  window.dispatchEvent(new CustomEvent("wl:org-updated", { detail: org }));
}

/**
 * Load the active org context (your version already loads correct org for the user).
 * Keeping your existing query style — just ensure it returns the correct org for logged-in user.
 */
export async function loadOrgContext() {
  if (cachedOrg) return cachedOrg;

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, company_logo_url, currency_code, theme")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;

  cachedOrg = data;

  applyOrgTheme(data.theme);
  emitOrgUpdated(data);

  return data;
}

export async function refreshOrgContext() {
  cachedOrg = null;
  return loadOrgContext();
}

export function clearOrgContext() {
  cachedOrg = null;
}
