// js/ui/sidebar.js
import { path } from "../core/config.js";

const NAV = {
  BO: [
    ["Dashboard", "/app/bo/dashboard.html"],
    ["Managers", "/app/bo/managers.html"],
    ["Employees", "/app/bo/employees.html"],
    ["Reports", "/app/bo/reports.html"],
    ["Billing", "/app/bo/billing.html"],
    ["Settings", "/app/bo/settings.html"],
  ],
  BM: [
    ["Dashboard", "/app/bm/dashboard.html"],
    ["Shifts", "/app/bm/shifts.html"],
    ["Approvals", "/app/bm/approvals.html"],
    ["Managers", "/app/bm/managers.html"],
    ["Employees", "/app/bm/employees.html"],
    ["Reports", "/app/bm/reports.html"],
  ],
  MANAGER: [
    ["Dashboard", "/app/manager/dashboard.html"],
    ["Shifts", "/app/manager/shifts.html"],
    ["♻ Recurring Series", "/app/manager/recurring-series.html"], // ✅ STEP 4
    ["Create shift", "/app/manager/create-shift.html"],
    ["Team", "/app/manager/team.html"],
    ["Approvals", "/app/manager/approvals.html"],
  ],
  EMPLOYEE: [
    ["Dashboard", "/app/employee/dashboard.html"],
    ["My shifts", "/app/employee/my-shifts.html"],
    ["Timesheets", "/app/employee/timesheets.html"],
    ["Profile", "/app/employee/profile.html"],
  ],
};

export function renderSidebar(role, activePath = window.location.pathname) {
  const aside = document.createElement("aside");
  aside.className = "wl-sidebar wl-card";

  const items = NAV[role] || [];

  aside.innerHTML = `
    <div style="font-weight:800; margin-bottom:10px; opacity:.9;">Menu</div>
    <nav class="wl-snav">
      ${items
        .map(([label, href]) => {
          const full = path(href);
          const active = activePath.endsWith(href) ? " is-active" : "";
          return `<a class="wl-snav__item${active}" href="${full}">${label}</a>`;
        })
        .join("")}
    </nav>
  `;

  return aside;
}
