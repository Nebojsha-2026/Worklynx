// js/pages/employee/shift.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { getSupabase } from "../../core/supabaseClient.js";
import { path } from "../../core/config.js";

await requireRole(["EMPLOYEE"]);

const params = new URLSearchParams(window.location.search);
const shiftId = params.get("id");

if (!shiftId) {
  window.location.replace(path("/app/employee/dashboard.html"));
  throw new Error("Missing shift id");
}

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

main.querySelector("#wlSidebar").append(renderSidebar("EMPLOYEE"));

const content = main.querySelector("#wlContent");
content.innerHTML = `<div style="opacity:.85;">Loading shift…</div>`;

// Load shift
const { data: shift, error } = await supabase
  .from("shifts")
  .select("*")
  .eq("id", shiftId)
  .single();

if (error || !shift) {
  content.innerHTML = `<div class="wl-alert wl-alert--error">Shift not found.</div>`;
  throw error;
}

const status = String(shift.status || "PUBLISHED").toUpperCase();
const isCancelled = status === "CANCELLED";

content.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
    <div style="min-width:0;">
      <h1 style="margin:0;">${escapeHtml(shift.title || "Untitled shift")}</h1>
      <div style="margin-top:8px; font-size:13px; opacity:.85;">
        <b>${escapeHtml(formatWhenLabel(shift.shift_date))}</b>
        • ${escapeHtml(shift.start_at)} → ${escapeHtml(shift.end_at)}
        ${shift.location ? ` • 📍 ${escapeHtml(shift.location)}` : ""}
      </div>
    </div>

    <div style="display:flex; align-items:center; gap:10px;">
      ${renderStatusBadge(status)}
    </div>
  </div>

  ${
    isCancelled
      ? `
    <div class="wl-alert wl-alert--error" style="margin-top:12px;">
      <b>This shift was cancelled.</b><br/>
      <span style="opacity:.9; font-size:13px;">If you think this is a mistake, contact your manager.</span>
    </div>
  `
      : `
    <div class="wl-alert wl-alert--success" style="margin-top:12px;">
      <b>You’re assigned to this shift.</b><br/>
      <span style="opacity:.9; font-size:13px;">Use this page to view details and (soon) enter your timesheet.</span>
    </div>
  `
  }

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:grid; gap:10px;">
      <div><b>Date:</b> ${escapeHtml(shift.shift_date)}</div>
      <div><b>Time:</b> ${escapeHtml(shift.start_at)} → ${escapeHtml(shift.end_at)}</div>
      ${
        shift.hourly_rate != null
          ? `<div><b>Rate:</b> ${escapeHtml(String(shift.hourly_rate))} / hr</div>`
          : ""
      }
      ${shift.location ? `<div><b>Location:</b> ${escapeHtml(shift.location)}</div>` : ""}
      ${
        shift.description
          ? `<div><b>Description:</b><br/><div style="opacity:.9; margin-top:6px;">${escapeHtml(
              shift.description
            )}</div></div>`
          : ""
      }
    </div>
  </section>

  <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
    <a class="wl-btn" href="${path("/app/employee/my-shifts.html")}">← Back</a>

    ${
      isCancelled
        ? `<span class="wl-pill" style="opacity:.9;">No actions available</span>`
        : `<button id="primaryAction" class="wl-btn" type="button">Start timesheet</button>`
    }
  </div>

  <div id="actionMsg" style="margin-top:10px;"></div>
`;

// Primary action placeholder (we’ll wire this in C3)
const primaryBtn = document.querySelector("#primaryAction");
if (primaryBtn) {
  primaryBtn.addEventListener("click", () => {
    const msg = document.querySelector("#actionMsg");
    msg.innerHTML = `
      <div class="wl-alert" style="opacity:.95;">
        Timesheet UI is next (C3). This button is ready to wire up.
      </div>
    `;
  });
}

/* --------------------------
   Helpers
--------------------------- */
function renderStatusBadge(status) {
  const map = {
    PUBLISHED: { cls: "wl-badge--active", label: "Active" },
    ACTIVE: { cls: "wl-badge--active", label: "Active" },
    CANCELLED: { cls: "wl-badge--cancelled", label: "Cancelled" },
    DRAFT: { cls: "wl-badge--draft", label: "Draft" },
    OFFERED: { cls: "wl-badge--offered", label: "Offered" },
  };
  const s = map[status] || { cls: "", label: status };
  return `<span class="wl-badge ${s.cls}">${escapeHtml(s.label)}</span>`;
}

function formatWhenLabel(yyyyMmDd) {
  if (!yyyyMmDd || String(yyyyMmDd).length < 10) return String(yyyyMmDd || "");
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  if (!y || !m || !d) return String(yyyyMmDd);

  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dt = new Date(y, m - 1, d).getTime();
  const diffDays = Math.round((dt - t0) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return String(yyyyMmDd);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
