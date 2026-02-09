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

  <div style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
    <label style="display:flex; gap:8px; align-items:center; font-size:13px; opacity:.9;">
      <input id="showCancelled" type="checkbox" />
      Show cancelled
    </label>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div id="shiftsList" style="display:grid; gap:10px;"></div>
  </section>
`;

const listEl = document.querySelector("#shiftsList");
const showCancelledEl = document.querySelector("#showCancelled");

let allShifts = [];

async function load() {
  listEl.innerHTML = `<div style="opacity:.85;">Loading shifts…</div>`;
  allShifts = await listShifts({ organizationId: org.id, limit: 50 });
  render();
}

function render() {
  const showCancelled = showCancelledEl.checked;

  const filtered = allShifts.filter(s => {
    const st = String(s.status || "ACTIVE").toUpperCase();
    if (showCancelled) return true;
    return st !== "CANCELLED";
  });

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="wl-alert" style="opacity:.95;">
        No shifts to show.
      </div>
    `;
    return;
  }

  filtered.sort((a, b) => {
    const ad = String(a.shift_date || "");
    const bd = String(b.shift_date || "");
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.start_at || "").localeCompare(String(b.start_at || ""));
  });

  listEl.innerHTML = filtered.map(renderShiftRow).join("");
}

showCancelledEl.addEventListener("change", render);

try {
  await load();
} catch (err) {
  console.error(err);
  listEl.innerHTML = `
    <div class="wl-alert wl-alert--error">
      Failed to load shifts. ${escapeHtml(err?.message || "")}
    </div>
  `;
}

function renderShiftRow(s) {
  const href = path(`/app/manager/shift.html?id=${encodeURIComponent(s.id)}`);

  return `
    <a class="wl-card wl-panel" href="${href}" style="display:block;">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div>
          <div style="font-weight:800;">${escapeHtml(s.title || "Untitled shift")}</div>
          <div style="opacity:.85; font-size:13px; margin-top:4px;">
            ${escapeHtml(s.shift_date || "")} • ${escapeHtml(s.start_at || "")} → ${escapeHtml(s.end_at || "")}
            ${s.location ? ` • ${escapeHtml(s.location)}` : ""}
          </div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
          ${renderStatusBadge(s.status)}
          <div style="opacity:.8; font-size:13px;">View →</div>
        </div>
      </div>
    </a>
  `;
}

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
