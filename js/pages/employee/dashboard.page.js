// js/pages/employee/dashboard.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
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
  <style>
    .dash-wrap { max-width: 860px; width: 100%; }
    .dash-heading { margin: 0 0 2px; font-size: 20px; font-weight: 800; color: #1e293b; }
    .dash-sub { margin: 0 0 18px; color: #64748b; font-size: 13px; }

    .dash-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .dash-metric {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .dash-metric__label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .5px;
      color: #94a3b8;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .dash-metric__value {
      font-size: 22px;
      font-weight: 800;
      color: #1e293b;
      line-height: 1;
    }
    .dash-metric__hint { font-size: 11px; color: #94a3b8; margin-top: 3px; }

    .dash-section {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 14px;
    }
    .dash-section__title { font-size: 14px; font-weight: 700; margin: 0 0 1px; color: #1e293b; }
    .dash-section__sub   { font-size: 11px; color: #94a3b8; margin: 0 0 10px; }

    .dash-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    @media (max-width: 640px) { .dash-grid { grid-template-columns: 1fr; } }

    .dash-today-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    }

    .shift-card {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      padding: 9px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      margin-bottom: 6px;
      text-decoration: none;
      color: inherit;
      transition: border-color .15s;
    }
    .shift-card:hover { border-color: #93c5fd; }
    .shift-card__title { font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 1px; }
    .shift-card__meta  { font-size: 11px; color: #64748b; }

    .earn-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .earn-row:last-child { border-bottom: none; }
    .earn-row__title  { font-size: 12px; font-weight: 600; color: #1e293b; }
    .earn-row__meta   { font-size: 11px; color: #94a3b8; margin-top: 1px; }
    .earn-row__amount { font-size: 14px; font-weight: 800; color: #1e293b; white-space: nowrap; }

    .dash-alert {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 13px;
      color: #475569;
    }
    .dash-alert--active { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
    .dash-alert--error  { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

    .dash-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .3px;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .dash-badge--active    { background: #d1fae5; color: #065f46; }
    .dash-badge--draft     { background: #f1f5f9; color: #475569; }
    .dash-badge--cancelled { background: #fee2e2; color: #991b1b; }
    .dash-badge--clocked   { background: #dbeafe; color: #1e40af; }
  </style>

  <div class="dash-wrap">
    <h1 class="dash-heading">Dashboard</h1>
    <p class="dash-sub">Your shifts, time tracking, and earnings.</p>

    <div class="dash-metrics">
      <div class="dash-metric">
        <div class="dash-metric__label" id="periodLabel">Period</div>
        <div class="dash-metric__value" id="cardPeriod">—</div>
        <div class="dash-metric__hint" id="periodHint">—</div>
      </div>
      <div class="dash-metric">
        <div class="dash-metric__label">All time</div>
        <div class="dash-metric__value" id="cardAllTime">—</div>
        <div class="dash-metric__hint">Total earned</div>
      </div>
    </div>

    <div class="dash-section">
      <div class="dash-today-head">
        <div>
          <div class="dash-section__title">Today</div>
          <div class="dash-section__sub" id="todaySub">Loading…</div>
        </div>
        <div id="todayPill"></div>
      </div>
      <div id="todayBody"></div>
    </div>

    <div class="dash-grid">
      <div class="dash-section">
        <div class="dash-section__title">Upcoming shifts</div>
        <div class="dash-section__sub">Next 14 days</div>
        <div id="upcomingList"></div>
        <a href="${path("/app/employee/my-shifts.html")}"
           style="display:inline-block; margin-top:8px; font-size:12px; color:#3b82f6; font-weight:600; text-decoration:none;">
          View all →
        </a>
      </div>

      <div class="dash-section">
        <div class="dash-section__title">Recent earnings</div>
        <div class="dash-section__sub">Posted after clock-out or shift end</div>
        <div id="earningsBox"><div style="opacity:.6; font-size:12px;">Loading…</div></div>
      </div>
    </div>
  </div>
`;

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
  todaySubEl.textContent  = "Could not load dashboard.";
  todayBodyEl.innerHTML   = `<div class="dash-alert dash-alert--error">${escapeHtml(err?.message || "")}</div>`;
  upcomingListEl.innerHTML = `<div class="dash-alert dash-alert--error">Failed to load shifts.</div>`;
  earningsBoxEl.innerHTML  = `<div class="dash-alert dash-alert--error">Failed to load earnings.</div>`;
}

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

function renderToday({ upcoming, active }) {
  const now   = new Date();
  const today = isoDate(now);

  if (active?.shift) {
    const s     = active.shift;
    const since = active.timeEntry?.clock_in
      ? new Date(active.timeEntry.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    todaySubEl.textContent = "Currently clocked in.";
    todayPillEl.innerHTML  = `<span class="dash-badge dash-badge--active">Clocked in</span>`;
    todayBodyEl.innerHTML  = `
      <div class="dash-alert dash-alert--active">
        <div style="font-weight:700;">${escapeHtml(s.title || "Active shift")}</div>
        ${since ? `<div style="font-size:11px; margin-top:2px;">Since ${escapeHtml(since)}</div>` : ""}
        <a class="wl-btn" style="margin-top:8px; display:inline-block; font-size:12px;"
           href="${path(`/app/employee/shift.html?id=${encodeURIComponent(s.id)}`)}">Go to shift →</a>
      </div>`;
    return;
  }

  todayPillEl.innerHTML = `<span class="dash-badge dash-badge--draft">Not clocked in</span>`;

  const nextShift = upcoming.find((s) => shiftStartMs(s) >= now.getTime())
    || upcoming.find((s) => String(s.shift_date) === today)
    || null;

  if (!nextShift) {
    todaySubEl.textContent = "No upcoming shifts.";
    todayBodyEl.innerHTML  = `
      <div class="dash-alert">
        No assigned shifts in the next 14 days.
        <div style="font-size:11px; margin-top:3px; opacity:.8;">Contact your manager if this seems wrong.</div>
      </div>`;
    return;
  }

  const isToday = String(nextShift.shift_date) === today;
  todaySubEl.textContent = isToday ? "You have a shift today." : `Next: ${formatWhenLabel(nextShift.shift_date)}`;

  todayBodyEl.innerHTML = `
    <div class="dash-alert">
      <div style="font-weight:700; margin-bottom:3px;">${escapeHtml(nextShift.title || "Shift")}</div>
      <div style="font-size:12px; color:#475569;">
        <b>${escapeHtml(formatWhenLabel(nextShift.shift_date))}</b>
        • ${escapeHtml(nextShift.start_at || "")} → ${escapeHtml(nextShift.end_at || "")}
        ${nextShift.location ? ` • 📍 ${escapeHtml(nextShift.location)}` : ""}
      </div>
      ${nextShift.track_time === false ? `<div style="font-size:11px; margin-top:3px; color:#64748b;">✅ No clock-in required</div>` : ""}
      <a class="wl-btn" style="margin-top:8px; display:inline-block; font-size:12px;"
         href="${path(`/app/employee/shift.html?id=${encodeURIComponent(nextShift.id)}`)}">Open shift →</a>
    </div>`;
}

function renderUpcoming(shifts) {
  if (!shifts.length) {
    upcomingListEl.innerHTML = `<div class="dash-alert" style="font-size:12px;">No upcoming shifts.</div>`;
    return;
  }
  upcomingListEl.innerHTML = shifts.slice(0, 4).map((s) => {
    const status = String(s.status || "PUBLISHED").toUpperCase();
    return `
      <a class="shift-card" href="${path(`/app/employee/shift.html?id=${encodeURIComponent(s.id)}`)}">
        <div style="min-width:0;">
          <div class="shift-card__title">${escapeHtml(s.title || "Untitled shift")}</div>
          <div class="shift-card__meta">
            <b>${escapeHtml(formatWhenLabel(s.shift_date))}</b>
            • ${escapeHtml(s.start_at || "")} → ${escapeHtml(s.end_at || "")}
            ${s.location ? ` • 📍 ${escapeHtml(s.location)}` : ""}
          </div>
        </div>
        <span class="dash-badge ${statusBadgeClass(status)}">${escapeHtml(statusLabel(status))}</span>
      </a>`;
  }).join("");
  if (shifts.length > 4) {
    upcomingListEl.innerHTML += `<div style="font-size:11px; color:#94a3b8; margin-top:2px;">+${shifts.length - 4} more</div>`;
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
    earningsBoxEl.innerHTML = `<div class="dash-alert" style="font-size:12px;">No earnings posted yet.</div>`;
    return;
  }

  earningsBoxEl.innerHTML = recent.map((r) => {
    const s    = r.shift || {};
    const when = s.shift_date ? formatWhenLabel(s.shift_date) : "";
    const time = s.start_at && s.end_at ? `${String(s.start_at).slice(0,5)} → ${String(s.end_at).slice(0,5)}` : "";
    return `
      <div class="earn-row">
        <div style="min-width:0;">
          <div class="earn-row__title">${escapeHtml(s.title || "Shift")}</div>
          <div class="earn-row__meta">${when ? `<b>${escapeHtml(when)}</b> · ` : ""}${escapeHtml(time)}</div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
          <span class="dash-badge ${r.source === "SCHEDULED" ? "dash-badge--draft" : "dash-badge--clocked"}">
            ${r.source === "SCHEDULED" ? "Scheduled" : "Clocked"}
          </span>
          <span class="earn-row__amount">${escapeHtml(fmtMoney(Number(r.amount || 0)))}</span>
        </div>
      </div>`;
  }).join("");
}

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
  return { PUBLISHED: "dash-badge--active", ACTIVE: "dash-badge--active", CANCELLED: "dash-badge--cancelled" }[s] || "dash-badge--draft";
}
function statusLabel(s) {
  return { PUBLISHED: "Active", ACTIVE: "Active", CANCELLED: "Cancelled", DRAFT: "Draft", OFFERED: "Offered" }[s] || s;
}
function fmtMoney(n) { return `$${Number(n||0).toFixed(2)}`; }
function escapeHtml(str) {
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
