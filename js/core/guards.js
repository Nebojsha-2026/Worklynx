// js/core/guards.js
import { path } from "./config.js";
import { getSession } from "./session.js";
import { isPlatformAdmin } from "../data/admin.api.js";
import { getMyMemberships } from "../data/members.api.js";
import { pickHighestRole, dashboardPathForRole } from "./roles.js";

export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.replace(path("/login.html"));
    return null;
  }
  return user;
}

/**
 * Enforces correct role dashboard.
 * - If platform admin => always /app/admin/dashboard.html
 * - Else => route to best role dashboard (BO > BM > MANAGER > EMPLOYEE)
 */
export async function enforceRoleRouting() {
  const user = await requireAuth();
  if (!user) return;

  const admin = await isPlatformAdmin(user.id);
  if (admin) {
    const target = (path("/app/admin/dashboard.html"))
    if (window.location.pathname !== target) window.location.replace(target);
    return;
  }

  const memberships = await getMyMemberships();
  const roles = memberships.map((m) => m.role);
  const highest = pickHighestRole(roles);

  if (!highest) {
    // Logged in but not in any org yet: send to pricing or a "create/join org" page later
    window.location.replace(path("/pricing.html"));
    return;
  }

  const target = dashboardPathForRole(highest);
  if (window.location.pathname !== target) window.location.replace(target);
}

/**
 * If user is already logged in and visits login/register,
 * send them to the right dashboard.
 */
export async function redirectIfLoggedIn() {
  const user = await getUser();
  if (!user) return;

  const admin = await isPlatformAdmin(user.id);
  if (admin) {
    window.location.replace (path("/app/admin/dashboard.html"));
    return;
  }

  const memberships = await getMyMemberships();
  const roles = memberships.map((m) => m.role);
  const highest = pickHighestRole(roles);

  if (!highest) {
    window.location.replace (path("/pricing.html"));
    return;
  }

  window.location.replace(dashboardPathForRole(highest));
}
