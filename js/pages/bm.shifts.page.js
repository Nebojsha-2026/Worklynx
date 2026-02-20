// js/pages/bm.shifts.page.js
// BM sees all shifts across the org (read-only overview with full filtering)
import { requireRole }              from "../core/guards.js";
import { renderHeader }             from "../ui/header.js";
import { renderFooter }             from "../ui/footer.js";
import { renderSidebar }            from "../ui/sidebar.js";
import { loadOrgContext }           from "../core/orgContext.js";
import { listShifts }               from "../data/shifts.api.js";
import { listAssignmentsForShifts } from "../data/shiftAssignments.api.js";
import { listOrgMembers }           from "../data/members.api.js";
import { path }                     from "../core/config.js";

await requireRole(["BM", "BO"]);
const org = await loadOrgContext();

document.body.prepend(renderHeader({ companyName: org.name, companyLogoUrl: org.company_logo_url }));
document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.innerHTML = `<div class="wl-shell"><div id="wlSidebar"></div><div id="wlContent"></div></div>`;
main.querySelector("#wlSidebar").append(renderSidebar("BM"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">All Shifts</h1>
      <p style="margin:4px 0 0;color:var(--muted);font-size:13px;">Overview of all scheduled shifts across the organisation</p>
    </div>
  </div>

  <div class="wl-card wl-panel" style="margin-bottom:16px;">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end;">
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Search</label>
        <input id="filterSearch" type="search" placeholder="Title, location…"
          style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);" />
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Status</label>
        <select id="filterStatus"
          style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);">
          <option value="">All statuses</option>
          <option value="PUBLISHED">Active</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Date</label>
        <select id="filterDate"
          style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--wl-border);font-size:13px;background:var(--bg);">
          <option value="">All dates</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="next7">Next 7 days</option>
          <option value="past">Past</option>
        </select>
      </div>
      <button id="clearFilters" class="wl-btn" style="white-space:nowrap;padding:8px 14px;font-size:13px;">Clear</button>
    </div>
    <div id="filterSummary" style="margin-top:10px;font-size:13px;color:var(--muted);"></div>
  </div>

  <div id="shiftsList"></div>
`;

const listEl = content.querySelector("#shiftsList");
let allShifts = [];
let assignedByShift = new Map();
let employeeMap = new Map();

try {
  listEl.innerHTML = `<div style="padding:20px 0;color:var(--muted);">Loading shifts…</div>`;

  const [shiftsRaw, membersRaw] = await Promise.all([
    listShifts({ organizationId: org.id, limit: 500 }),
    listOrgMembers({ organizationId: org.id, roles: ["EMPLOYEE"] }),
  ]);

  allShifts = (shiftsRaw || []).sort((a, b) => {
    const ad = String(a.shift_date || "");
    const bd = String(b.shift_date || "");
    return ad !== bd ? ad.localeCompare(bd) : String(a.start_at || "").localeCompare(String(b.start_at || ""));
  });

  employeeMap = new Map((membersRaw || []).map(m => [m.user_id, m.full_name || m.email || m.user_id]));

  const shiftIds = allShifts.map(s => s.id);
  const assigns = shiftIds.length ? await listAssignmentsForShifts({ shiftIds }) : [];
  for (const a of assigns || []) {
    const arr = assignedByShift.get(a.shift_id) || [];
    arr.push(a.employee_user_id);
    assignedByShift.set(a.shift_id, arr);
  }

  renderList();
} catch (err) {
  listEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load shifts: ${escapeHtml(err?.message || "")}</div>`;
}

function getFiltered() {
  const search = content.querySelector("#filterSearch")?.value.trim().toLowerCase() || "";
  const status = content.querySelector("#filterStatus")?.value || "";
  const dateRange = content.querySelector("#filterDate")?.value || "";
  const today = isoToday();

  return allShifts.filter(s => {
    if (search && !`${s.title || ""} ${s.location || ""}`.toLowerCase().includes(search)) return false;
    if (status && String(s.status || "PUBLISHED").toUpperCase() !== status) return false;
    if (dateRange) {
      const d = s.shift_date || "";
      if (dateRange === "today" && d !== today) return false;
      if (dateRange === "week" && (d < today || d > isoAddDays(today, 6))) return false;
      if (dateRange === "next7" && (d < today || d > isoAddDays(today, 7))) return false;
      if (dateRange === "past" && d >= today) return false;
    }
    return true;
  });
}

function renderList() {
  const filtered = getFiltered();
  const summaryEl = content.querySelector("#filterSummary");
  summaryEl.textContent = filtered.length === allShifts.length
    ? `${allShifts.length} shifts total`
    : `${filtered.length} of ${allShifts.length} shifts`;

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="wl-card wl-panel" style="text-align:center;padding:40px 20px;color:var(--muted);">
        <div style="font-size:32px;margin-bottom:10px;">🔍</div>
        <div style="font-weight:700;">No shifts match your filters</div>
      </div>`;
    return;
  }

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
          ${shifts.map(s => {
            const assignedIds = assignedByShift.get(s.id) || [];
            const assignedCount = assignedIds.length;
            const top2 = assignedIds.slice(0, 2).map(id => employeeMap.get(id) || id);
            const startTime = formatTime(s.start_at);
            const endTime = formatTime(s.end_at);
            const status = String(s.status || "PUBLISHED").toUpperCase();
            const statusColor = status === "CANCELLED" ? "#dc2626" : status === "PUBLISHED" ? "#16a34a" : "#64748b";
            return `
              <div class="wl-card wl-panel">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                      <span style="font-weight:800;font-size:15px;">${escapeHtml(s.title || "Untitled shift")}</span>
                      ${s.is_recurring ? `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:var(--brand-soft);border:1.5px solid var(--brand-border);color:var(--brand);">♻ Recurring</span>` : ""}
                      ${assignedCount === 0 ? `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#fff3cd;border:1.5px solid #ffc107;color:#856404;">⚠ Unassigned</span>` : ""}
                    </div>
                    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted);">
                      <span>🕐 ${escapeHtml(startTime)} – ${escapeHtml(endTime)}</span>
                      ${s.location ? `<span>📍 ${escapeHtml(s.location)}</span>` : ""}
                      <span>👥 ${assignedCount === 0 ? "No one assigned" : `${assignedCount} assigned`}</span>
                      ${s.hourly_rate ? `<span>💰 $${parseFloat(s.hourly_rate).toFixed(2)}/hr</span>` : ""}
                    </div>
                    ${assignedCount > 0 ? `
                      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                        ${top2.map(name => `<span style="background:var(--surface-2,#f3f4f6);border:1px solid var(--wl-border);padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;">${escapeHtml(name)}</span>`).join("")}
                        ${assignedCount > 2 ? `<span style="background:var(--surface-2,#f3f4f6);border:1px solid var(--wl-border);padding:2px 10px;border-radius:20px;font-size:12px;color:var(--muted);">+${assignedCount - 2} more</span>` : ""}
                      </div>` : ""}
                  </div>
                  <span style="font-size:12px;font-weight:700;color:${statusColor};">${status}</span>
                </div>
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }).join("");
}

["filterSearch", "filterStatus", "filterDate"].forEach(id => {
  content.getElementById?.(id)?.addEventListener("input", renderList);
  content.querySelector?.(`#${id}`)?.addEventListener("change", renderList);
});
content.querySelector("#filterSearch").addEventListener("input", renderList);
content.querySelector("#filterStatus").addEventListener("change", renderList);
content.querySelector("#filterDate").addEventListener("change", renderList);
content.querySelector("#clearFilters").addEventListener("click", () => {
  content.querySelector("#filterSearch").value = "";
  content.querySelector("#filterStatus").value = "";
  content.querySelector("#filterDate").value = "";
  renderList();
});

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function isoAddDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, "0"); }
function formatDateLabel(iso) {
  if (!iso || iso === "No date") return "No date";
  const today = isoToday();
  if (iso === today) return "Today";
  if (iso === isoAddDays(today, 1)) return "Tomorrow";
  if (iso === isoAddDays(today, -1)) return "Yesterday";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "pm" : "am"}`;
}
function escapeHtml(str) {
  return String(str || "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
