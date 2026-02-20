// js/core/guards.js
import { path } from "./config.js";
import { getSession } from "./session.js";
import { isPlatformAdmin } from "../data/admin.api.js";
import { getMyMemberships } from "../data/members.api.js";
import { pickHighestRole, dashboardPathForRole } from "./roles.js";
import { needsMfaVerification } from "./auth.js";

export async function requireAuth() {
  const session = await getSession();
  const user = session?.user;

  if (!user) {
    window.location.replace(path("/login.html"));
    return null;
  }

  // ── Email verification gate ───────────────────────────────────────────────
  // Supabase sets email_confirmed_at once the user clicks the link in their inbox.
  // Until that happens we sign them out and redirect to a friendly holding page.
  if (!user.email_confirmed_at) {
    const { getSupabase } = await import("./supabaseClient.js");
    await getSupabase().auth.signOut();
    // Pass their email so the holding page can offer a "resend" button
    const encoded = encodeURIComponent(user.email ?? "");
    window.location.replace(path(`/verify-email.html?email=${encoded}`));
    return null;
  }

  // ── MFA gate ─────────────────────────────────────────────────────────────
  // If the user has enrolled 2FA but hasn't completed it this session, send
  // them to the MFA challenge page before they reach any protected content.
  if (await needsMfaVerification()) {
    window.location.replace(path("/verify-mfa.html"));
    return null;
  }

  return user;
}

export async function redirectIfLoggedIn() {
  const session = await getSession();
  const user = session?.user;
  if (!user) return;

  // Don't redirect unverified users — let them stay on login/register
  // so they can see the "check your inbox" message.
  if (!user.email_confirmed_at) return;

  const admin = await isPlatformAdmin(user.id);
  if (admin) {
    window.location.replace(path("/app/admin/dashboard.html"));
    return;
  }

  const memberships = await getMyMemberships();
  const roles = memberships.map((m) => m.role);
  const highest = pickHighestRole(roles);

  if (!highest) {
    window.location.replace(path("/pricing.html"));
    return;
  }

  window.location.replace(dashboardPathForRole(highest));
}

export async function enforceRoleRouting() {
  const user = await requireAuth();
  if (!user) return;

  const admin = await isPlatformAdmin(user.id);
  if (admin) {
    const target = path("/app/admin/dashboard.html");
    if (window.location.pathname !== target) window.location.replace(target);
    return;
  }

  const memberships = await getMyMemberships();
  const roles = memberships.map((m) => m.role);
  const highest = pickHighestRole(roles);

  if (!highest) {
    window.location.replace(path("/pricing.html"));
    return;
  }

  const target = dashboardPathForRole(highest);
  if (window.location.pathname !== target) window.location.replace(target);
}

/**
 * Require authentication and require that the user's highest role is in allowedRoles.
 * Email verification + MFA are enforced via requireAuth().
 */
export async function requireRole(allowedRoles = []) {
  const user = await requireAuth();
  if (!user) return null;

  const admin = await isPlatformAdmin(user.id);
  if (admin) return { user, role: "ADMIN" };

  const memberships = await getMyMemberships();
  const roles = memberships.map((m) => m.role);
  const highest = pickHighestRole(roles);

  if (!highest) {
    window.location.replace(path("/pricing.html"));
    return null;
  }

  if (!allowedRoles.includes(highest)) {
    window.location.replace(dashboardPathForRole(highest));
    return null;
  }

  return { user, role: highest };
}
