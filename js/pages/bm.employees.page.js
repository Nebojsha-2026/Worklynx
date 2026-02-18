// js/pages/bm.employees.page.js
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";
import { createInvite } from "../data/invites.api.js";
import { path } from "../core/config.js";
import {
  listOrgMembers,
  deactivateOrgMember,
  normalizePaymentFrequency,
  updateOrgMemberPaymentFrequency,
} from "../data/members.api.js";
import { getSupabase } from "../core/supabaseClient.js";

await requireRole(["BO", "BM"]);

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
main.classList.add("wl-page");

main.innerHTML = `
  <div class="wl-shell">
    <div id="wlSidebar"></div>
    <div id="wlContent"></div>
  </div>
`;

main.querySelector("#wlSidebar").append(renderSidebar("BM"));

main.querySelector("#wlContent").innerHTML = `
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
    <h2>Current employees</h2>
    <div id="employeesList" class="wl-card" style="padding:12px;"></div>
  </section>
`;

let payFrequencySupported = true;
let paymentFrequencySupportMessage = "";

async function refreshEmployees() {
  const box = document.querySelector("#employeesList");
  box.innerHTML = "Loading...";

  try {
    const rows = await listOrgMembers({
      organizationId: org.id,
      roles: ["EMPLOYEE"],
    });

    if (!rows.length) {
      box.innerHTML = `<div style="opacity:.85;">No employees yet.</div>`;
      return;
    }

    box.innerHTML = `
      <div style="display:grid; gap:8px;">
        ${rows
          .map(
            (m) => `
          <div class="wl-card" data-user-row data-user-id="${escapeHtml(m.user_id)}" style="padding:10px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:700;">EMPLOYEE</div>
              <div style="font-size:12px; opacity:.85;">User ID: <code>${escapeHtml(m.user_id)}</code></div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <label style="font-size:12px; opacity:.85;">Pay frequency</label>
              <select data-pay-select>
                <option value="WEEKLY">Weekly</option>
                <option value="FORTNIGHTLY">Fortnightly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
              <button class="wl-btn" data-save-pay="${escapeHtml(m.user_id)}" style="padding:8px 10px;">Save</button>
              <button class="wl-btn" data-remove="${escapeHtml(m.user_id)}" style="padding:8px 10px;">Remove</button>
              <div data-pay-msg style="font-size:12px; min-width:70px;"></div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;

    let freqs = new Map();
    payFrequencySupported = true;
    paymentFrequencySupportMessage = "";

    try {
      freqs = await loadPaymentFrequencies(rows.map((r) => r.user_id));
    } catch (err) {
      if (isMissingPaymentFrequencyColumnError(err)) {
        payFrequencySupported = false;
        paymentFrequencySupportMessage = "Payment frequency column is missing in database. Please apply migration for org_members.payment_frequency.";
      } else {
        throw err;
      }
    }

    if (!payFrequencySupported) {
      box.insertAdjacentHTML("afterbegin", `<div class="wl-alert wl-alert--error" style="margin-bottom:10px;">${escapeHtml(paymentFrequencySupportMessage)}</div>`);
    }

    box.querySelectorAll("[data-user-row]").forEach((row) => {
      const userId = row.getAttribute("data-user-id");
      const select = row.querySelector("select[data-pay-select]");
      if (!userId || !select) return;
      select.value = normalizePaymentFrequency(freqs.get(userId));
    });

    box.querySelectorAll("[data-pay-select], [data-save-pay]").forEach((el) => {
      if (!payFrequencySupported) el.setAttribute("disabled", "disabled");
    });

    box.querySelectorAll("[data-save-pay]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-save-pay");
        const row = btn.closest("[data-user-row]");
        const select = row?.querySelector("select[data-pay-select]");
        const msg = row?.querySelector("[data-pay-msg]");
        if (!userId || !select || !msg) return;

        if (!payFrequencySupported) {
          msg.innerHTML = `<span style="color:#dc2626;">Migration required</span>`;
          return;
        }

        try {
          btn.disabled = true;
          msg.innerHTML = `<span style="opacity:.8;">Saving…</span>`;
          await updateOrgMemberPaymentFrequency({
            organizationId: org.id,
            userId,
            paymentFrequency: normalizePaymentFrequency(select.value),
          });
          msg.innerHTML = `<span style="color:#16a34a;">Saved ✅</span>`;
        } catch (err) {
          console.error(err);
          msg.innerHTML = `<span style="color:#dc2626;">${escapeHtml(err.message || "Failed")}</span>`;
        } finally {
          btn.disabled = false;
        }
      });
    });

    box.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-remove");
        if (!confirm("Remove this employee from the company?")) return;

        try {
          await deactivateOrgMember({ organizationId: org.id, userId });
          await refreshEmployees();
        } catch (err) {
          console.error(err);
          alert(err.message || "Failed to remove employee.");
        }
      });
    });
  } catch (err) {
    console.error(err);
    box.innerHTML = `<div style="color:#ffb3b3;">Failed to load employees.</div>`;
  }
}

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
        <div>Email: <code>${escapeHtml(res.invited_email)}</code></div>
        <div>Role: <code>${escapeHtml(res.invited_role)}</code></div>
        <div style="margin-top:8px;">
          Invite link:<br/>
          <input style="width:100%; padding:8px;" readonly value="${escapeHtml(inviteUrl)}" />
        </div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    alert(err.message || "Failed to create employee invite.");
  }
});

async function loadPaymentFrequencies(userIds) {
  if (!userIds.length) return new Map();

  const { data, error } = await supabase
    .from("org_members")
    .select("user_id, payment_frequency")
    .eq("organization_id", org.id)
    .in("user_id", userIds)
    .eq("role", "EMPLOYEE")
    .eq("is_active", true);

  if (error) throw error;
  return new Map((data || []).map((r) => [r.user_id, r.payment_frequency]));
}

function isMissingPaymentFrequencyColumnError(err) {
  const text = String(err?.message || err?.details || err?.hint || "").toLowerCase();
  return text.includes("payment_frequency") && text.includes("column");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

await refreshEmployees();
