// js/pages/manager/shifts.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { tickRecurringSeries } from "../../data/recurring.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { listShifts } from "../../data/shifts.api.js";
import { listAssignmentsForShifts } from "../../data/shiftAssignments.api.js";
import { listOrgMembers } from "../../data/members.api.js";
import { path } from "../../core/config.js";

await requireRole(["BO", "BM", "MANAGER"]);

const org = await loadOrgContext();

tickRecurringSeries(org.id);  // fire-and-forget — silently creates next occurrences

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
    <h1 style="margin:0;">Shifts</h1>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <a class="wl-btn" href="${path("/app/manager/recurring-series.html")}">♻ Recurring Series</a>
      <a class="wl-btn wl-btn--primary" href="${path("/app/manager/create-shift.html")}">+ Create shift</a>
    </div>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div id="shiftsList" style="display:grid; gap:10px;"></div>
  </section>
`;

const listEl = document.querySelector("#shiftsList");

try {
  listEl.innerHTML = `<div style="opacity:.85;">Loading shifts…</div>`;

  const shifts = await listShifts({ organizationId: org.id, limit: 200 });

  if (!shifts.length) {
    listEl.innerHTML = `
      <div class="wl-alert" style="opacity:.95;">
        No shifts yet. Click <b>Create shift</b> to add one.
      </div>
    `;
  } else {
    // Sort by date then start time
    shifts.sort((a, b) => {
      const ad = String(a.shift_date || "");
      const bd = String(b.shift_date || "");
      if (ad !== bd) return ad.localeCompare(bd);
      return String(a.start_at || "").localeCompare(String(b.start_at || ""));
    });

    // Employee labels (EMPLOYEE only)
    const members = await listOrgMembers({
      organizationId: org.id,
      roles: ["EMPLOYEE"],
    });

    const employeeLabelById = new Map(
      (members || []).map((m) => [
        m.user_id,
        (m.full_name || m.email || m.user_id || "").toString(),
      ])
    );

    // Assignments grouped by shift
    const shiftIds = shifts.map((s) => s.id);
    const assigns = shiftIds.length
      ? await listAssignmentsForShifts({ shiftIds })
      : [];

    const assignedByShift = new Map();
    for (const a of assigns || []) {
      const sid = a.shift_id;
      const arr = assignedByShift.get(sid) || [];
      arr.push(a.employee_user_id);
      assignedByShift.set(sid, arr);
    }

    listEl.innerHTML = shifts
      .map((s) =>
        renderShiftRow(
          s,
          assignedByShift.get(s.id) || [],
          employeeLabelById
        )
      )
      .join("");
  }
} catch (err) {
  console.error(err);
  listEl.innerHTML = `
    <div class="wl-alert wl-alert--error">
      Failed to load shifts. ${escapeHtml(err?.message || "")}
    </div>
  `;
}

function renderShiftRow(s, assignedIds, labelMap) {
  const href = path(`/app/manager/shift.html?id=${encodeURIComponent(s.id)}`);

  const assignedCount = assignedIds.length;
  const top2 = assignedIds.slice(0, 2).map((id) => labelMap.get(id) || id);

  // ✅ STEP 5 — Recurring badge
  const recurBadge = s.is_recurring
    ? `<span style="
        padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;
        background:var(--brand-soft);border:1.5px solid var(--brand-border);color:var(--brand);">
        ♻ Recurring${!s.recur_end_date ? " · Ongoing" : ""}
       </span>`
    : "";

  return `
    <a class="wl-card wl-panel" href="${href}" style="display:block;">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
            <span style="font-weight:800;">${escapeHtml(s.title || "Untitled shift")}</span>
            ${recurBadge}
          </div>

          <div style="opacity:.85; font-size:13px; margin-top:4px;">
            ${escapeHtml(s.shift_date || "")} • ${escapeHtml(s.start_at || "")} → ${escapeHtml(s.end_at || "")}
            ${s.location ? ` • ${escapeHtml(s.location)}` : ""}
          </div>

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
          <div style="opacity:.8; font-size:13px;">View →</div>
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
