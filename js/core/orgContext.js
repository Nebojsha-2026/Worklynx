// js/core/orgContext.js
import { getSupabase } from "./supabaseClient.js";

let cachedOrg = null;

/**
 * Apply organization theme to CSS variables.
 * Ensures stale values don't stick if a field is removed.
 */
function applyOrgTheme(theme) {
  const root = document.documentElement;

  // Always reset to defaults first (prevents stale vars lingering)
  root.style.removeProperty("--brand");
  root.style.removeProperty("--brand-soft");
  root.style.removeProperty("--brand-border");

  if (!theme) return;

  if (theme.brand) root.style.setProperty("--brand", theme.brand);
  if (theme.brandSoft) root.style.setProperty("--brand-soft", theme.brandSoft);
  if (theme.brandBorder) root.style.setProperty("--brand-border", theme.brandBorder);
}

/**
 * Load the active organization for the logged-in user.
 * For now: most recently created org (later: select by org_members).
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
  if (!data) throw new Error("Organization not found.");

  cachedOrg = data;

  // Apply theme after loading
  applyOrgTheme(data.theme);

  return data;
}

/**
 * Force-refresh org context (use after BO saves settings).
 */
export async function refreshOrgContext() {
  cachedOrg = null;
  return loadOrgContext();
}

export function clearOrgContext() {
  cachedOrg = null;
}
