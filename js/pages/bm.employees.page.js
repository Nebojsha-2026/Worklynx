// js/pages/bm.employees.page.js
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { loadOrgContext } from "../core/orgContext.js";
import { requireRole } from "../core/guards.js";
import { path } from "../core/config.js";
import { createInvite } from "../data/invites.api.js";
import { renderSidebar } from "../ui/sidebar.js";


await requireRole(["BO", "BM"]); // For now: only BO/BM can invite employees (we’ll add MANAGER later)

const org = await loadOrgContext();

document.body.prepend(
  renderHeader({
    companyName: org.name,
    companyLogoUrl: org.company_logo_url,
  })
);

document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.innerHTML = `
  <h1>Employees</h1>
  <p>Invite employees to join <strong>${org.name}</strong>.</p>

  <section class="wl-card" style="padding:16px; max-width:720px;">
    <h2 style="margin-top:0;">Invite an employee</h2>

    <form id="inviteEmployeeForm" class="wl-form">
      <label>Email</label>
      <input id="employeeEmail" type="email" required placeholder="employee@company.com" />

      <button class="wl-btn" type="submit">Create invite</button>
    </form>

    <div id="inviteEmployeeResult" style="margin-top:12px;"></div>
  </section>

  <section style="margin-top:16px;">
    <h2>Employee list (next step)</h2>
    <p>We’ll show employees in this org here after invites are working.</p>
  </section>
`;

document.querySelector("#inviteEmployeeForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.querySelector("#employeeEmail").value.trim();

  try {
    const res = await createInvite({
      organizationId: org.id,
      email,
      role: "EMPLOYEE",
    });

    const inviteUrl =
      `${window.location.origin}` +
      path(`/accept-invite.html#token=${encodeURIComponent(res.token)}`);

    document.querySelector("#inviteEmployeeResult").innerHTML = `
      <div class="wl-card" style="padding:12px;">
        <div><strong>Employee invite created</strong></div>
        <div>Email: <code>${res.invited_email}</code></div>
        <div>Role: <code>${res.invited_role}</code></div>
        <div style="margin-top:8px;">
          Invite link:<br/>
          <input style="width:100%; padding:8px;" readonly value="${inviteUrl}" />
        </div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    alert(err.message || "Failed to create employee invite.");
  }
});
