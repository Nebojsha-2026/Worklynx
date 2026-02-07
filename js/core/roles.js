// js/core/roles.js
import { path } from "./config.js";

export const ROLE_PRIORITY = ["BO", "BM", "MANAGER", "EMPLOYEE"];

export function pickHighestRole(roles) {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return null;
}

export function dashboardPathForRole(role) {
  switch (role) {
    case "BO": return path("/app/bo/dashboard.html");
    case "BM": return path("/app/bm/dashboard.html");
    case "MANAGER": return path("/app/manager/dashboard.html");
    case "EMPLOYEE": return path("/app/employee/dashboard.html");
    default: return path("/login.html");
  }
}

