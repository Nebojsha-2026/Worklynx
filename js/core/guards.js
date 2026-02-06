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
