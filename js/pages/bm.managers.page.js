// js/pages/bm.managers.page.js
// BM can view and manage Managers (invite, remove) - cannot remove BO
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";
import { createInvite } from "../data/invites.api.js";
import { path } from "../core/config.js";
import { listOrgMembers, deactivateOrgMember } from "../data/members.api.js";

await requireRole(["BM", "BO"]);

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
main.querySelector("#wlSidebar").append(renderSidebar("BM"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <h1 style="margin-bottom:4px;">Managers</h1>
  <p style="color:var(--muted);font-size:13px;margin-bottom:20px;">Invite Managers to join <strong>${escapeHtml(org.name)}</strong>. As Business Manager you can invite and remove Managers.</p>

  <section class="wl-card wl-panel" style="max-width:640px;margin-bottom:20px;">
    <h2 style="margin-top:0;">Invite a Manager</h2>
    <form id="inviteForm" class="wl-form">
      <label>Email address</label>
      <input id="inviteEmail" type="email" required placeholder="manager@company.com" />
      <button class="wl-btn wl-btn--primary" type="submit">Send invite</button>
    </form>
    <div id="inviteResult" style="margin-top:12px;"></div>
  </section>

  <section>
    <h2>Current Managers</h2>
    <div id="managersList" class="wl-card wl-panel">Loading…</div>
  </section>
`;

async function refreshManagers() {
  const box = content.querySelector("#managersList");
  box.innerHTML = "Loading…";
  try {
    const rows = await listOrgMembers({ organizationId: org.id, roles: ["MANAGER"] });

    if (!rows.length) {
      box.innerHTML = `<div style="color:var(--muted);">No managers yet. Invite one above.</div>`;
      return;
    }

    box.innerHTML = `<div style="display:grid;gap:8px;">
      ${rows.map(m => `
        <div class="wl-card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;font-size:14px;">Manager</div>
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
        if (!confirm("Remove this manager from the company?")) return;
        try {
          await deactivateOrgMember({ organizationId: org.id, userId });
          await refreshManagers();
        } catch (err) {
          alert(err?.message || "Failed to remove manager.");
        }
      });
    });
  } catch (err) {
    box.innerHTML = `<div style="color:#dc2626;">Failed to load managers: ${escapeHtml(err?.message || "")}</div>`;
  }
}

content.querySelector("#inviteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = content.querySelector("#inviteEmail").value.trim();
  const resultEl = content.querySelector("#inviteResult");
  try {
    const res = await createInvite({ organizationId: org.id, email, role: "MANAGER" });
    const inviteUrl = `${window.location.origin}${path(`/accept-invite.html#token=${encodeURIComponent(res.token)}`)}`;
    resultEl.innerHTML = `
      <div class="wl-card" style="padding:12px;">
        <div><strong>Invite created for Manager</strong></div>
        <div style="font-size:13px;">Email: <code>${escapeHtml(res.invited_email)}</code></div>
        <div style="margin-top:8px;">
          Invite link:<br/>
          <input style="width:100%;padding:8px;font-size:12px;" readonly value="${escapeHtml(inviteUrl)}" onclick="this.select()" />
        </div>
      </div>`;
    content.querySelector("#inviteEmail").value = "";
  } catch (err) {
    alert(err?.message || "Failed to create invite.");
  }
});

function escapeHtml(str) {
  return String(str || "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

await refreshManagers();
