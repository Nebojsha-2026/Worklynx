// js/core/roles.js
export const ROLE_PRIORITY = ["BO", "BM", "MANAGER", "EMPLOYEE"];

export function pickHighestRole(roles) {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return null;
}

export function dashboardPathForRole(role) {
  switch (role) {
    case "BO":
      return "/app/bo/dashboard.html";
    case "BM":
      return "/app/bm/dashboard.html";
    case "MANAGER":
      return "/app/manager/dashboard.html";
    case "EMPLOYEE":
      return "/app/employee/dashboard.html";
    default:
      return "/login.html";
  }
}

