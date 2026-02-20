// js/pages/manager/shifts.page.js
import { requireRole }              from "../../core/guards.js";
import { renderHeader }             from "../../ui/header.js";
import { renderFooter }             from "../../ui/footer.js";
import { renderSidebar }            from "../../ui/sidebar.js";
import { loadOrgContext }           from "../../core/orgContext.js";
import { listShifts }               from "../../data/shifts.api.js";
import { listAssignmentsForShifts } from "../../data/shiftAssignments.api.js";
import { listOrgMembers }           from "../../data/members.api.js";
import { tickRecurringSeries }      from "../../data/recurring.js";
import { path }                     from "../../core/config.js";

await requireRole(["BO", "BM", "MANAGER"]);
const org = await loadOrgContext();
tickRecurringSeries(org.id);

document.body.prepend(renderHeader({ companyName: org.name, companyLogoUrl: org.company_logo_url }));
document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.innerHTML = `<div class="wl-shell"><div id="wlSidebar"></div><div id="wlContent"></div></div>`;
main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <!-- Page header -->
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">Shifts</h1>
      <p class="wl-subtext" style="margin:4px 0 0;">Manage and track all scheduled shifts</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <a class="wl-btn" href="${path("/app/manager/recurring-series.html")}">♻ Recurring Series</a>
      <a class="wl-btn wl-btn--primary" href="${path("/app/manager/create-shift.html")}">+ Create shift</a>
    </div>
  </div>

  <!-- Filters bar -->
  <div class="wl-card wl-panel" style="margin-bottom:16px;">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:10px;align-items:end;">
      
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Search</label>
        <input id="filterSearch" type="search" placeholder="Title, location…"
          style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);" />
      </div>

      <div>
        <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Employee</label>
        <select id="filterEmployee"
          style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);">
          <option value="">All employees</option>
        </select>
      </div>

      <div>
        <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Status</label>
        <select id="filterStatus"
          style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);">
          <option value="">All statuses</option>
          <option value="PUBLISHED">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="OFFERED">Offered</option>
        </select>
      </div>

      <div>
        <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Date range</label>
        <select id="filterDate"
          style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);">
          <option value="">All dates</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="next7">Next 7 days</option>
          <option value="month">This month</option>
          <option value="past">Past shifts</option>
        </select>
      </div>

      <button id="clearFilters" class="wl-btn" style="white-space:nowrap;padding:8px 14px;font-size:13px;">
        Clear
      </button>
    </div>

    <!-- Summary bar -->
    <div id="filterSummary" style="margin-top:10px;font-size:13px;color:var(--muted);"></div>
  </div>

  <!-- Shifts list grouped by date -->
  <div id="shiftsList"></div>
`;

// ── Load data ──────────────────────────────────────────────────────────────
const listEl = document.querySelector("#shiftsList");

let allShifts       = [];
let assignedByShift = new Map();
let employeeMap     = new Map(); // user_id → name
let members         = [];

try {
  listEl.innerHTML = `<div class="wl-subtext" style="padding:20px 0;">Loading shifts…</div>`;

  const [shiftsRaw, membersRaw] = await Promise.all([
    listShifts({ organizationId: org.id, limit: 500 }),
    listOrgMembers({ organizationId: org.id, roles: ["EMPLOYEE"] }),
  ]);

  members = membersRaw || [];
  allShifts = (shiftsRaw || []).sort((a, b) => {
    const ad = String(a.shift_date || "");
    const bd = String(b.shift_date || "");
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.start_at || "").localeCompare(String(b.start_at || ""));
  });

  employeeMap = new Map(members.map(m => [m.user_id, m.full_name || m.email || m.user_id]));

  // Populate employee filter
  const empSelect = document.querySelector("#filterEmployee");
  members.forEach(m => {
    const opt = document.createElement("option");
    opt.value       = m.user_id;
    opt.textContent = m.full_name || m.email || m.user_id;
    empSelect.appendChild(opt);
  });

  // Load assignments
  const shiftIds = allShifts.map(s => s.id);
  const assigns  = shiftIds.length ? await listAssignmentsForShifts({ shiftIds }) : [];
  for (const a of assigns || []) {
    const arr = assignedByShift.get(a.shift_id) || [];
    arr.push(a.employee_user_id);
    assignedByShift.set(a.shift_id, arr);
  }

  renderList();

} catch (err) {
  console.error(err);
  listEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load shifts: ${escapeHtml(err?.message || "")}</div>`;
}

// ── Filter logic ───────────────────────────────────────────────────────────
function getFilteredShifts() {
  const search   = document.querySelector("#filterSearch")?.value.trim().toLowerCase() || "";
  const empId    = document.querySelector("#filterEmployee")?.value || "";
  const status   = document.querySelector("#filterStatus")?.value || "";
  const dateRange = document.querySelector("#filterDate")?.value || "";

  const today   = isoToday();
  const weekEnd = isoAddDays(today, 6);
  const next7   = isoAddDays(today, 7);
  const monthEnd = isoMonthEnd(today);

  return allShifts.filter(s => {
    // Search
    if (search) {
      const hay = `${s.title || ""} ${s.location || ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

    // Employee filter
    if (empId) {
      const ids = assignedByShift.get(s.id) || [];
      if (!ids.includes(empId)) return false;
    }

    // Status filter
    if (status) {
      const sStatus = String(s.status || "PUBLISHED").toUpperCase();
      if (sStatus !== status) return false;
    }

    // Date range filter
    if (dateRange) {
      const d = s.shift_date || "";
      if (dateRange === "today"  && d !== today)                     return false;
      if (dateRange === "week"   && (d < today || d > weekEnd))      return false;
      if (dateRange === "next7"  && (d < today || d > next7))        return false;
      if (dateRange === "month"  && (d < today || d > monthEnd))     return false;
      if (dateRange === "past"   && d >= today)                      return false;
    }

    return true;
  });
}

function renderList() {
  const filtered = getFilteredShifts();

  // Summary
  const summaryEl = document.querySelector("#filterSummary");
  summaryEl.textContent = filtered.length === allShifts.length
    ? `${allShifts.length} shifts total`
    : `${filtered.length} of ${allShifts.length} shifts`;

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="wl-card wl-panel" style="text-align:center;padding:40px 20px;color:var(--muted);">
        <div style="font-size:32px;margin-bottom:10px;">🔍</div>
        <div style="font-weight:700;">No shifts match your filters</div>
        <div class="wl-subtext" style="margin-top:6px;">Try adjusting or clearing the filters above.</div>
      </div>`;
    return;
  }

  // Group by date
  const groups = new Map();
  for (const s of filtered) {
    const d = s.shift_date || "No date";
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(s);
  }

  listEl.innerHTML = [...groups.entries()].map(([date, shifts]) => {
    const label = formatDateLabel(date);
    const isToday = date === isoToday();
    return `
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-weight:800;font-size:14px;${isToday ? "color:var(--brand);" : ""}">
            ${escapeHtml(label)}
          </span>
          ${isToday ? `<span style="background:var(--brand);color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;">TODAY</span>` : ""}
          <span style="font-size:12px;color:var(--muted);">${shifts.length} shift${shifts.length !== 1 ? "s" : ""}</span>
        </div>
        <div style="display:grid;gap:8px;">
          ${shifts.map(s => renderShiftCard(s, assignedByShift.get(s.id) || [], employeeMap)).join("")}
        </div>
      </div>`;
  }).join("");
}

// ── Shift card ─────────────────────────────────────────────────────────────
function renderShiftCard(s, assignedIds, labelMap) {
  const href         = path(`/app/manager/shift.html?id=${encodeURIComponent(s.id)}`);
  const assignedCount = assignedIds.length;
  const top2         = assignedIds.slice(0, 2).map(id => labelMap.get(id) || id);

  const recurBadge = s.is_recurring
    ? `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;
        background:var(--brand-soft);border:1.5px solid var(--brand-border);color:var(--brand);">
        ♻${!s.recur_end_date ? " Ongoing" : " Recurring"}
       </span>`
    : "";

  const startTime = formatTime(s.start_at);
  const endTime   = formatTime(s.end_at);

  const unassignedWarning = assignedCount === 0
    ? `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;
        background:#fff3cd;border:1.5px solid #ffc107;color:#856404;">
        ⚠ Unassigned
       </span>`
    : "";

  return `
    <a class="wl-card wl-panel" href="${href}"
      style="display:block;text-decoration:none;transition:border-color .15s,box-shadow .15s;"
      onmouseover="this.style.borderColor='var(--brand-border)';this.style.boxShadow='var(--shadow-md)'"
      onmouseout="this.style.borderColor='';this.style.boxShadow=''">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
        
        <!-- Left: title + meta -->
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <span style="font-weight:800;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${escapeHtml(s.title || "Untitled shift")}
            </span>
            ${recurBadge}
            ${unassignedWarning}
          </div>

          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted);">
            <span>🕐 ${escapeHtml(startTime)} – ${escapeHtml(endTime)}</span>
            ${s.location ? `<span>📍 ${escapeHtml(s.location)}</span>` : ""}
            <span>👥 ${assignedCount === 0 ? "No one assigned" : `${assignedCount} assigned`}</span>
          </div>

          ${assignedCount > 0 ? `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
              ${top2.map(name => `
                <span style="background:var(--surface-2,#f3f4f6);border:1px solid var(--wl-border);
                  padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;">
                  ${escapeHtml(name)}
                </span>`).join("")}
              ${assignedCount > 2 ? `
                <span style="background:var(--surface-2,#f3f4f6);border:1px solid var(--wl-border);
                  padding:2px 10px;border-radius:20px;font-size:12px;color:var(--muted);">
                  +${assignedCount - 2} more
                </span>` : ""}
            </div>
          ` : ""}
        </div>

        <!-- Right: status + arrow -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
          ${renderStatusBadge(s.status)}
          <span style="font-size:12px;color:var(--muted);">View →</span>
        </div>
      </div>
    </a>`;
}

function renderStatusBadge(statusRaw) {
  const status = String(statusRaw || "ACTIVE").toUpperCase();
  const map = {
    PUBLISHED: { cls: "wl-badge--active",    label: "Active" },
    ACTIVE:    { cls: "wl-badge--active",    label: "Active" },
    CANCELLED: { cls: "wl-badge--cancelled", label: "Cancelled" },
    DRAFT:     { cls: "wl-badge--draft",     label: "Draft" },
    OFFERED:   { cls: "wl-badge--offered",   label: "Offered" },
  };
  const s = map[status] || { cls: "", label: status };
  return `<span class="wl-badge ${s.cls}">${escapeHtml(s.label)}</span>`;
}

// ── Filter event listeners ─────────────────────────────────────────────────
["filterSearch", "filterEmployee", "filterStatus", "filterDate"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", renderList);
  document.getElementById(id)?.addEventListener("change", renderList);
});

document.getElementById("clearFilters")?.addEventListener("click", () => {
  document.getElementById("filterSearch").value   = "";
  document.getElementById("filterEmployee").value = "";
  document.getElementById("filterStatus").value   = "";
  document.getElementById("filterDate").value     = "";
  renderList();
});

// ── Date utils ─────────────────────────────────────────────────────────────
function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function isoAddDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function isoMonthEnd(iso) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(new Date(d.getFullYear(), d.getMonth()+1, 0).getDate())}`;
}
function pad(n) { return String(n).padStart(2, "0"); }

function formatDateLabel(iso) {
  if (!iso || iso === "No date") return "No date";
  const today     = isoToday();
  const tomorrow  = isoAddDays(today, 1);
  const yesterday = isoAddDays(today, -1);
  if (iso === today)     return "Today";
  if (iso === tomorrow)  return "Tomorrow";
  if (iso === yesterday) return "Yesterday";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "pm" : "am";
  const h12  = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function escapeHtml(str) {
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
