// js/core/guards.js
import { path } from "./config.js";
import { getSession } from "./session.js";
import { isPlatformAdmin } from "../data/admin.api.js";
import { getMyMemberships } from "../data/members.api.js";
import { pickHighestRole, dashboardPathForRole } from "./roles.js";

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    window.location.replace(path("/login.html"));
    return null;
  }
  return session.user;
}

export async function redirectIfLoggedIn() {
  const session = await getSession();
  const user = session?.user;
  if (!user) return;

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
 * Does NOT force dashboard redirect if the role is allowed.
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
