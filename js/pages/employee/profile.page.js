// js/pages/employee/profile.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { getSupabase } from "../../core/supabaseClient.js";
import { getSession } from "../../core/session.js";
import { getOrgMember, normalizePaymentFrequency } from "../../data/members.api.js";

await requireRole(["EMPLOYEE"]);

const org = await loadOrgContext();
const supabase = getSupabase();
const session = await getSession();
const userId = session?.user?.id;

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
main.querySelector("#wlSidebar").append(renderSidebar("EMPLOYEE"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <div style="margin-bottom:20px;">
    <h1 style="margin:0;">My Profile</h1>
    <p style="margin:4px 0 0;color:var(--muted);font-size:13px;">Your account information and employment details</p>
  </div>

  <div id="profileContent">
    <div style="padding:20px 0;color:var(--muted);">Loading your profile…</div>
  </div>
`;

const profileEl = content.querySelector("#profileContent");

async function loadProfile() {
  try {
    const [member, { data: { user }, error: userError }] = await Promise.all([
      getOrgMember({ organizationId: org.id, userId }),
      supabase.auth.getUser(),
    ]);

    if (userError) throw userError;

    const email = user?.email ?? "—";
    const payFreq = normalizePaymentFrequency(member?.payment_frequency);
    const payFreqLabel = { WEEKLY: "Weekly", FORTNIGHTLY: "Fortnightly", MONTHLY: "Monthly" }[payFreq] ?? payFreq;
    const roleLabel = { EMPLOYEE: "Employee", MANAGER: "Manager", BM: "Business Manager", BO: "Business Owner" }[member?.role] ?? member?.role ?? "—";

    profileEl.innerHTML = `
      <div style="display:grid;gap:16px;max-width:600px;">

        <!-- Account info -->
        <div class="wl-card wl-panel">
          <h2 style="margin:0 0 16px;font-size:16px;">Account</h2>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
              <span style="color:var(--muted);font-size:13px;">Email address</span>
              <span style="font-weight:600;">${escapeHtml(email)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
              <span style="color:var(--muted);font-size:13px;">Organisation</span>
              <span style="font-weight:600;">${escapeHtml(org.name)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
              <span style="color:var(--muted);font-size:13px;">Role</span>
              <span style="font-weight:600;">${escapeHtml(roleLabel)}</span>
            </div>
          </div>
        </div>

        <!-- Employment details -->
        <div class="wl-card wl-panel">
          <h2 style="margin:0 0 16px;font-size:16px;">Employment</h2>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
              <span style="color:var(--muted);font-size:13px;">Pay frequency</span>
              <span style="font-weight:600;">${escapeHtml(payFreqLabel)}</span>
            </div>
          </div>
        </div>

        <!-- Security -->
        <div class="wl-card wl-panel">
          <h2 style="margin:0 0 16px;font-size:16px;">Security</h2>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
              <div>
                <div style="font-weight:600;font-size:13px;">Password</div>
                <div style="color:var(--muted);font-size:12px;">Change your account password</div>
              </div>
              <button id="btnResetPassword" class="wl-btn wl-btn--secondary" style="font-size:13px;padding:8px 14px;">
                Send reset link
              </button>
            </div>
          </div>
        </div>

      </div>

      <div id="resetMsg" class="wl-alert" style="display:none;margin-top:12px;max-width:600px;"></div>
    `;

    profileEl.querySelector("#btnResetPassword").addEventListener("click", handlePasswordReset);
    profileEl._email = email;

  } catch (err) {
    profileEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load profile: ${escapeHtml(err?.message || "Unknown error")}</div>`;
  }
}

async function handlePasswordReset() {
  const btn = profileEl.querySelector("#btnResetPassword");
  const msgEl = profileEl.querySelector("#resetMsg");
  const email = profileEl._email;

  btn.disabled = true;
  btn.textContent = "Sending…";
  msgEl.style.display = "none";

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password.html",
    });
    if (error) throw error;

    msgEl.className = "wl-alert wl-alert--success";
    msgEl.textContent = `Password reset link sent to ${email}. Check your inbox.`;
    msgEl.style.display = "";
    btn.textContent = "Link sent";
  } catch (err) {
    msgEl.className = "wl-alert wl-alert--error";
    msgEl.textContent = err?.message || "Failed to send reset link.";
    msgEl.style.display = "";
    btn.disabled = false;
    btn.textContent = "Send reset link";
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

await loadProfile();
