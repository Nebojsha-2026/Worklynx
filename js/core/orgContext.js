// js/core/orgContext.js
import { getSupabase } from "./supabaseClient.js";

let cachedOrg = null;

/**
 * Apply organization theme to CSS variables.
 */
function applyOrgTheme(theme) {
  if (!theme) return;

  const root = document.documentElement;

  if (theme.brand) {
    root.style.setProperty("--brand", theme.brand);
  }

  if (theme.brandSoft) {
    root.style.setProperty("--brand-soft", theme.brandSoft);
  }

  if (theme.brandBorder) {
    root.style.setProperty("--brand-border", theme.brandBorder);
  }
}

/**
 * Load the active organization for the logged-in user.
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

  // ✅ Apply theme after loading
  applyOrgTheme(data.theme);

  return data;
}

export function clearOrgContext() {
  cachedOrg = null;
}
