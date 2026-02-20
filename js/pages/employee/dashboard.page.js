// js/pages/employee/dashboard.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { tickRecurringSeries } from "../../data/recurring.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { getSupabase } from "../../core/supabaseClient.js";
import { path } from "../../core/config.js";
import { getSession } from "../../core/session.js";
import { listMyShiftAssignments } from "../../data/shiftAssignments.api.js";
import { getOrgMember, normalizePaymentFrequency } from "../../data/members.api.js";

await requireRole(["EMPLOYEE"]);

const org = await loadOrgContext();
const supabase = getSupabase();

tickRecurringSeries(org.id);

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
  <div class="employee-dashboard">

    <!-- Heading -->
    <div class="employee-dashboard__hero">
      <div>
        <h1 class="employee-dashboard__title">Dashboard</h1>
        <p class="employee-dashboard__subtitle">Your shifts, time tracking, and earnings.</p>
      </div>
      <a class="wl-btn" href="${path("/app/employee/my-shifts.html")}">View all shifts</a>
    </div>

    <!-- Metric cards -->
    <div class="employee-dashboard__metrics">
      <div class="wl-card wl-panel employee-metric-card">
        <p class="employee-metric-card__label" id="periodLabel">Period</p>
        <div class="employee-metric-card__value" id="cardPeriod">—</div>
        <p class="employee-metric-card__hint" id="periodHint">—</p>
      </div>
      <div class="wl-card wl-panel employee-metric-card">
        <p class="employee-metric-card__label">All time</p>
        <div class="employee-metric-card__value" id="cardAllTime">—</div>
        <p class="employee-metric-card__hint">Total earned</p>
      </div>
    </div>

    <!-- Today -->
    <div class="wl-card wl-panel">
      <div class="employee-dashboard__today-head">
        <div>
          <h2 class="employee-section-title">Today</h2>
          <p class="employee-section-subtitle" id="todaySub">Loading…</p>
        </div>
        <div id="todayPill"></div>
      </div>
      <div class="employee-dashboard__today-body" id="todayBody"></div>
    </div>

    <!-- Two-column grid: upcoming + earnings -->
    <div class="employee-dashboard__grid">

      <div class="wl-card wl-panel">
        <h2 class="employee-section-title">Upcoming shifts</h2>
        <p class="employee-section-subtitle">Next 14 days</p>
        <div class="employee-list" id="upcomingList"></div>
        <a href="${path("/app/employee/my-shifts.html")}"
           style="display:inline-block; margin-top:10px; font-size:13px; color:var(--brand); font-weight:700; text-decoration:none;">
          View all →
        </a>
      </div>

      <div class="wl-card wl-panel">
        <h2 class="employee-section-title">Recent earnings</h2>
        <p class="employee-section-subtitle">Posted after clock-out or shift end</p>
        <div class="employee-list" id="earningsBox">
          <div style="opacity:.6; font-size:13px;">Loading…</div>
        </div>
      </div>

    </div>
  </div>
`;

// Element refs
const todaySubEl    = document.querySelector("#todaySub");
const todayPillEl   = document.querySelector("#todayPill");
const todayBodyEl   = document.querySelector("#todayBody");
const upcomingListEl = document.querySelector("#upcomingList");
const earningsBoxEl  = document.querySelector("#earningsBox");
const cardPeriodEl   = document.querySelector("#cardPeriod");
const cardAllTimeEl  = document.querySelector("#cardAllTime");
const periodLabelEl  = document.querySelector("#periodLabel");
const periodHintEl   = document.querySelector("#periodHint");

try {
  const session = await getSession();
  const userId  = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  const [upcoming, active, member] = await Promise.all([
    loadUpcomingAssignedShifts({ days: 14 }),
    getActiveClockedInShift({ userId }),
    getOrgMember({ organizationId: org.id, userId }),
  ]);

  const paymentFrequency = normalizePaymentFrequency(member?.payment_frequency);

  renderToday({ upcoming, active });
  renderUpcoming(upcoming);
  await renderEarnings({ userId, paymentFrequency });

} catch (err) {
  console.error(err);
  todaySubEl.textContent   = "Could not load dashboard.";
  todayBodyEl.innerHTML    = `<div class="wl-alert wl-alert--error">${escapeHtml(err?.message || "")}</div>`;
  upcomingListEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load shifts.</div>`;
  earningsBoxEl.innerHTML  = `<div class="wl-alert wl-alert--error">Failed to load earnings.</div>`;
}

/* ── Data loaders ─────────────────────────────────────────── */

async function loadUpcomingAssignedShifts({ days }) {
  const assigns = await listMyShiftAssignments();
  const ids = (assigns || []).map((a) => a.shift_id).filter(Boolean);
  if (!ids.length) return [];

  const now      = new Date();
  const end      = new Date(now.getTime() + days * 86400000);
  const dayStart = startOfDay(now).getTime();

  const { data: shifts, error } = await supabase
    .from("shifts").select("*").in("id", ids).limit(500);
  if (error) throw error;

  return (shifts || [])
    .filter((s) => { const ms = shiftStartMs(s); return Number.isFinite(ms) && ms >= dayStart && ms <= end.getTime(); })
    .sort((a, b) => shiftStartMs(a) - shiftStartMs(b));
}

async function getActiveClockedInShift({ userId }) {
  try {
    const { data: rows, error } = await supabase
      .from("time_entries")
      .select(`id, timesheet_id, clock_in, clock_out,
               timesheets!inner(id, employee_user_id, shift_id)`)
      .is("clock_out", null)
      .eq("timesheets.employee_user_id", userId)
      .order("clock_in", { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = rows?.[0];
    if (!row) return null;
    const shiftId = row.timesheets?.shift_id;
    if (!shiftId) return null;
    const { data: shift, error: sErr } = await supabase.from("shifts").select("*").eq("id", shiftId).single();
    if (sErr || !shift) return null;
    return { timeEntry: row, shift };
  } catch (e) {
    console.warn("Active clock-in check failed:", e);
    return null;
  }
}

/* ── Renderers ────────────────────────────────────────────── */

function renderToday({ upcoming, active }) {
  const now   = new Date();
  const today = isoDate(now);

  if (active?.shift) {
    const s     = active.shift;
    const since = active.timeEntry?.clock_in
      ? new Date(active.timeEntry.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    todaySubEl.textContent = "You are currently clocked in.";
    todayPillEl.innerHTML  = `<span class="wl-badge wl-badge--active">Clocked in</span>`;
    todayBodyEl.innerHTML  = `
      <div class="wl-alert wl-alert--success">
        <div style="font-weight:800; margin-bottom:4px;">${escapeHtml(s.title || "Active shift")}</div>
        ${since ? `<div class="wl-subtext" style="margin-top:2px;">Since ${escapeHtml(since)}</div>` : ""}
        <a class="wl-btn" style="margin-top:10px; display:inline-block;"
           href="${path(`/app/employee/shift.html?id=${encodeURIComponent(s.id)}`)}">Go to shift →</a>
      </div>`;
    return;
  }

  todayPillEl.innerHTML = `<span class="wl-badge wl-badge--draft">Not clocked in</span>`;

  const nextShift = upcoming.find((s) => shiftStartMs(s) >= now.getTime())
    || upcoming.find((s) => String(s.shift_date) === today)
    || null;

  if (!nextShift) {
    todaySubEl.textContent = "No upcoming shifts.";
    todayBodyEl.innerHTML  = `
      <div class="wl-alert">
        You have no assigned shifts in the next 14 days.
        <div class="wl-subtext" style="margin-top:4px;">Contact your manager if this seems wrong.</div>
      </div>`;
    return;
  }

  const isToday = String(nextShift.shift_date) === today;
  todaySubEl.textContent = isToday
    ? "You have a shift today."
    : `Next shift: ${formatWhenLabel(nextShift.shift_date)}`;

  todayBodyEl.innerHTML = `
    <div class="wl-alert">
      <div style="font-weight:800; margin-bottom:6px;">${escapeHtml(nextShift.title || "Shift")}</div>
      <div class="wl-subtext">
        <strong>${escapeHtml(formatWhenLabel(nextShift.shift_date))}</strong>
        · ${escapeHtml(nextShift.start_at || "")} → ${escapeHtml(nextShift.end_at || "")}
        ${nextShift.location ? ` · 📍 ${escapeHtml(nextShift.location)}` : ""}
      </div>
      ${nextShift.track_time === false
        ? `<div class="wl-subtext" style="margin-top:4px;">✅ No clock-in required</div>`
        : ""}
      <a class="wl-btn" style="margin-top:10px; display:inline-block;"
         href="${path(`/app/employee/shift.html?id=${encodeURIComponent(nextShift.id)}`)}">Open shift →</a>
    </div>`;
}

function renderUpcoming(shifts) {
  if (!shifts.length) {
    upcomingListEl.innerHTML = `<div class="wl-alert">No shifts in the next 14 days.</div>`;
    return;
  }

  upcomingListEl.innerHTML = shifts.slice(0, 5).map((s) => {
    const status = String(s.status || "PUBLISHED").toUpperCase();
    return `
      <a class="wl-card employee-shift-card wl-panel" href="${path(`/app/employee/shift.html?id=${encodeURIComponent(s.id)}`)}">
        <div class="employee-shift-card__row">
          <div style="min-width:0; flex:1;">
            <div class="employee-shift-card__title">${escapeHtml(s.title || "Untitled shift")}</div>
            <div class="employee-shift-card__meta">
              <strong>${escapeHtml(formatWhenLabel(s.shift_date))}</strong>
              · ${escapeHtml(s.start_at || "")} → ${escapeHtml(s.end_at || "")}
              ${s.location ? ` · 📍 ${escapeHtml(s.location)}` : ""}
            </div>
          </div>
          <div class="employee-shift-card__actions">
            <span class="wl-badge ${statusBadgeClass(status)}">${escapeHtml(statusLabel(status))}</span>
          </div>
        </div>
      </a>`;
  }).join("");

  if (shifts.length > 5) {
    upcomingListEl.innerHTML += `<div class="wl-subtext" style="margin-top:6px;">+${shifts.length - 5} more</div>`;
  }
}

async function renderEarnings({ userId, paymentFrequency }) {
  const now    = new Date();
  const period = getCurrentPayPeriod({ now, paymentFrequency });

  const [periodTotal, allTimeTotal, recent] = await Promise.all([
    sumLedger({ userId, from: period.from, to: now }),
    sumLedger({ userId, from: null, to: null }),
    fetchRecentLedger({ userId, limit: 5 }),
  ]);

  periodLabelEl.textContent = period.metricLabel;
  periodHintEl.textContent  = period.rangeLabel;
  cardPeriodEl.textContent  = fmtMoney(periodTotal);
  cardAllTimeEl.textContent = fmtMoney(allTimeTotal);

  if (!recent.length) {
    earningsBoxEl.innerHTML = `<div class="wl-alert">No earnings posted yet.</div>`;
    return;
  }

  earningsBoxEl.innerHTML = recent.map((r) => {
    const s    = r.shift || {};
    const when = s.shift_date ? formatWhenLabel(s.shift_date) : "";
    const time = s.start_at && s.end_at
      ? `${String(s.start_at).slice(0, 5)} → ${String(s.end_at).slice(0, 5)}`
      : "";
    const isClocked = r.source !== "SCHEDULED";
    return `
      <div class="wl-card employee-earning-card">
        <div class="employee-shift-card__row">
          <div style="min-width:0; flex:1;">
            <div class="employee-shift-card__title">${escapeHtml(s.title || "Shift")}</div>
            <div class="employee-shift-card__meta">
              ${when ? `<strong>${escapeHtml(when)}</strong> · ` : ""}${escapeHtml(time)}
            </div>
          </div>
          <div class="employee-shift-card__actions">
            <span class="wl-badge ${isClocked ? "wl-badge--offered" : "wl-badge--draft"}">
              ${isClocked ? "Clocked" : "Scheduled"}
            </span>
            <strong style="font-size:15px;">${escapeHtml(fmtMoney(Number(r.amount || 0)))}</strong>
          </div>
        </div>
      </div>`;
  }).join("");
}

/* ── Data helpers ─────────────────────────────────────────── */

async function sumLedger({ userId, from, to }) {
  let q = supabase.from("earnings").select("amount").eq("employee_user_id", userId).limit(1000);
  if (from) q = q.gte("earned_at", from.toISOString());
  if (to)   q = q.lte("earned_at", to.toISOString());
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);
}

async function fetchRecentLedger({ userId, limit }) {
  const { data, error } = await supabase
    .from("earnings")
    .select("id, amount, source, earned_at, shift:shifts(title, shift_date, start_at, end_at)")
    .eq("employee_user_id", userId)
    .order("earned_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/* ── Utilities ────────────────────────────────────────────── */

function startOfDay(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setHours(0, 0, 0, 0); return x;
}
function shiftStartMs(s) {
  if (!s?.shift_date || !s?.start_at) return NaN;
  return new Date(`${s.shift_date}T${String(s.start_at).slice(0, 8)}`).getTime();
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  x.setHours(0, 0, 0, 0); return x;
}
function formatWhenLabel(yyyyMmDd) {
  if (!yyyyMmDd || String(yyyyMmDd).length < 10) return String(yyyyMmDd || "");
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  if (!y || !m || !d) return String(yyyyMmDd);
  const t0   = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const diff = Math.round((new Date(y, m-1, d).getTime() - t0) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(y, m-1, d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}
function getCurrentPayPeriod({ now, paymentFrequency }) {
  const d    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const freq = normalizePaymentFrequency(paymentFrequency);
  if (freq === "MONTHLY") {
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    return { from, metricLabel: "This month", rangeLabel: `${isoDate(from)} → ${isoDate(d)}` };
  }
  if (freq === "WEEKLY") {
    const from = startOfWeek(d);
    return { from, metricLabel: "This week", rangeLabel: `${isoDate(from)} → ${isoDate(d)}` };
  }
  const ws     = startOfWeek(d);
  const anchor = new Date(2024, 0, 1); anchor.setHours(0,0,0,0);
  const idx    = Math.floor(Math.floor((ws.getTime() - anchor.getTime()) / 86400000) / 14);
  const from   = new Date(anchor.getTime() + idx * 14 * 86400000);
  return { from, metricLabel: "This fortnight", rangeLabel: `${isoDate(from)} → ${isoDate(d)}` };
}
function statusBadgeClass(s) {
  return { PUBLISHED: "wl-badge--active", ACTIVE: "wl-badge--active", CANCELLED: "wl-badge--cancelled" }[s] || "wl-badge--draft";
}
function statusLabel(s) {
  return { PUBLISHED: "Active", ACTIVE: "Active", CANCELLED: "Cancelled", DRAFT: "Draft", OFFERED: "Offered" }[s] || s;
}
function fmtMoney(n) { return `$${Number(n||0).toFixed(2)}`; }
function escapeHtml(str) {
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
