// js/core/orgContext.js
import { getSupabase } from "./supabaseClient.js";
import { getSession } from "./session.js";

let cachedOrg = null;

const ACTIVE_ORG_KEY = "wl_active_org_id";

/* ---------- helpers ---------- */
function emitOrgUpdated(org) {
  window.dispatchEvent(new CustomEvent("wl:org-updated", { detail: org }));
}

function hexToRgb(hex) {
  const x = String(hex || "").replace("#", "").trim();
  if (x.length !== 6) return null;
  const r = parseInt(x.slice(0, 2), 16);
  const g = parseInt(x.slice(2, 4), 16);
  const b = parseInt(x.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function deriveTheme(theme) {
  if (!theme) return null;

  // If theme.brand exists but soft/border missing, derive them
  const brand = theme.brand || null;
  if (!brand) return theme;

  const rgb = hexToRgb(brand);
  if (!rgb) return theme;

  return {
    ...theme,
    brand,
    brandSoft: theme.brandSoft || `rgba(${rgb.r},${rgb.g},${rgb.b},0.14)`,
    brandBorder: theme.brandBorder || `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`,
  };
}

/**
 * Apply org theme -> CSS variables.
 * Reset first so stale values don't remain.
 */
function applyOrgTheme(theme) {
  const root = document.documentElement;

  // reset (prevents stale vars lingering)
  root.style.removeProperty("--brand");
  root.style.removeProperty("--brand-soft");
  root.style.removeProperty("--brand-border");

  const t = deriveTheme(theme);
  if (!t) return;

  if (t.brand) root.style.setProperty("--brand", t.brand);
  if (t.brandSoft) root.style.setProperty("--brand-soft", t.brandSoft);
  if (t.brandBorder) root.style.setProperty("--brand-border", t.brandBorder);
}

/* ---------- active org selection ---------- */
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

/* ---------- main ---------- */
/**
 * Loads the active organization for the LOGGED-IN USER using org_members.
 * Returns org + member_role.
 */
export async function loadOrgContext() {
  if (cachedOrg) return cachedOrg;

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  const supabase = getSupabase();
  const preferredOrgId = getActiveOrgId();

  // 1) Try preferred org first
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
  }

  // 2) Default: most recent active membership
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
