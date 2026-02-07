// js/pages/bo.managers.page.js
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";
import { createInvite } from "../data/invites.api.js";
import { path } from "../core/config.js";
import { listOrgMembers, deactivateOrgMember } from "../data/members.api.js";

await requireRole(["BO"]);

const org = await loadOrgContext();

document.body.prepend(
  renderHeader({
    companyName: org.name,
    companyLogoUrl: org.company_logo_url,
  })
);
document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.classList.add("wl-page");
main.innerHTML = `
  <div class="wl-shell">
    <div id="wlSidebar"></div>
    <div id="wlContent"></div>
  </div>
`;

main.querySelector("#wlSidebar").append(renderSidebar("BO"));

main.querySelector("#wlContent").innerHTML = `
  <h1>Managers</h1>
  <p>Invite Business Manager(s) and Managers to join <strong>${org.name}</strong>.</p>

  <section class="wl-card" style="padding:16px; max-width:720px;">
    <h2 style="margin-top:0;">Send an invite</h2>

    <form id="inviteForm" class="wl-form">
      <label>Email</label>
      <input id="inviteEmail" type="email" required placeholder="name@company.com" />

      <label>Role</label>
      <select id="inviteRole" required>
        <option value="BM">Business Manager (BM)</option>
        <option value="MANAGER">Manager</option>
      </select>

      <button class="wl-btn" type="submit">Create invite</button>
    </form>

    <div id="inviteResult" style="margin-top:12px;"></div>
  </section>

  <section style="margin-top:16px;">
    <h2>Current managers</h2>
    <div id="membersList" class="wl-card" style="padding:12px;"></div>
  </section>
`;

async function refreshMembers() {
  const box = document.querySelector("#membersList");
  box.innerHTML = "Loading...";

  try {
    const rows = await listOrgMembers({
      organizationId: org.id,
      roles: ["BM", "MANAGER"],
    });

    if (!rows.length) {
      box.innerHTML = `<div style="opacity:.85;">No managers yet.</div>`;
      return;
    }

    box.innerHTML = `
      <div style="display:grid; gap:8px;">
        ${rows
          .map(
            (m) => `
          <div class="wl-card" style="padding:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700;">${m.role}</div>
              <div style="font-size:12px; opacity:.85;">User ID: <code>${m.user_id}</code></div>
            </div>
            <button class="wl-btn" data-remove="${m.user_id}" style="padding:8px 10px;">Remove</button>
          </div>
        `
          )
          .join("")}
      </div>
    `;

    box.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-remove");
        if (!confirm("Remove this member from the company?")) return;

        try {
          await deactivateOrgMember({ organizationId: org.id, userId });
          await refreshMembers();
        } catch (err) {
          console.error(err);
          alert(err.message || "Failed to remove member.");
        }
      });
    });
  } catch (err) {
    console.error(err);
    box.innerHTML = `<div style="color:#ffb3b3;">Failed to load members.</div>`;
  }
}

document.querySelector("#inviteForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.querySelector("#inviteEmail").value.trim();
  const role = document.querySelector("#inviteRole").value;

  try {
    const res = await createInvite({
      organizationId: org.id,
      email,
      role,
    });

    const inviteUrl =
      `${window.location.origin}` +
      path(`/accept-invite.html#token=${encodeURIComponent(res.token)}`);

    document.querySelector("#inviteResult").innerHTML = `
      <div class="wl-card" style="padding:12px;">
        <div><strong>Invite created</strong></div>
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
    alert(err.message || "Failed to create invite.");
  }
});

await refreshMembers();
