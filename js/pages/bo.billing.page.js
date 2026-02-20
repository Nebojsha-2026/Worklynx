// js/pages/bo.billing.page.js
// Billing: Show current plan, usage, and upgrade options (no payment processing here)
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";
import { getOrgSubscription, checkTierLimits, getTierDetails } from "../data/stripe.api.js";
import { path } from "../core/config.js";

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
  <h1 style="margin-bottom:4px;">Billing & Subscription</h1>
  <p style="color:var(--muted);font-size:13px;margin-bottom:20px;">Your current plan and usage for <strong>${escapeHtml(org.name)}</strong></p>
  <div id="billingContent"><div style="color:var(--muted);">Loading…</div></div>
`;

try {
  const [sub, limits] = await Promise.all([
    getOrgSubscription({ orgId: org.id }),
    checkTierLimits({ orgId: org.id }),
  ]);

  const tier = sub?.subscription_tier || "—";
  const status = sub?.subscription_status || "—";
  const tierDetails = getTierDetails(tier);
  const u = limits.usage;

  const statusColor = status === "ACTIVE" ? "#16a34a" : status === "INACTIVE" ? "#dc2626" : "#d97706";

  function usageBar(current, max) {
    const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
    const color = pct >= 90 ? "#dc2626" : pct >= 70 ? "#d97706" : "#16a34a";
    return `
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width .3s;"></div>
        </div>
        <span style="font-size:13px;font-weight:700;white-space:nowrap;color:${color};">${current} / ${max}</span>
      </div>`;
  }

  content.querySelector("#billingContent").innerHTML = `
    <!-- Current plan card -->
    <div class="wl-card wl-panel" style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Current Plan</div>
          <div style="font-size:26px;font-weight:900;">${escapeHtml(tierDetails?.name || tier)}</div>
          ${tierDetails ? `<div style="font-size:15px;color:var(--muted);margin-top:4px;">$${tierDetails.price}/month</div>` : ""}
        </div>
        <div style="text-align:right;">
          <span style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${statusColor}22;color:${statusColor};border:1.5px solid ${statusColor}44;">
            ${escapeHtml(status)}
          </span>
          ${sub?.stripe_customer_id ? `<div style="margin-top:8px;font-size:11px;color:var(--muted);">Stripe ID: <code>${escapeHtml(sub.stripe_customer_id)}</code></div>` : ""}
        </div>
      </div>

      ${tierDetails ? `
        <div style="margin-top:16px;border-top:1px solid var(--wl-border);padding-top:16px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:10px;">Plan features:</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${tierDetails.features.map(f => `
              <span style="padding:4px 12px;border-radius:20px;font-size:12px;background:var(--surface-2,#f3f4f6);border:1px solid var(--wl-border);">
                ✓ ${escapeHtml(f)}
              </span>`).join("")}
          </div>
        </div>` : ""}
    </div>

    <!-- Usage card -->
    <div class="wl-card wl-panel" style="margin-bottom:20px;">
      <h2 style="margin-top:0;font-size:16px;">Usage</h2>
      <div style="display:grid;gap:14px;">
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Employees</div>
          ${usageBar(u.employees.current, u.employees.max)}
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Managers</div>
          ${usageBar(u.managers.current, u.managers.max)}
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Business Managers</div>
          ${usageBar(u.businessManagers.current, u.businessManagers.max)}
        </div>
      </div>
    </div>

    <!-- Upgrade CTA -->
    <div class="wl-card wl-panel" style="background:var(--brand-soft,#f0f7ff);border-color:var(--brand-border,#bfdbfe);">
      <h2 style="margin-top:0;font-size:16px;">Need more capacity?</h2>
      <p style="color:var(--muted);font-size:13px;">Upgrade your plan to add more employees, managers, and unlock advanced features.</p>
      <a class="wl-btn wl-btn--primary" href="${path("/pricing.html")}">View Plans & Upgrade</a>
    </div>
  `;
} catch (err) {
  content.querySelector("#billingContent").innerHTML =
    `<div class="wl-alert wl-alert--error">Failed to load billing information: ${escapeHtml(err?.message || "")}</div>`;
}

function escapeHtml(str) {
  return String(str || "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
