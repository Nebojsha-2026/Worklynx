// js/pages/manager/team.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { createInvite } from "../../data/invites.api.js";
import { path } from "../../core/config.js";

await requireRole(["MANAGER", "BM", "BO"]); // managers (and higher roles) can use Team

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
  <div class="wl-shell">
    <div id="wlSidebar"></div>
    <div id="wlContent"></div>
  </div>
`;

main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
    <h1 style="margin:0;">Team</h1>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px; max-width:760px;">
    <h2 style="margin:0 0 10px;">Invite an employee</h2>

    <form id="inviteForm" class="wl-form">
      <label>Email</label>
      <input id="inviteEmail" type="email" required placeholder="name@company.com" />

      <button class="wl-btn" type="submit">Generate invite link</button>
    </form>

    <div id="inviteResult" style="margin-top:12px;"></div>
  </section>
`;

document.querySelector("#inviteForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.querySelector("#inviteEmail").value.trim();
  const result = document.querySelector("#inviteResult");

  try {
    result.innerHTML = `<div style="opacity:.85;">Creating invite…</div>`;

    const res = await createInvite({
      organizationId: org.id,
      email,
      role: "EMPLOYEE",
    });

    const inviteUrl =
      `${window.location.origin}` +
      path(`/accept-invite.html#token=${encodeURIComponent(res.token)}`);

    result.innerHTML = `
      <div class="wl-alert wl-alert--success">
        <div style="font-weight:800;">Invite created</div>
        <div style="margin-top:6px;">Email: <code>${res.invited_email}</code></div>
        <div>Role: <code>${res.invited_role}</code></div>

        <div style="margin-top:10px;">
          Invite link:
          <input style="width:100%; margin-top:6px; padding:10px; border-radius:12px; border:1px solid var(--wl-border); background:rgba(0,0,0,.22); color:var(--text);"
                 readonly value="${inviteUrl}" />
        </div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    result.innerHTML = `<div class="wl-alert wl-alert--error">${err.message || "Failed to create invite."}</div>`;
  }
});
