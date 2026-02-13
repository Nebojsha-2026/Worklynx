// js/core/orgContext.js
import { getSupabase } from "./supabaseClient.js";
import { getSession } from "./session.js";

let cachedOrg = null;

const ACTIVE_ORG_KEY = "wl_active_org_id";

/**
 * Emit org updates so header + UI can update live.
 */
function emitOrgUpdated(org) {
  window.dispatchEvent(new CustomEvent("wl:org-updated", { detail: org }));
}

/**
 * Apply organization theme to CSS variables.
 * Ensures stale values don't stick if a field is removed.
 */
function applyOrgTheme(theme) {
  const root = document.documentElement;

  // Reset first (prevents stale vars lingering)
  root.style.removeProperty("--brand");
  root.style.removeProperty("--brand-soft");
  root.style.removeProperty("--brand-border");

  if (!theme) return;

  if (theme.brand) root.style.setProperty("--brand", theme.brand);
  if (theme.brandSoft) root.style.setProperty("--brand-soft", theme.brandSoft);
  if (theme.brandBorder) root.style.setProperty("--brand-border", theme.brandBorder);
}

/**
 * Persist active org selection (for multi-org users).
 */
export function setActiveOrgId(orgId) {
  if (!orgId) return;
  try {
    localStorage.setItem(ACTIVE_ORG_KEY, String(orgId));
  } catch (_) {}
  cachedOrg = null;
}

export function getActiveOrgId() {
  try {
    return localStorage.getItem(ACTIVE_ORG_KEY);
  } catch (_) {
    return null;
  }
}

/**
 * Load the active organization for the logged-in user via org_members.
 * Returns org object + attaches member_role.
 */
export async function loadOrgContext() {
  if (cachedOrg) return cachedOrg;

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  const supabase = getSupabase();
  const preferredOrgId = getActiveOrgId();

  // 1) If user has a preferred org saved, try load that membership first
  if (preferredOrgId) {
    const { data: row, error } = await supabase
      .from("org_members")
      .select(
        `
        role,
        organization:organizations(
          id, name, company_logo_url, currency_code, theme
        )
      `
      )
      .eq("user_id", userId)
      .eq("organization_id", preferredOrgId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!error && row?.organization) {
      cachedOrg = { ...row.organization, member_role: row.role };
      applyOrgTheme(cachedOrg.theme);
      emitOrgUpdated(cachedOrg);
      return cachedOrg;
    }
    // If it failed (org removed / user no longer member), fall through to default.
  }

  // 2) Default: most recent active membership for this user
  const { data, error } = await supabase
    .from("org_members")
    .select(
      `
      role,
      organization:organizations(
        id, name, company_logo_url, currency_code, theme
      )
    `
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;
  if (!data?.organization) throw new Error("No organization membership found.");

  // Save as active org for next time
  setActiveOrgId(data.organization.id);

  cachedOrg = { ...data.organization, member_role: data.role };
  applyOrgTheme(cachedOrg.theme);
  emitOrgUpdated(cachedOrg);

  return cachedOrg;
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
