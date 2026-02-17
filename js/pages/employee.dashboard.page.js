// js/pages/employee.dashboard.page.js - PROFESSIONAL VERSION
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";
import { getSupabase } from "../core/supabaseClient.js";
import { listMyShiftAssignments } from "../data/shiftAssignments.api.js";
import { path } from "../core/config.js";

await requireRole(["EMPLOYEE", "MANAGER", "BM", "BO"]);

const org = await loadOrgContext();

document.body.prepend(
  renderHeader({
    companyName: org.name,
    companyLogoUrl: org.company_logo_url,
  })
);

document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.classList.add("wl-page");

main.innerHTML = `
  <div class="wl-shell">
    <div id="wlSidebar"></div>
    <div id="wlContent"></div>
  </div>
`;

main.querySelector("#wlSidebar").append(renderSidebar("EMPLOYEE"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <div style="margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 28px;">Dashboard</h1>
    <p style="margin: 8px 0 0; color: #64748b;">Your shifts, time tracking, and earnings.</p>
  </div>

  <!-- Earnings Summary -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 32px;">
    <div class="wl-card" style="padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 8px;">THIS WEEK</div>
      <div style="font-size: 32px; font-weight: 800; color: #1e293b;" id="weekEarnings">$0.00</div>
      <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Mon — today</div>
    </div>
    
    <div class="wl-card" style="padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 8px;">THIS MONTH</div>
      <div style="font-size: 32px; font-weight: 800; color: #1e293b;" id="monthEarnings">$0.00</div>
      <div style="font-size: 13px; color: #64748b; margin-top: 4px;">1st — today</div>
    </div>
    
    <div class="wl-card" style="padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 8px;">ALL TIME</div>
      <div style="font-size: 32px; font-weight: 800; color: #1e293b;" id="allTimeEarnings">$0.00</div>
      <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Total earned</div>
    </div>
  </div>

  <!-- Today's Shift -->
  <div style="margin-bottom: 32px;">
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700;">Today</h2>
    <div id="todayShift"></div>
  </div>

  <!-- Upcoming Shifts (Next 7 Days) -->
  <div style="margin-bottom: 32px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700;">Upcoming shifts</h2>
      <a href="${path("/app/employee/my-shifts.html")}" style="color: #3b82f6; text-decoration: none; font-size: 14px; font-weight: 600;">View all shifts →</a>
    </div>
    <div id="upcomingShifts"></div>
  </div>
`;

// Load data
loadDashboardData();

async function loadDashboardData() {
  try {
    const todayEl = document.querySelector("#todayShift");
    const upcomingEl = document.querySelector("#upcomingShifts");
    
    todayEl.innerHTML = '<div style="opacity: 0.6;">Loading...</div>';
    upcomingEl.innerHTML = '<div style="opacity: 0.6;">Loading...</div>';

    // Get shift assignments
    const assigns = await listMyShiftAssignments();
    const shiftIds = (assigns || []).map((a) => a.shift_id).filter(Boolean);

    if (!shiftIds.length) {
      todayEl.innerHTML = '<div class="wl-card" style="padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; color: #64748b;">No shifts scheduled for today.</div>';
      upcomingEl.innerHTML = '<div class="wl-card" style="padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; color: #64748b;">No upcoming shifts in the next 7 days.</div>';
      return;
    }

    const supabase = getSupabase();
    const { data: shifts, error } = await supabase
      .from("shifts")
      .select("*")
      .in("id", shiftIds)
      .neq("status", "CANCELLED")
      .gte("shift_date", new Date().toISOString().split("T")[0])
      .order("shift_date", { ascending: true })
      .order("start_at", { ascending: true })
      .limit(50);

    if (error) throw error;

    const allShifts = shifts || [];
    const today = new Date().toISOString().split("T")[0];
    
    // Today's shifts
    const todayShifts = allShifts.filter(s => s.shift_date === today);
    
    if (todayShifts.length === 0) {
      todayEl.innerHTML = '<div class="wl-card" style="padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; color: #64748b;">No shifts scheduled for today.</div>';
    } else {
      todayEl.innerHTML = todayShifts.map(s => renderTodayShiftCard(s)).join("");
    }

    // Upcoming shifts (next 7 days, excluding today)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split("T")[0];
    
    const upcomingShifts = allShifts.filter(s => s.shift_date > today && s.shift_date <= nextWeekStr);
    
    if (upcomingShifts.length === 0) {
      upcomingEl.innerHTML = '<div class="wl-card" style="padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; color: #64748b;">No upcoming shifts in the next 7 days.</div>';
    } else {
      upcomingEl.innerHTML = upcomingShifts.slice(0, 5).map(s => renderUpcomingShiftCard(s)).join("");
    }

  } catch (err) {
    console.error(err);
    document.querySelector("#todayShift").innerHTML = '<div class="wl-alert wl-alert--error">Failed to load shifts.</div>';
  }
}

function renderTodayShiftCard(shift) {
  const href = path(`/app/employee/shift.html?id=${encodeURIComponent(shift.id)}`);
  const title = shift.title || "Untitled shift";
  const start = shift.start_at || "";
  const end = shift.end_at || "";
  const location = shift.location || "";

  return `
    <a href="${href}" class="wl-card" style="display: block; padding: 24px; border: 2px solid #3b82f6; border-radius: 12px; background: #eff6ff; text-decoration: none; color: inherit;">
      <div style="display: flex; justify-content: space-between; align-items: start; gap: 16px;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 8px;">${escapeHtml(title)}</div>
          <div style="font-size: 14px; color: #64748b; margin-bottom: 4px;">
            <strong>⏰ ${escapeHtml(start)} → ${escapeHtml(end)}</strong>
          </div>
          ${location ? `<div style="font-size: 14px; color: #64748b;">📍 ${escapeHtml(location)}</div>` : ''}
        </div>
        <div style="background: #3b82f6; color: white; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; white-space: nowrap;">
          ACTIVE
        </div>
      </div>
    </a>
  `;
}

function renderUpcomingShiftCard(shift) {
  const href = path(`/app/employee/shift.html?id=${encodeURIComponent(shift.id)}`);
  const title = shift.title || "Untitled shift";
  const dateFormatted = formatDateDDMMYYYY(shift.shift_date);
  const dayName = getDayName(shift.shift_date);
  const start = shift.start_at || "";
  const end = shift.end_at || "";
  const location = shift.location || "";

  return `
    <a href="${href}" class="wl-card" style="display: block; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; text-decoration: none; color: inherit; margin-bottom: 12px; transition: all 0.2s;">
      <div style="display: flex; justify-content: space-between; align-items: start; gap: 16px;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">${escapeHtml(title)}</div>
          <div style="font-size: 14px; color: #64748b; margin-bottom: 4px;">
            <strong>${escapeHtml(dayName)} ${escapeHtml(dateFormatted)}</strong> • ${escapeHtml(start)} → ${escapeHtml(end)}
          </div>
          ${location ? `<div style="font-size: 13px; color: #64748b;">📍 ${escapeHtml(location)}</div>` : ''}
        </div>
        <div style="color: #3b82f6; font-size: 13px; font-weight: 600;">View →</div>
      </div>
    </a>
  `;
}

function formatDateDDMMYYYY(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const [y, m, d] = String(yyyyMmDd).split("-");
  return `${d}/${m}/${y}`;
}

function getDayName(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
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
