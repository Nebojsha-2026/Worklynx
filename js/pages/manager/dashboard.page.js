// js/pages/manager/dashboard.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { listShifts } from "../../data/shifts.api.js";
import { path } from "../../core/config.js";

await requireRole(["BO", "BM", "MANAGER"]);

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
    <h1 style="margin:0;">Manager dashboard</h1>
    <a class="wl-btn" href="${path("/app/manager/create-shift.html")}">+ Create shift</a>
  </div>

  <section class="wl-card wl-panel" style="margin-top:14px;">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
      <h2 style="margin:0;">Upcoming shifts</h2>
      <button id="refreshBtn" class="wl-btn" type="button">Refresh</button>
    </div>
    <div id="shiftList" style="margin-top:12px;"></div>
  </section>
`;

async function loadUpcoming() {
  const listEl = document.querySelector("#shiftList");
  listEl.innerHTML = `<div style="opacity:.85;">Loading shifts…</div>`;

  try {
    const shifts = await listShifts({ organizationId: org.id, limit: 50 });

    if (!shifts.length) {
      listEl.innerHTML = `<div style="opacity:.85;">No shifts yet. Create one!</div>`;
      return;
    }

    listEl.innerHTML = `
      <div style="display:grid; gap:10px;">
        ${shifts.map(s => `
          <div class="wl-card wl-panel" style="padding:12px;">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
              <div>
                <div style="font-weight:800;">${escapeHtml(s.title || "Untitled shift")}</div>
                <div style="font-size:13px; opacity:.85; margin-top:4px;">
                  ${escapeHtml(s.shift_date)} • ${escapeHtml(s.start_at)} → ${escapeHtml(s.end_at)}
                </div>
                ${s.location ? `<div style="font-size:13px; opacity:.8; margin-top:4px;">📍 ${escapeHtml(s.location)}</div>` : ""}
              </div>
              <div style="font-size:13px; opacity:.85; text-align:right;">
                ${s.hourly_rate != null ? `<div><b>${escapeHtml(String(s.hourly_rate))}</b> / hr</div>` : ""}
                ${s.status ? `<div style="margin-top:4px;">${escapeHtml(String(s.status))}</div>` : ""}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load shifts: ${escapeHtml(err.message || "Unknown error")}</div>`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelector("#refreshBtn").addEventListener("click", loadUpcoming);

await loadUpcoming();
