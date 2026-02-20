// js/pages/employee/timesheets.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { getSupabase } from "../../core/supabaseClient.js";
import { getSession } from "../../core/session.js";
import { getOrgMember, normalizePaymentFrequency } from "../../data/members.api.js";
import { listMyShiftAssignments } from "../../data/shiftAssignments.api.js";

await requireRole(["EMPLOYEE"]);

const org = await loadOrgContext();
const supabase = getSupabase();

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
  <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap;">
    <div>
      <h1 style="margin:0;">Timesheets</h1>
      <div style="margin-top:6px; color:#64748b; font-size:13px;">View shifts by pay period. Earnings are based on scheduled hours.</div>
    </div>
    <div id="periodTag"></div>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div style="font-size:14px; color:#64748b;">All-time earnings (scheduled, non-cancelled)</div>
      <div id="allTimeEarnings" style="font-size:24px; font-weight:900;">—</div>
    </div>
  </section>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div id="periodList"><div style="opacity:.85;">Loading timesheets…</div></div>
  </section>
`;

const periodTagEl = document.querySelector("#periodTag");
const allTimeEarningsEl = document.querySelector("#allTimeEarnings");
const periodListEl = document.querySelector("#periodList");

try {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  const member = await getOrgMember({ organizationId: org.id, userId });
  const paymentFrequency = normalizePaymentFrequency(member?.payment_frequency);

  periodTagEl.innerHTML = `<span class="wl-badge wl-badge--active">Pay frequency: ${escapeHtml(paymentFrequency)}</span>`;

  // ── Load ALL assigned shifts (this is the source of truth, not the timesheets table)
  const shifts = await loadAllAssignedShifts({ userId });

  // ── Load timesheet rows so we can show clock-in/out status
  const timesheetMap = await loadTimesheetMap({ userId, shiftIds: shifts.map(s => s.id) });

  // ── All-time earnings: sum scheduled pay for non-cancelled shifts
  const nonCancelledShifts = shifts.filter(s => String(s.status || "").toUpperCase() !== "CANCELLED");
  const allTimeTotal = nonCancelledShifts.reduce((sum, s) => sum + calcScheduledPay(s), 0);
  allTimeEarningsEl.textContent = fmtMoney(allTimeTotal);

  renderCurrentPeriod({ shifts, timesheetMap, paymentFrequency });
} catch (err) {
  console.error(err);
  periodListEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err.message || "Failed to load timesheets.")}</div>`;
}

// ── Load all shifts the employee is assigned to (all time, all statuses)
async function loadAllAssignedShifts({ userId }) {
  const assigns = await listMyShiftAssignments();
  const ids = (assigns || []).map(a => a.shift_id).filter(Boolean);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("shifts")
    .select("id, title, shift_date, end_date, start_at, end_at, location, break_minutes, break_is_paid, hourly_rate, status, track_time")
    .in("id", ids)
    .order("shift_date", { ascending: false })
    .limit(1000);

  if (error) throw error;
  return data || [];
}

// ── Load timesheets keyed by shift_id so we can show clock-in status
async function loadTimesheetMap({ userId, shiftIds }) {
  if (!shiftIds.length) return new Map();

  const { data, error } = await supabase
    .from("timesheets")
    .select(`
      id,
      shift_id,
      status,
      submitted_at,
      entries:time_entries(id, clock_in, clock_out, break_minutes)
    `)
    .eq("organization_id", org.id)
    .eq("employee_user_id", userId)
    .in("shift_id", shiftIds)
    .limit(1000);

  if (error) {
    console.warn("Could not load timesheets:", error.message);
    return new Map();
  }

  const map = new Map();
  for (const ts of data || []) {
    map.set(ts.shift_id, ts);
  }
  return map;
}

// ── Render only the current pay period
function renderCurrentPeriod({ shifts, timesheetMap, paymentFrequency }) {
  const now = new Date();
  const currentPeriod = getPeriodForDate({ date: now, paymentFrequency });

  // Filter to only shifts that fall within the current pay period (day-level comparison)
  const fromDay = dateToDayNum(currentPeriod.from);
  const toDay = dateToDayNum(currentPeriod.to);
  const currentShifts = shifts.filter(s => {
    const d = pickShiftDate(s);
    if (!d) return false;
    const day = dateToDayNum(d);
    return day >= fromDay && day <= toDay;
  });

  if (!currentShifts.length) {
    periodListEl.innerHTML = `<div class="wl-alert">No shifts scheduled for the current pay period (${escapeHtml(currentPeriod.label)}).</div>`;
    return;
  }

  const groups = [{ ...currentPeriod, shifts: currentShifts }];

  periodListEl.innerHTML = groups
    .map(group => {
      const nonCancelled = group.shifts.filter(s => String(s.status || "").toUpperCase() !== "CANCELLED");
      const totalPay = nonCancelled.reduce((sum, s) => sum + calcScheduledPay(s), 0);
      const totalMins = nonCancelled.reduce((sum, s) => sum + calcScheduledMinutes(s), 0);
      const csvId = `csv_${group.key}`;

      return `
        <article class="wl-card" style="padding:12px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-size:16px; font-weight:800;">${escapeHtml(group.label)}</div>
              <div style="font-size:13px; color:#64748b; margin-top:4px;">
                ${group.shifts.length} shift${group.shifts.length === 1 ? "" : "s"}
                · ${formatMinutes(totalMins)} scheduled
                · <strong>${fmtMoney(totalPay)}</strong> earned
              </div>
            </div>
            <button class="wl-btn" data-download="${escapeHtml(csvId)}" type="button">Download CSV</button>
          </div>

          <div style="display:grid; gap:8px; margin-top:10px;">
            ${group.shifts.map(s => renderShiftRow(s, timesheetMap.get(s.id))).join("")}
          </div>

          <textarea id="${escapeHtml(csvId)}" style="display:none;">${escapeHtml(toCsv(group, timesheetMap))}</textarea>
        </article>
      `;
    })
    .join("");

  periodListEl.querySelectorAll("[data-download]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-download");
      const src = document.getElementById(id);
      if (!src) return;
      downloadCsv({ filename: `${id}.csv`, csv: src.value });
    });
  });
}

function renderShiftRow(shift, timesheet) {
  const status = String(shift.status || "PUBLISHED").toUpperCase();
  const isCancelled = status === "CANCELLED";
  const scheduledPay = calcScheduledPay(shift);
  const scheduledMins = calcScheduledMinutes(shift);

  // Clock-in/out summary from the timesheet (if it exists)
  const entries = timesheet?.entries || [];
  const workedMins = getWorkedMinutes(entries);
  const hasClockedIn = entries.some(e => e.clock_in);
  const hasClockedOut = entries.some(e => e.clock_out);

  // Time tracking info
  const trackingStatus = shift.track_time === false
    ? `<span style="font-size:12px; color:#64748b;">No tracking required</span>`
    : hasClockedOut
      ? `<span style="font-size:12px; color:#10b981;">✅ Clocked out · ${formatMinutes(workedMins)} worked</span>`
      : hasClockedIn
        ? `<span style="font-size:12px; color:#f59e0b;">⏱ Currently clocked in</span>`
        : `<span style="font-size:12px; color:#94a3b8;">Not clocked in</span>`;

  return `
    <div class="wl-card" style="padding:10px; display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; ${isCancelled ? "opacity:0.55;" : ""}">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          ${escapeHtml(shift.title || "Untitled shift")}
          ${renderStatusBadge(status)}
        </div>
        <div style="font-size:13px; color:#64748b; margin-top:4px;">
          ${escapeHtml(formatDateDDMMYYYY(shift.shift_date))}
          · ${escapeHtml((shift.start_at || "").slice(0,5))} → ${escapeHtml((shift.end_at || "").slice(0,5))}
          ${shift.location ? ` · 📍 ${escapeHtml(shift.location)}` : ""}
        </div>
        <div style="margin-top:4px;">${trackingStatus}</div>
      </div>
      <div style="text-align:right; flex-shrink:0;">
        ${!isCancelled ? `
          <div style="font-size:13px; color:#64748b;">Scheduled: ${formatMinutes(scheduledMins)}</div>
          <div style="font-weight:800; font-size:15px; margin-top:2px;">${fmtMoney(scheduledPay)}</div>
        ` : `
          <div style="font-size:13px; color:#94a3b8; text-decoration:line-through;">${fmtMoney(scheduledPay)}</div>
          <div style="font-size:12px; color:#ef4444;">Cancelled</div>
        `}
      </div>
    </div>
  `;
}

// ── Pay calculation helpers ───────────────────────────────────────────────────

function calcScheduledPay(shift) {
  const mins = calcScheduledMinutes(shift);
  if (!mins || !shift.hourly_rate) return 0;
  return (mins / 60) * Number(shift.hourly_rate);
}

function calcScheduledMinutes(shift) {
  if (!shift.shift_date || !shift.start_at || !shift.end_at) return 0;

  const startDate = shift.shift_date;
  const endDate = shift.end_date || shift.shift_date;
  const startMs = new Date(`${startDate}T${shift.start_at}`).getTime();
  const endMs = new Date(`${endDate}T${shift.end_at}`).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;

  const totalMins = Math.max(1, Math.round((endMs - startMs) / 60000));
  const breakMins = Math.max(0, Number(shift.break_minutes || 0));
  const paidMinsRaw = shift.break_is_paid ? totalMins : Math.max(0, totalMins - breakMins);
  return roundForPay(paidMinsRaw);
}

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

function getWorkedMinutes(entries) {
  return (entries || []).reduce((sum, e) => {
    if (!e.clock_in || !e.clock_out) return sum;
    const start = new Date(e.clock_in).getTime();
    const end = new Date(e.clock_out).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return sum;
    const gross = Math.round((end - start) / 60000);
    const breakMins = Math.max(0, Number(e.break_minutes || 0));
    return sum + Math.max(0, gross - breakMins);
  }, 0);
}

// ── Grouping ──────────────────────────────────────────────────────────────────

function groupByPayPeriod({ shifts, paymentFrequency }) {
  const now = new Date();
  const grouped = new Map();

  // Always include the current period even if empty
  const seed = getPeriodForDate({ date: now, paymentFrequency });
  grouped.set(seed.key, { ...seed, shifts: [] });

  for (const shift of shifts) {
    const date = pickShiftDate(shift);
    if (!date) continue;
    const p = getPeriodForDate({ date, paymentFrequency });
    if (!grouped.has(p.key)) grouped.set(p.key, { ...p, shifts: [] });
    grouped.get(p.key).shifts.push(shift);
  }

  // Sort most-recent first
  return [...grouped.values()].sort((a, b) => b.from.getTime() - a.from.getTime());
}

function pickShiftDate(shift) {
  const d = shift?.shift_date;
  if (d && String(d).length >= 10) {
    const [y, m, day] = String(d).split("-").map(Number);
    if (y && m && day) return new Date(y, m - 1, day);
  }
  return null;
}

function getPeriodForDate({ date, paymentFrequency }) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const freq = normalizePaymentFrequency(paymentFrequency);

  if (freq === "MONTHLY") {
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return makePeriod({ from, to, freq });
  }

  if (freq === "WEEKLY") {
    // Week runs Mon–Sun
    const monDayNum = mondayOf(d);
    const from = dayNumToDate(monDayNum);
    const to = dayNumToDate(monDayNum + 6);
    return makePeriod({ from, to, freq });
  }

  // FORTNIGHTLY — anchor to 2024-01-01 (a Monday). Work in day numbers, no startOfWeek().
  const anchorDayNum = dateToDayNum(new Date(2024, 0, 1));
  const dayNum = dateToDayNum(d);
  const diffDays = dayNum - anchorDayNum;
  const fortnightIndex = Math.floor(diffDays / 14);
  const fromDayNum = anchorDayNum + fortnightIndex * 14;
  const from = dayNumToDate(fromDayNum);
  const to = dayNumToDate(fromDayNum + 13);
  return makePeriod({ from, to, freq: "FORTNIGHTLY" });
}

function makePeriod({ from, to, freq }) {
  const key = `${isoDate(from)}_${freq}`;
  const label = `${freq.charAt(0)}${freq.slice(1).toLowerCase()} period · ${isoDate(from)} → ${isoDate(to)}`;
  return { key, from, to, label };
}

// ── CSV export ────────────────────────────────────────────────────────────────

function toCsv(group, timesheetMap) {
  const header = [
    "shift_title",
    "shift_date",
    "start_at",
    "end_at",
    "location",
    "status",
    "scheduled_minutes",
    "scheduled_pay",
    "clocked_minutes",
    "timesheet_status",
  ];

  const rows = group.shifts.map(s => {
    const ts = timesheetMap.get(s.id);
    const entries = ts?.entries || [];
    return [
      s.title || "",
      s.shift_date || "",
      (s.start_at || "").slice(0, 5),
      (s.end_at || "").slice(0, 5),
      s.location || "",
      s.status || "PUBLISHED",
      String(calcScheduledMinutes(s)),
      calcScheduledPay(s).toFixed(2),
      String(getWorkedMinutes(entries)),
      ts?.status || "NO_TIMESHEET",
    ];
  });

  return [header, ...rows].map(cols => cols.map(csvEscape).join(",")).join("\n");
}

// ── DST-safe day arithmetic ───────────────────────────────────────────────────
// Converts a local Date to an integer "day number" (days since Unix epoch in local time)
// This avoids DST shifts causing off-by-one errors when dividing milliseconds.
function mondayOf(d) {
  // Returns the day number (days since epoch) of the Monday of d's week
  const day = d.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const offsetToMonday = (day + 6) % 7; // Sun->6, Mon->0, Tue->1 ...
  return dateToDayNum(d) - offsetToMonday;
}

function dateToDayNum(d) {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

function dayNumToDate(dayNum) {
  const ms = dayNum * 86400000;
  const d = new Date(ms);
  // Construct from UTC parts to avoid DST offset on the epoch boundary
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}



function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = (day + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateDDMMYYYY(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const [y, m, d] = String(yyyyMmDd).split("-");
  return `${d}/${m}/${y}`;
}

function formatMinutes(totalMins) {
  const mins = Math.max(0, Number(totalMins || 0));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtMoney(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function renderStatusBadge(status) {
  const s = String(status || "PUBLISHED").toUpperCase();
  const map = {
    PUBLISHED: { cls: "wl-badge--active",    label: "Active" },
    ACTIVE:    { cls: "wl-badge--active",    label: "Active" },
    CANCELLED: { cls: "wl-badge--cancelled", label: "Cancelled" },
    DRAFT:     { cls: "wl-badge--draft",     label: "Draft" },
    OFFERED:   { cls: "wl-badge--offered",   label: "Offered" },
  };
  const v = map[s] || { cls: "", label: s };
  return `<span class="wl-badge ${v.cls}">${escapeHtml(v.label)}</span>`;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function downloadCsv({ filename, csv }) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}