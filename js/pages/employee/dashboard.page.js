// js/pages/employee.dashboard.page.js
import { requireRole } from "../core/guards.js";
import { renderHeader } from "../ui/header.js";
import { renderFooter } from "../ui/footer.js";
import { renderSidebar } from "../ui/sidebar.js";
import { loadOrgContext } from "../core/orgContext.js";
import { getSupabase } from "../core/supabaseClient.js";
import { path } from "../core/config.js";
import { getSession } from "../core/session.js";

import { listMyShiftAssignments } from "../data/shiftAssignments.api.js";

await requireRole(["EMPLOYEE"]);

const org = await loadOrgContext();
const supabase = getSupabase();

// Header + footer
document.body.prepend(
  renderHeader({
    companyName: org.name,
    companyLogoUrl: org.company_logo_url,
  })
);
document.body.append(renderFooter({ version: "v0.1.0" }));

// Shell
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
  <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <div>
      <h1 style="margin:0;">Dashboard</h1>
      <div style="font-size:13px; opacity:.8; margin-top:6px;">
        Your shifts, time tracking, and estimated earnings.
      </div>
    </div>
    <a class="wl-btn" href="${path("/app/employee/my-shifts.html")}">View all shifts</a>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center;">
      <div>
        <div style="font-weight:900;">Today</div>
        <div style="font-size:13px; opacity:.8; margin-top:4px;" id="todaySub">
          Loading…
        </div>
      </div>
      <div id="todayPill"></div>
    </div>

    <div id="todayBody" style="margin-top:12px;"></div>
  </section>

  <div class="wl-form__row" style="margin-top:12px;">
    <section class="wl-card wl-panel">
      <div style="font-weight:900;">Upcoming shifts</div>
      <div style="font-size:13px; opacity:.8; margin-top:6px;">
        Next 14 days
      </div>
      <div id="upcomingList" style="display:grid; gap:10px; margin-top:12px;"></div>
    </section>

    <section class="wl-card wl-panel">
      <div style="font-weight:900;">Earnings snapshot</div>
      <div style="font-size:13px; opacity:.8; margin-top:6px;">
        Estimated totals (safe if data missing)
      </div>

      <div id="earningsBox" style="margin-top:12px;">
        <div style="opacity:.85;">Loading…</div>
      </div>
    </section>
  </div>
`;

const todaySubEl = document.querySelector("#todaySub");
const todayPillEl = document.querySelector("#todayPill");
const todayBodyEl = document.querySelector("#todayBody");
const upcomingListEl = document.querySelector("#upcomingList");
const earningsBoxEl = document.querySelector("#earningsBox");

try {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  // 1) Load upcoming shifts assigned to this employee
  const upcoming = await loadUpcomingAssignedShifts({ days: 14 });

  // 2) Detect open time entry (clocked in) + related shift
  const active = await getActiveClockedInShift({ userId });

  // 3) Render top strip
  renderToday({ upcoming, active });

  // 4) Render upcoming list
  renderUpcoming(upcoming);

  // 5) Earnings snapshot (best-effort)
  await renderEarningsSnapshot({ userId, upcoming });
} catch (err) {
  console.error(err);
  todaySubEl.textContent = "Could not load dashboard.";
  todayPillEl.innerHTML = `<span class="wl-badge wl-badge--cancelled">Error</span>`;
  todayBodyEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err?.message || "")}</div>`;
  upcomingListEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load shifts.</div>`;
  earningsBoxEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load earnings.</div>`;
}

/* --------------------------
   Data
--------------------------- */

async function loadUpcomingAssignedShifts({ days }) {
  const assigns = await listMyShiftAssignments(); // [{ shift_id, ... }]
  const ids = (assigns || []).map((a) => a.shift_id).filter(Boolean);
  if (!ids.length) return [];

  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // We'll fetch shifts by ids, then filter in JS (simple, safe)
  const { data: shifts, error } = await supabase
    .from("shifts")
    .select("*")
    .in("id", ids)
    .limit(500);

  if (error) throw error;

  const list = (shifts || [])
    .filter((s) => {
      const start = shiftStartMs(s);
      const within = Number.isFinite(start) && start <= end.getTime();
      return within;
    })
    .sort((a, b) => shiftStartMs(a) - shiftStartMs(b));

  return list;
}

// Best-effort open clocked-in shift detector.
// If your DB relations differ, this returns null (dashboard still works).
async function getActiveClockedInShift({ userId }) {
  // Strategy:
  // A) Try a join: time_entries -> timesheets (employee_user_id, shift_id) -> shifts
  // B) If join fails, return null safely.

  try {
    const { data: rows, error } = await supabase
      .from("time_entries")
      .select(
        `
        id,
        timesheet_id,
        clock_in,
        clock_out,
        break_minutes,
        timesheets!inner(
          id,
          employee_user_id,
          shift_id
        )
      `
      )
      .is("clock_out", null)
      .eq("timesheets.employee_user_id", userId)
      .order("clock_in", { ascending: false })
      .limit(1);

    if (error) throw error;

    const row = rows?.[0];
    if (!row) return null;

    const shiftId = row.timesheets?.shift_id;
    if (!shiftId) return null;

    const { data: shift, error: sErr } = await supabase
      .from("shifts")
      .select("*")
      .eq("id", shiftId)
      .single();

    if (sErr || !shift) return null;

    return { timeEntry: row, shift };
  } catch (e) {
    console.warn("Active clock-in join failed (safe to ignore):", e);
    return null;
  }
}

/* --------------------------
   Render
--------------------------- */

function renderToday({ upcoming, active }) {
  const now = new Date();
  const today = isoDate(now);

  const todayShift = upcoming.find((s) => String(s.shift_date) === today) || null;
  const nextShift = upcoming.find((s) => shiftStartMs(s) >= now.getTime()) || todayShift || null;

  if (active?.shift) {
    const s = active.shift;
    todaySubEl.textContent = "You are currently clocked in.";
    todayPillEl.innerHTML = `<span class="wl-badge wl-badge--active">Clocked in</span>`;

    const since = active.timeEntry?.clock_in
      ? new Date(active.timeEntry.clock_in).toLocaleString()
      : "";

    todayBodyEl.innerHTML = `
      <div class="wl-alert">
        <div style="font-weight:900;">${escapeHtml(s.title || "Active shift")}</div>
        <div style="font-size:13px; opacity:.85; margin-top:6px;">
          Started: ${escapeHtml(since)}
        </div>
        <div style="margin-top:10px;">
          <a class="wl-btn" href="${path(`/app/employee/shift.html?id=${encodeURIComponent(s.id)}`)}">
            Go to active shift →
          </a>
        </div>
      </div>
    `;
    return;
  }

  todayPillEl.innerHTML = `<span class="wl-badge wl-badge--draft">Not clocked in</span>`;

  if (!nextShift) {
    todaySubEl.textContent = "No upcoming shifts.";
    todayBodyEl.innerHTML = `
      <div class="wl-alert" style="opacity:.95;">
        You don’t have any assigned shifts coming up.
        <div style="font-size:13px; opacity:.85; margin-top:6px;">
          If you believe this is wrong, ask your manager to assign you.
        </div>
      </div>
    `;
    return;
  }

  const when = formatWhenLabel(nextShift.shift_date);
  const loc = nextShift.location ? ` • 📍 ${nextShift.location}` : "";
  const needsTracking = nextShift.track_time === false ? false : true;

  todaySubEl.textContent = todayShift ? "Your shift today" : "Your next shift";
  todayBodyEl.innerHTML = `
    <div class="wl-alert">
      <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <div style="min-width:0;">
          <div style="font-weight:900;">${escapeHtml(nextShift.title || "Upcoming shift")}</div>
          <div style="font-size:13px; opacity:.85; margin-top:6px;">
            <b>${escapeHtml(when)}</b> • ${escapeHtml(nextShift.start_at || "")} → ${escapeHtml(nextShift.end_at || "")}
            ${escapeHtml(loc)}
          </div>
          ${
            needsTracking
              ? ""
              : `<div style="font-size:13px; opacity:.85; margin-top:6px;">
                   ✅ No tracking required for this shift (you can still clock in if you want).
                 </div>`
          }
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          ${renderStatusBadge(String(nextShift.status || "PUBLISHED").toUpperCase())}
        </div>
      </div>

      <div style="margin-top:10px;">
        <a class="wl-btn" href="${path(`/app/employee/shift.html?id=${encodeURIComponent(nextShift.id)}`)}">
          Open shift →
        </a>
      </div>
    </div>
  `;
}

function renderUpcoming(shifts) {
  if (!shifts.length) {
    upcomingListEl.innerHTML = `
      <div class="wl-alert" style="opacity:.95;">
        No shifts to show.
      </div>
    `;
    return;
  }

  upcomingListEl.innerHTML = shifts.slice(0, 10).map(renderShiftCard).join("");
}

function renderShiftCard(s) {
  const status = String(s.status || "PUBLISHED").toUpperCase();
  const isCancelled = status === "CANCELLED";
  const when = formatWhenLabel(s.shift_date);
  const href = path(`/app/employee/shift.html?id=${encodeURIComponent(s.id)}`);
  const needsTracking = s.track_time === false ? false : true;

  return `
    <a class="wl-card wl-panel ${isCancelled ? "is-cancelled" : ""}" href="${href}" style="display:block;">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(s.title || "Untitled shift")}
          </div>
          <div style="opacity:.85; font-size:13px; margin-top:6px;">
            <b>${escapeHtml(when)}</b> • ${escapeHtml(s.start_at || "")} → ${escapeHtml(s.end_at || "")}
            ${s.location ? ` • 📍 ${escapeHtml(s.location)}` : ""}
          </div>
          ${
            needsTracking
              ? ""
              : `<div style="font-size:13px; opacity:.85; margin-top:6px;">
                   No tracking required
                 </div>`
          }
        </div>

        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex:0 0 auto;">
          ${renderStatusBadge(status)}
          <div style="opacity:.8; font-size:13px;">View →</div>
        </div>
      </div>
    </a>
  `;
}

/* --------------------------
   Earnings snapshot (best-effort)
--------------------------- */

async function renderEarningsSnapshot({ userId }) {
  // Safe placeholders if we can't compute yet
  let week = null;
  let month = null;

  try {
    // Try to compute using completed time_entries joined to timesheets.
    // If your schema differs, this will throw and we’ll show placeholders.
    const now = new Date();
    const weekStart = startOfWeek(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    week = await computeEstimatedEarnings({ userId, from: weekStart, to: now });
    month = await computeEstimatedEarnings({ userId, from: monthStart, to: now });
  } catch (e) {
    console.warn("Earnings snapshot not available yet (safe to ignore):", e);
  }

  earningsBoxEl.innerHTML = `
    <div class="wl-alert">
      <div style="display:grid; gap:10px;">
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div style="opacity:.85;">This week</div>
          <div style="font-weight:900;">${week ? escapeHtml(week) : "—"}</div>
        </div>
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div style="opacity:.85;">This month</div>
          <div style="font-weight:900;">${month ? escapeHtml(month) : "—"}</div>
        </div>

        <div style="font-size:12px; opacity:.75;">
          Scheduled pay is used where tracking is not required.
          Clocked pay is used where tracking is required and completed.
        </div>
      </div>
    </div>
  `;
}

async function computeEstimatedEarnings({ userId, from, to }) {
  // Completed entries during range, join to timesheets for employee + shift_id,
  // then fetch shifts to get hourly_rate + break_is_paid + track_time.
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const { data: entries, error } = await supabase
    .from("time_entries")
    .select(
      `
      id,
      timesheet_id,
      clock_in,
      clock_out,
      break_minutes,
      timesheets!inner(
        id,
        employee_user_id,
        shift_id
      )
    `
    )
    .not("clock_out", "is", null)
    .gte("clock_in", fromIso)
    .lte("clock_in", toIso)
    .eq("timesheets.employee_user_id", userId)
    .limit(500);

  if (error) throw error;

  const shiftIds = Array.from(new Set((entries || []).map((e) => e.timesheets?.shift_id).filter(Boolean)));
  if (!shiftIds.length) return "$0.00";

  const { data: shifts, error: sErr } = await supabase
    .from("shifts")
    .select("id, hourly_rate, break_is_paid, track_time")
    .in("id", shiftIds)
    .limit(500);

  if (sErr) throw sErr;

  const shiftById = new Map((shifts || []).map((s) => [s.id, s]));

  let total = 0;

  for (const e of entries || []) {
    const sid = e.timesheets?.shift_id;
    const s = sid ? shiftById.get(sid) : null;
    if (!s) continue;

    const hr = s.hourly_rate != null ? Number(s.hourly_rate) : null;
    if (!Number.isFinite(hr) || hr <= 0) continue;

    const breakIsPaid = !!s.break_is_paid;

    const totals = calcTotals({
      clockIn: e.clock_in,
      clockOut: e.clock_out,
      breakMinutes: Number(e.break_minutes || 0),
      breakIsPaid,
      hourlyRate: hr,
    });

    if (!totals) continue;

    const pay = Number(totals.payNumber || 0);
    if (Number.isFinite(pay)) total += pay;
  }

  return `$${total.toFixed(2)}`;
}

/* --------------------------
   Shared helpers
--------------------------- */

function shiftStartMs(s) {
  // Uses shift_date + start_at (TIME), local time.
  if (!s?.shift_date || !s?.start_at) return NaN;
  return new Date(`${s.shift_date}T${String(s.start_at).slice(0, 8)}`).getTime();
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0 Sun
  const diff = (day + 6) % 7; // Monday as start
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function calcTotals({ clockIn, clockOut, breakMinutes, breakIsPaid, hourlyRate }) {
  if (!clockIn || !clockOut) return null;

  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const diffMs = end - start;
  const totalWorkedMins = Math.max(1, Math.round(diffMs / 60000));

  const b = Math.max(0, Number(breakMinutes || 0));
  const paidMinsRaw = breakIsPaid ? totalWorkedMins : Math.max(0, totalWorkedMins - b);

  const paidMinsRounded = roundForPay(paidMinsRaw);

  const pay =
    Number.isFinite(hourlyRate) && hourlyRate != null
      ? (paidMinsRounded / 60) * Number(hourlyRate)
      : 0;

  return {
    workedMins: totalWorkedMins,
    paidMinsRaw,
    paidMinsRounded,
    payNumber: pay,
  };

  // 0–19 -> 0
  // 20–44 -> 30
  // 45–? -> 60 (and so on using 30-min blocks for remainder)
  function roundForPay(mins) {
    if (!mins || mins <= 0) return 0;
    if (mins <= 19) return 0;

    const hours = Math.floor(mins / 60);
    const rem = mins % 60;

    let roundedRem = 0;
    if (rem <= 19) roundedRem = 0;
    else if (rem <= 44) roundedRem = 30;
    else roundedRem = 60;

    return hours * 60 + roundedRem;
  }
}

function renderStatusBadge(status) {
  const map = {
    PUBLISHED: { cls: "wl-badge--active", label: "Active" },
    ACTIVE: { cls: "wl-badge--active", label: "Active" },
    CANCELLED: { cls: "wl-badge--cancelled", label: "Cancelled" },
    DRAFT: { cls: "wl-badge--draft", label: "Draft" },
    OFFERED: { cls: "wl-badge--offered", label: "Offered" },
  };
  const s = map[status] || { cls: "", label: status || "Active" };
  return `<span class="wl-badge ${s.cls}">${escapeHtml(s.label)}</span>`;
}

function formatWhenLabel(yyyyMmDd) {
  if (!yyyyMmDd || String(yyyyMmDd).length < 10) return String(yyyyMmDd || "");

  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  if (!y || !m || !d) return String(yyyyMmDd || "");

  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dt = new Date(y, m - 1, d).getTime();
  const diffDays = Math.round((dt - t0) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return String(yyyyMmDd);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
