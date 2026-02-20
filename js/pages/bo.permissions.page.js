// js/pages/bo.permissions.page.js
// BO Permissions: Clear overview of what each role can and cannot do
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";

await requireRole(["BO"]);

const org = await loadOrgContext();

document.body.prepend(
  renderHeader({ companyName: org.name, companyLogoUrl: org.company_logo_url })
);
document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.innerHTML = `
  <div class="wl-shell">
    <div id="wlSidebar"></div>
    <div id="wlContent"></div>
  </div>
`;
main.querySelector("#wlSidebar").append(renderSidebar("BO"));

const content = main.querySelector("#wlContent");

const permissions = [
  {
    category: "Account & Invites",
    rows: [
      { action: "Create subscription / account",      bo: true,  bm: false, manager: false, employee: false },
      { action: "Invite Business Manager",             bo: true,  bm: false, manager: false, employee: false },
      { action: "Invite Manager",                      bo: true,  bm: true,  manager: false, employee: false },
      { action: "Invite Employee",                     bo: true,  bm: true,  manager: true,  employee: false },
      { action: "Remove Business Manager",             bo: true,  bm: false, manager: false, employee: false },
      { action: "Remove Manager",                      bo: true,  bm: true,  manager: false, employee: false },
      { action: "Remove Employee",                     bo: true,  bm: true,  manager: true,  employee: false },
      { action: "Remove Business Owner",               bo: true,  bm: false, manager: false, employee: false },
    ],
  },
  {
    category: "Shifts",
    rows: [
      { action: "Create shifts",                       bo: true,  bm: true,  manager: true,  employee: false },
      { action: "Edit / cancel shifts",                bo: true,  bm: true,  manager: true,  employee: false },
      { action: "View all shifts",                     bo: true,  bm: true,  manager: true,  employee: false },
      { action: "View own assigned shifts",            bo: false, bm: false, manager: false, employee: true  },
      { action: "Assign employees to shifts",          bo: true,  bm: true,  manager: true,  employee: false },
      { action: "Create recurring shifts",             bo: true,  bm: true,  manager: true,  employee: false },
    ],
  },
  {
    category: "Timesheets",
    rows: [
      { action: "Clock in / clock out",                bo: false, bm: false, manager: false, employee: true  },
      { action: "Submit timesheet",                    bo: false, bm: false, manager: false, employee: true  },
      { action: "Approve timesheets",                  bo: true,  bm: true,  manager: true,  employee: false },
      { action: "View all timesheets",                 bo: true,  bm: true,  manager: true,  employee: false },
      { action: "View own timesheets",                 bo: false, bm: false, manager: false, employee: true  },
    ],
  },
  {
    category: "Reports & Billing",
    rows: [
      { action: "View labour cost reports",            bo: true,  bm: true,  manager: false, employee: false },
      { action: "View employee breakdown reports",     bo: true,  bm: true,  manager: false, employee: false },
      { action: "View billing / subscription",         bo: true,  bm: false, manager: false, employee: false },
      { action: "Upgrade / change plan",               bo: true,  bm: false, manager: false, employee: false },
    ],
  },
  {
    category: "Organisation Settings",
    rows: [
      { action: "Change company name / logo",          bo: true,  bm: false, manager: false, employee: false },
      { action: "Change currency",                     bo: true,  bm: false, manager: false, employee: false },
      { action: "View permissions overview",           bo: true,  bm: false, manager: false, employee: false },
    ],
  },
];

function tick(val) {
  return val
    ? `<span style="color:#16a34a;font-size:18px;font-weight:900;" title="Allowed">✓</span>`
    : `<span style="color:#dc2626;font-size:16px;opacity:.5;" title="Not allowed">✕</span>`;
}

content.innerHTML = `
  <div style="margin-bottom:24px;">
    <h1 style="margin:0;">Permissions</h1>
    <p style="margin:6px 0 0;color:var(--muted);font-size:13px;">
      Overview of what each role can do in <strong>${escapeHtml(org.name)}</strong>.
      Role permissions are fixed by the system and cannot be changed.
    </p>
  </div>

  ${permissions.map(section => `
    <div class="wl-card wl-panel" style="margin-bottom:16px;">
      <h2 style="margin-top:0;font-size:16px;border-bottom:2px solid var(--wl-border);padding-bottom:10px;margin-bottom:12px;">
        ${escapeHtml(section.category)}
      </h2>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:1px solid var(--wl-border);">
              <th style="padding:8px 12px;text-align:left;font-weight:700;min-width:220px;">Permission</th>
              <th style="padding:8px 12px;text-align:center;font-weight:700;color:#7c3aed;">Business Owner</th>
              <th style="padding:8px 12px;text-align:center;font-weight:700;color:#0369a1;">Business Manager</th>
              <th style="padding:8px 12px;text-align:center;font-weight:700;color:#0f766e;">Manager</th>
              <th style="padding:8px 12px;text-align:center;font-weight:700;color:#64748b;">Employee</th>
            </tr>
          </thead>
          <tbody>
            ${section.rows.map((r, i) => `
              <tr style="${i % 2 === 0 ? "background:var(--surface-2,#f9fafb);" : ""}border-bottom:1px solid var(--wl-border);">
                <td style="padding:8px 12px;">${escapeHtml(r.action)}</td>
                <td style="padding:8px 12px;text-align:center;">${tick(r.bo)}</td>
                <td style="padding:8px 12px;text-align:center;">${tick(r.bm)}</td>
                <td style="padding:8px 12px;text-align:center;">${tick(r.manager)}</td>
                <td style="padding:8px 12px;text-align:center;">${tick(r.employee)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `).join("")}

  <div class="wl-card wl-panel" style="background:var(--brand-soft,#f0f7ff);border-color:var(--brand-border,#bfdbfe);">
    <p style="margin:0;font-size:13px;color:var(--muted);">
      <strong>Note:</strong> These permissions are enforced by the system. Employees and Managers cannot create accounts independently — they must be invited by an authorised role.
    </p>
  </div>
`;

function escapeHtml(str) {
  return String(str || "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
