// js/pages/employee/my-shifts.page.js - ORGANIZED BY DAY
import { getSupabase } from "../../core/supabaseClient.js";
import { listMyShiftAssignments } from "../../data/shiftAssignments.api.js";
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { path } from "../../core/config.js";

await requireRole(["EMPLOYEE"]);

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

main.querySelector("#wlSidebar").append(renderSidebar("EMPLOYEE"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
    <div>
      <h1 style="margin: 0; font-size: 28px; font-weight: 800;">My shifts</h1>
      <div style="font-size: 14px; color: #64748b; margin-top: 6px;">
        Shifts you've been assigned to.
      </div>
    </div>

    <div class="wl-filter-group" id="shiftFilter">
      <button class="wl-filter is-active" data-filter="active" type="button">
        Active
      </button>
      <button class="wl-filter" data-filter="all" type="button">
        All
      </button>
    </div>
  </div>

  <div id="shiftsList"></div>
`;

const listEl = document.querySelector("#shiftsList");

let allShifts = [];
let currentFilter = "active";

// Filter buttons
document.querySelectorAll("#shiftFilter .wl-filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("#shiftFilter .wl-filter")
      .forEach((b) => b.classList.remove("is-active"));

    btn.classList.add("is-active");
    currentFilter = btn.dataset.filter || "active";
    render();
  });
});

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

async function load() {
  listEl.innerHTML = `<div style="opacity: 0.6; padding: 20px;">Loading your shifts…</div>`;

  const assigns = await listMyShiftAssignments();
  const ids = (assigns || []).map((a) => a.shift_id).filter(Boolean);

  if (!ids.length) {
    allShifts = [];
    render();
    return;
  }

  const supabase = getSupabase();
  const { data: shifts, error } = await supabase
    .from("shifts")
    .select("*")
    .in("id", ids)
    .order("shift_date", { ascending: true })
    .order("start_at", { ascending: true })
    .limit(500);

  if (error) throw error;

  allShifts = shifts || [];
  render();
}

function render() {
  const filtered = allShifts.filter((s) => {
    const status = String(s.status || "PUBLISHED").toUpperCase();
    if (currentFilter === "active" && status === "CANCELLED") {
      return false;
    }
    return true;
  });

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="wl-card" style="padding: 32px; border: 1px solid #e2e8f0; border-radius: 12px; text-align: center;">
        <div style="font-size: 16px; color: #64748b; margin-bottom: 8px;">No shifts to show.</div>
        <div style="font-size: 14px; color: #94a3b8;">
          If you believe this is incorrect, contact your manager.
        </div>
      </div>
    `;
    return;
  }

  // Group shifts by date
  const groupedByDate = {};
  filtered.forEach((shift) => {
    const date = shift.shift_date || "No date";
    if (!groupedByDate[date]) {
      groupedByDate[date] = [];
    }
    groupedByDate[date].push(shift);
  });

  // Sort dates (today first, then chronologically)
  const today = new Date().toISOString().split("T")[0];
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
    if (a === today) return -1;
    if (b === today) return 1;
    return a.localeCompare(b);
  });

  // Render grouped by day
  listEl.innerHTML = sortedDates.map((date) => {
    const shiftsForDay = groupedByDate[date];
    const dayName = getDayName(date);
    const dateFormatted = formatDateDDMMYYYY(date);
    const isToday = date === today;

    return `
      <div style="margin-bottom: 32px;">
        <!-- Day Header -->
        <div style="padding: 16px 0; border-bottom: 2px solid ${isToday ? '#3b82f6' : '#e2e8f0'}; margin-bottom: 16px;">
          <div style="font-size: 20px; font-weight: 800; color: ${isToday ? '#3b82f6' : '#1e293b'};">
            ${isToday ? '📍 TODAY — ' : ''}${escapeHtml(dayName).toUpperCase()} ${escapeHtml(dateFormatted)}
          </div>
          <div style="font-size: 14px; color: #64748b; margin-top: 4px;">
            ${shiftsForDay.length} shift${shiftsForDay.length === 1 ? '' : 's'}
          </div>
        </div>

        <!-- Shifts for this day -->
        <div style="display: grid; gap: 12px;">
          ${shiftsForDay.map(s => renderShiftCard(s, isToday)).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function renderShiftCard(shift, isToday) {
  const href = path(`/app/employee/shift.html?id=${encodeURIComponent(shift.id)}`);
  const status = String(shift.status || "PUBLISHED").toUpperCase();
  const isCancelled = status === "CANCELLED";

  const title = shift.title || "Untitled shift";
  const dateFormatted = formatDateDDMMYYYY(shift.shift_date);
  const start = shift.start_at || "";
  const end = shift.end_at || "";
  const location = shift.location || "";

  const borderColor = isToday && !isCancelled ? "#3b82f6" : "#e2e8f0";
  const bgColor = isToday && !isCancelled ? "#eff6ff" : "white";

  return `
    <a href="${href}" 
       class="wl-card" 
       style="display: block; padding: 20px; border: 2px solid ${borderColor}; background: ${bgColor}; border-radius: 12px; text-decoration: none; color: inherit; ${isCancelled ? 'opacity: 0.5;' : ''} transition: all 0.2s;">
      <div style="display: flex; justify-content: space-between; align-items: start; gap: 16px;">
        <div style="flex: 1; min-width: 0;">
          <!-- Shift Title -->
          <div style="font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(title)}
          </div>

          <!-- Date & Time -->
          <div style="font-size: 14px; color: #64748b; margin-bottom: 8px;">
            <strong>${escapeHtml(dateFormatted)}</strong> • ${escapeHtml(start)} → ${escapeHtml(end)}
          </div>

          <!-- Location -->
          ${location ? `
            <div style="font-size: 14px; color: #64748b; margin-bottom: 8px;">
              📍 ${escapeHtml(location)}
            </div>
          ` : ''}

          <!-- Assignment Status -->
          <div style="font-size: 13px; color: #10b981; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
            ✅ Assigned to you
          </div>

          ${isCancelled ? `
            <div style="font-size: 13px; color: #ef4444; margin-top: 8px; font-weight: 600;">
              ⚠️ This shift was cancelled
            </div>
          ` : ''}
        </div>

        <!-- Status Badge & View Link -->
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          ${renderStatusBadge(status)}
          <div style="color: #3b82f6; font-size: 13px; font-weight: 600;">View →</div>
        </div>
      </div>
    </a>
  `;
}

function renderStatusBadge(status) {
  const map = {
    PUBLISHED: { bg: "#10b981", label: "Active" },
    ACTIVE: { bg: "#10b981", label: "Active" },
    CANCELLED: { bg: "#ef4444", label: "Cancelled" },
    DRAFT: { bg: "#94a3b8", label: "Draft" },
    OFFERED: { bg: "#f59e0b", label: "Offered" },
  };

  const s = map[status] || { bg: "#94a3b8", label: status };
  return `
    <span style="background: ${s.bg}; color: white; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">
      ${escapeHtml(s.label)}
    </span>
  `;
}

function formatDateDDMMYYYY(yyyyMmDd) {
  if (!yyyyMmDd || String(yyyyMmDd).length < 10) return String(yyyyMmDd || "");
  const [y, m, d] = String(yyyyMmDd).split("-");
  return `${d}/${m}/${y}`;
}

function getDayName(yyyyMmDd) {
  if (!yyyyMmDd || String(yyyyMmDd).length < 10) return "";
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  if (!y || !m || !d) return "";
  
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-AU", { weekday: "long" });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
