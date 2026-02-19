// js/pages/manager/team.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { createInvite } from "../../data/invites.api.js";
import { listOrgMembers, normalizePaymentFrequency, updateOrgMemberPaymentFrequency } from "../../data/members.api.js";
import { path } from "../../core/config.js";
import { getSupabase } from "../../core/supabaseClient.js";

await requireRole(["MANAGER", "BM", "BO"]);

const org = await loadOrgContext();
const supabase = getSupabase();

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
  <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
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

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
      <h2 style="margin:0;">Employees</h2>
      <div style="font-size:13px; color:#64748b;">Set pay frequency for payroll and timesheet periods.</div>
    </div>
    <div id="teamEmployees" style="margin-top:12px;"><div style="opacity:.85;">Loading employees…</div></div>
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
        <div style="margin-top:6px;">Email: <code>${escapeHtml(res.invited_email)}</code></div>
        <div>Role: <code>${escapeHtml(res.invited_role)}</code></div>
        <div style="margin-top:10px;">
          Invite link:
          <input style="width:100%; margin-top:6px; padding:10px; border-radius:12px; border:1px solid var(--wl-border);"
                 readonly value="${escapeHtml(inviteUrl)}" />
        </div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    result.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err.message || "Failed to create invite.")}</div>`;
  }
});

await refreshEmployees();

async function refreshEmployees() {
  const box = document.querySelector("#teamEmployees");
  box.innerHTML = `<div style="opacity:.85;">Loading employees…</div>`;

  try {
    // listOrgMembers uses SECURITY DEFINER RPC so it works for managers
    const members = await listOrgMembers({
      organizationId: org.id,
      roles: ["EMPLOYEE"],
    });

    if (!members.length) {
      box.innerHTML = `<div style="opacity:.85;">No employees yet.</div>`;
      return;
    }

    const ids = members.map((m) => m.user_id).filter(Boolean);

    // Use the SECURITY DEFINER RPC to load pay frequencies (bypasses RLS)
    let freqByUserId = new Map();
    try {
      freqByUserId = await loadPaymentFrequenciesViaRpc(ids);
    } catch (err) {
      console.warn("Could not load pay frequencies:", err);
      // Fall back to empty map — dropdowns will show default
    }

    box.innerHTML = `
      <div style="display:grid; gap:10px;">
        ${members.map((m) => renderEmployeeRow(m, freqByUserId.get(m.user_id))).join("")}
      </div>
    `;

    box.querySelectorAll("[data-pay-save]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-user-id");
        const row = btn.closest("[data-user-row]");
        const select = row.querySelector("select[data-pay-select]");
        const msg = row.querySelector("[data-pay-msg]");
        if (!userId || !select) return;

        const next = normalizePaymentFrequency(select.value);

        try {
          btn.disabled = true;
          msg.innerHTML = `<span style="opacity:.8;">Saving…</span>`;

          await updateOrgMemberPaymentFrequency({
            organizationId: org.id,
            userId,
            paymentFrequency: next,
          });

          msg.innerHTML = `<span style="color:#16a34a;">Saved ✅</span>`;

          // Clear the success message after 3 seconds
          setTimeout(() => {
            if (msg) msg.innerHTML = "";
          }, 3000);
        } catch (err) {
          console.error(err);
          msg.innerHTML = `<span style="color:#dc2626;">${escapeHtml(err.message || "Failed to save")}</span>`;
        } finally {
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    console.error(err);
    box.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load employees.</div>`;
  }
}

/**
 * Load payment frequencies using the list_org_members RPC which is SECURITY DEFINER.
 * This works even when managers can't directly query org_members rows for other users.
 */
async function loadPaymentFrequenciesViaRpc(userIds) {
  if (!userIds.length) return new Map();

  // list_org_members already returns payment_frequency if the column exists
  const { data, error } = await supabase.rpc("list_org_members", {
    p_org_id: org.id,
    p_roles: ["EMPLOYEE"],
  });

  if (error) throw error;

  return new Map(
    (data || [])
      .filter((r) => userIds.includes(r.user_id))
      .map((r) => [r.user_id, r.payment_frequency])
  );
}

function renderEmployeeRow(member, paymentFrequency) {
  const freq = normalizePaymentFrequency(paymentFrequency);

  return `
    <div data-user-row data-user-id="${escapeHtml(member.user_id)}" class="wl-card" style="padding:12px;">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
        <div>
          <div style="font-weight:800;">${escapeHtml(getMemberDisplayName(member))}</div>
          <div style="font-size:12px; color:#64748b; margin-top:4px;">Email: ${escapeHtml(member.email || "Not available")}</div>
          <div style="font-size:12px; color:#94a3b8; margin-top:2px;">User ID: <code>${escapeHtml(member.user_id)}</code></div>
        </div>

        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <label style="font-size:12px; color:#64748b;">Pay frequency</label>
          <select data-pay-select style="min-width:160px;">
            <option value="WEEKLY" ${freq === "WEEKLY" ? "selected" : ""}>Weekly</option>
            <option value="FORTNIGHTLY" ${freq === "FORTNIGHTLY" ? "selected" : ""}>Fortnightly</option>
            <option value="MONTHLY" ${freq === "MONTHLY" ? "selected" : ""}>Monthly</option>
          </select>
          <button type="button" class="wl-btn" data-pay-save data-user-id="${escapeHtml(member.user_id)}">Save</button>
          <div data-pay-msg style="font-size:12px; min-width:70px;"></div>
        </div>
      </div>
    </div>
  `;
}

function getMemberDisplayName(member) {
  const fullName = String(member?.full_name || "").trim();
  if (fullName) return fullName;
  const email = String(member?.email || "").trim();
  if (email) return email;
  return "Employee";
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
