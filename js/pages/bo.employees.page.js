// js/pages/bo.employees.page.js
// BO sees all employees and can remove any of them
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";
import { createInvite } from "../data/invites.api.js";
import { path } from "../core/config.js";
import { listOrgMembers, deactivateOrgMember } from "../data/members.api.js";
import { checkTierLimits } from "../data/stripe.api.js";

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
content.innerHTML = `
  <h1 style="margin-bottom:4px;">Employees</h1>
  <p style="color:var(--muted);font-size:13px;margin-bottom:20px;">All employees in <strong>${escapeHtml(org.name)}</strong></p>

  <div id="limitsBar" style="margin-bottom:16px;"></div>

  <section class="wl-card wl-panel" style="max-width:640px;margin-bottom:20px;">
    <h2 style="margin-top:0;">Invite an Employee</h2>
    <form id="inviteForm" class="wl-form">
      <label>Email address</label>
      <input id="inviteEmail" type="email" required placeholder="employee@company.com" />
      <button class="wl-btn wl-btn--primary" type="submit">Send invite</button>
    </form>
    <div id="inviteResult" style="margin-top:12px;"></div>
  </section>

  <section>
    <h2>Current Employees</h2>
    <div id="employeesList" class="wl-card wl-panel">Loading…</div>
  </section>
`;

// Load tier limits
try {
  const limits = await checkTierLimits({ orgId: org.id });
  const u = limits.usage;
  content.querySelector("#limitsBar").innerHTML = `
    <div class="wl-card wl-panel" style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;padding:12px 16px;">
      <div style="font-size:13px;">
        <span style="font-weight:700;">Plan:</span> ${escapeHtml(limits.tier || "—")}
      </div>
      <div style="font-size:13px;">
        <span style="font-weight:700;">Employees:</span>
        <span style="color:${u.employees.current >= u.employees.max ? "#dc2626" : "#16a34a"};">
          ${u.employees.current} / ${u.employees.max}
        </span>
      </div>
      <div style="font-size:13px;">
        <span style="font-weight:700;">Managers:</span> ${u.managers.current} / ${u.managers.max}
      </div>
      <div style="font-size:13px;">
        <span style="font-weight:700;">Business Managers:</span> ${u.businessManagers.current} / ${u.businessManagers.max}
      </div>
    </div>`;
} catch (_) { /* limits bar is optional */ }

async function refreshEmployees() {
  const box = content.querySelector("#employeesList");
  box.innerHTML = "Loading…";
  try {
    const rows = await listOrgMembers({ organizationId: org.id, roles: ["EMPLOYEE"] });

    if (!rows.length) {
      box.innerHTML = `<div style="color:var(--muted);">No employees yet.</div>`;
      return;
    }

    box.innerHTML = `<div style="display:grid;gap:8px;">
      ${rows.map(m => `
        <div class="wl-card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;font-size:14px;">Employee</div>
            <div style="font-size:12px;color:var(--muted);">ID: <code>${escapeHtml(m.user_id)}</code></div>
            ${m.email ? `<div style="font-size:12px;">${escapeHtml(m.email)}</div>` : ""}
          </div>
          <button class="wl-btn" data-remove="${escapeHtml(m.user_id)}" style="padding:8px 12px;font-size:13px;">Remove</button>
        </div>
      `).join("")}
    </div>`;

    box.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-remove");
        if (!confirm("Remove this employee from the company?")) return;
        try {
          await deactivateOrgMember({ organizationId: org.id, userId });
          await refreshEmployees();
        } catch (err) {
          alert(err?.message || "Failed to remove employee.");
        }
      });
    });
  } catch (err) {
    box.innerHTML = `<div style="color:#dc2626;">Failed to load employees: ${escapeHtml(err?.message || "")}</div>`;
  }
}

content.querySelector("#inviteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = content.querySelector("#inviteEmail").value.trim();
  const resultEl = content.querySelector("#inviteResult");
  try {
    const res = await createInvite({ organizationId: org.id, email, role: "EMPLOYEE" });
    const inviteUrl = `${window.location.origin}${path(`/accept-invite.html#token=${encodeURIComponent(res.token)}`)}`;
    resultEl.innerHTML = `
      <div class="wl-card" style="padding:12px;">
        <div><strong>Employee invite created</strong></div>
        <div style="font-size:13px;">Email: <code>${escapeHtml(res.invited_email)}</code></div>
        <div style="margin-top:8px;">
          Invite link:<br/>
          <input style="width:100%;padding:8px;font-size:12px;" readonly value="${escapeHtml(inviteUrl)}" onclick="this.select()" />
        </div>
      </div>`;
    content.querySelector("#inviteEmail").value = "";
    await refreshEmployees();
  } catch (err) {
    alert(err?.message || "Failed to create invite.");
  }
});

function escapeHtml(str) {
  return String(str || "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

await refreshEmployees();
