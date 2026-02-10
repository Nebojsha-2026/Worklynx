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
  window.location.replace(path("/app/employee/my-shifts.html"));
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

const { data: shift, error } = await supabase
  .from("shifts")
  .select("*")
  .eq("id", shiftId)
  .single();

if (error || !shift) {
  content.innerHTML = `<div class="wl-alert wl-alert--error">Shift not found.</div>`;
  throw error;
}

content.innerHTML = `
  <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <div>
      <h1 style="margin:0;">${escapeHtml(shift.title || "Untitled shift")}</h1>
      <div style="opacity:.85; margin-top:6px;">
        ${escapeHtml(shift.shift_date)} • ${escapeHtml(shift.start_at)} → ${escapeHtml(shift.end_at)}
      </div>
    </div>
    <div>
      ${renderStatusBadge(shift.status)}
    </div>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:grid; gap:10px;">
      <div><b>Date:</b> ${escapeHtml(shift.shift_date)}</div>
      <div><b>Time:</b> ${escapeHtml(shift.start_at)} → ${escapeHtml(shift.end_at)}</div>
      ${shift.location ? `<div><b>Location:</b> ${escapeHtml(shift.location)}</div>` : ""}
      ${shift.hourly_rate != null ? `<div><b>Rate:</b> ${escapeHtml(String(shift.hourly_rate))} / hr</div>` : ""}
      ${shift.description ? `<div><b>Description:</b><br/>${escapeHtml(shift.description)}</div>` : ""}
    </div>
  </section>

  <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
    <a class="wl-btn" href="${path("/app/employee/my-shifts.html")}">← Back</a>
  </div>
`;

function renderStatusBadge(statusRaw) {
  const status = String(statusRaw || "ACTIVE").toUpperCase();

  const map = {
    ACTIVE: { cls: "wl-badge--active", label: "Active" },
    CANCELLED: { cls: "wl-badge--cancelled", label: "Cancelled" },
    DRAFT: { cls: "wl-badge--draft", label: "Draft" },
    OFFERED: { cls: "wl-badge--offered", label: "Offered" },
  };

  const s = map[status] || { cls: "", label: status };
  return `<span class="wl-badge ${s.cls}">${escapeHtml(s.label)}</span>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
