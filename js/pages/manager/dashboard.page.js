// js/pages/manager/dashboard.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { listShifts } from "../../data/shifts.api.js";
import { listAssignmentsForShifts } from "../../data/shiftAssignments.api.js";
import { listOrgMembers } from "../../data/members.api.js";
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

    <div id="shiftControls" style="margin-top:12px; display:none;"></div>
  </section>
`;

document.querySelector("#refreshBtn").addEventListener("click", loadUpcoming);

await loadUpcoming();

async function loadUpcoming() {
  const listEl = document.querySelector("#shiftList");
  const controlsEl = document.querySelector("#shiftControls");

  listEl.innerHTML = `<div style="opacity:.85;">Loading shifts…</div>`;
  controlsEl.style.display = "none";
  controlsEl.innerHTML = "";

  try {
    const all = await listShifts({ organizationId: org.id, limit: 200 });

    // Only show ACTIVE + OFFERED in "Upcoming"
    const allowed = new Set(["PUBLISHED", "ACTIVE", "OFFERED"]);
    const visibleShifts = shifts
  .filter(s => allowed.has(String(s.status).toUpperCase()))
  .slice(0, 4);
    <a href="/app/manager/shifts.html">View all shifts →</a>
    );

    if (!visible.length) {
      listEl.innerHTML = `
        <div class="wl-alert" style="opacity:.95;">
          No upcoming shifts (Active/Offered). Create one!
        </div>
      `;
      return;
    }

    // Sort by date then start time
    visible.sort((a, b) => {
      const ad = String(a.shift_date || "");
      const bd = String(b.shift_date || "");
      if (ad !== bd) return ad.localeCompare(bd);
      return String(a.start_at || "").localeCompare(String(b.start_at || ""));
    });

    // Load employee labels (EMPLOYEE only)
    const members = await listOrgMembers({ organizationId: org.id, roles: ["EMPLOYEE"] });
    const employeeLabelById = new Map(
      (members || []).map((m) => [
        m.user_id,
        (m.full_name || m.email || m.user_id || "").toString(),
      ])
    );

    // Load assignments for these shifts (for counts + chips)
    const shiftIds = visible.map((s) => s.id);
    const assigns = await listAssignmentsForShifts({ shiftIds });

    const assignedByShift = new Map(); // shiftId -> [employee_user_id]
    for (const a of assigns || []) {
      const sid = a.shift_id;
      const arr = assignedByShift.get(sid) || [];
      arr.push(a.employee_user_id);
      assignedByShift.set(sid, arr);
    }

    // Pagination rules
    const DEFAULT_LIMIT = 4;
    const EXPANDED_LIMIT = 10;

    const state = {
      expanded: false,
    };

    function render() {
      const limit = state.expanded ? EXPANDED_LIMIT : DEFAULT_LIMIT;
      const slice = visible.slice(0, limit);

      listEl.innerHTML = `
        <div style="display:grid; gap:10px;">
          ${slice
            .map((s) =>
              renderShiftCard(s, assignedByShift.get(s.id) || [], employeeLabelById)
            )
            .join("")}
        </div>
      `;

      // Controls
      const canExpand = visible.length > DEFAULT_LIMIT;
      const hasMoreThan10 = visible.length > EXPANDED_LIMIT;

      if (!canExpand && !hasMoreThan10) {
        controlsEl.style.display = "none";
        controlsEl.innerHTML = "";
        return;
      }

      controlsEl.style.display = "flex";
      controlsEl.style.alignItems = "center";
      controlsEl.style.justifyContent = "space-between";
      controlsEl.style.gap = "10px";
      controlsEl.style.flexWrap = "wrap";

      const shown = Math.min(limit, visible.length);

      controlsEl.innerHTML = `
        <div style="font-size:13px; opacity:.85;">
          Showing <b>${shown}</b> of <b>${visible.length}</b>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          ${
            canExpand
              ? `
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; opacity:.9;">
              <input id="toggleMore" type="checkbox" ${state.expanded ? "checked" : ""} />
              Show up to ${EXPANDED_LIMIT}
            </label>
          `
              : ""
          }

          ${
            hasMoreThan10
              ? `<a class="wl-btn" href="${path("/app/manager/shifts.html")}">View all →</a>`
              : ""
          }
        </div>
      `;

      const toggle = document.querySelector("#toggleMore");
      if (toggle) {
        toggle.addEventListener("change", (e) => {
          state.expanded = !!e.target.checked;
          render();
        });
      }
    }

    render();
  } catch (err) {
    console.error(err);
    listEl.innerHTML = `
      <div class="wl-alert wl-alert--error">
        Failed to load shifts: ${escapeHtml(err.message || "Unknown error")}
      </div>
    `;
  }
}

function renderShiftCard(s, assignedIds, labelMap) {
  const href = path(`/app/manager/shift.html?id=${encodeURIComponent(s.id)}`);

  const assignedCount = assignedIds.length;
  const top2 = assignedIds.slice(0, 2).map((id) => labelMap.get(id) || id);

  return `
    <a class="wl-card wl-panel" href="${href}" style="display:block; padding:12px;">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div>
          <div style="font-weight:800;">${escapeHtml(s.title || "Untitled shift")}</div>
          <div style="font-size:13px; opacity:.85; margin-top:4px;">
            ${escapeHtml(s.shift_date)} • ${escapeHtml(s.start_at)} → ${escapeHtml(s.end_at)}
          </div>
          ${s.location ? `<div style="font-size:13px; opacity:.8; margin-top:4px;">📍 ${escapeHtml(s.location)}</div>` : ""}

          <div style="margin-top:8px; font-size:13px; opacity:.9;">
            <b>Assigned:</b> ${assignedCount}
          </div>

          ${
            assignedCount
              ? `
            <div class="wl-chips" style="margin-top:6px;">
              ${top2.map((name) => `<span class="wl-chip">${escapeHtml(name)}</span>`).join("")}
              ${assignedCount > 2 ? `<span class="wl-chip"><small>+${assignedCount - 2} more</small></span>` : ""}
            </div>
          `
              : `<div style="font-size:13px; opacity:.75; margin-top:6px;">No one assigned yet</div>`
          }
        </div>

        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
          ${renderStatusBadge(s.status)}
          <div style="font-size:13px; opacity:.8;">View →</div>
        </div>
      </div>
    </a>
  `;
}

function renderStatusBadge(statusRaw) {
  const status = String(statusRaw || "ACTIVE").toUpperCase();
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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
