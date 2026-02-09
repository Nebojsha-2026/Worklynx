// js/pages/manager/shifts.page.js
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
    <h1 style="margin:0;">Shifts</h1>
    <a class="wl-btn" href="${path("/app/manager/create-shift.html")}">+ Create shift</a>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div id="shiftsList" style="display:grid; gap:10px;"></div>
  </section>
`;

const listEl = document.querySelector("#shiftsList");

try {
  listEl.innerHTML = `<div style="opacity:.85;">Loading shifts…</div>`;

  const shifts = await listShifts({ organizationId: org.id, limit: 50 });

  if (!shifts.length) {
    listEl.innerHTML = `
      <div class="wl-alert" style="opacity:.95;">
        No shifts yet. Click <b>Create shift</b> to add one.
      </div>
    `;
  } else {
    // Sort by date then start time (since start_at is TIME)
    shifts.sort((a, b) => {
      const ad = String(a.shift_date || "");
      const bd = String(b.shift_date || "");
      if (ad !== bd) return ad.localeCompare(bd);
      return String(a.start_at || "").localeCompare(String(b.start_at || ""));
    });

    listEl.innerHTML = shifts.map(renderShiftRow).join("");
  }
} catch (err) {
  console.error(err);
  listEl.innerHTML = `
    <div class="wl-alert wl-alert--error">
      Failed to load shifts. ${escapeHtml(err?.message || "")}
    </div>
  `;
}

function renderShiftRow(s) {
  const id = s.id;
  const title = s.title || "Untitled shift";
  const date = s.shift_date || "";
  const start = s.start_at || "";
  const end = s.end_at || "";
  const loc = s.location || "";

  const href = path(`/app/manager/shift.html?id=${encodeURIComponent(id)}`);

  return `
    <a class="wl-card wl-panel" href="${href}" style="display:block;">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div>
          <div style="font-weight:800;">${escapeHtml(title)}</div>
          <div style="opacity:.85; font-size:13px; margin-top:4px;">
            ${escapeHtml(date)} • ${escapeHtml(start)} → ${escapeHtml(end)}
            ${loc ? ` • ${escapeHtml(loc)}` : ""}
          </div>
        </div>
        <div style="opacity:.8; font-size:13px;">View →</div>
      </div>
    </a>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
