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
        Your shifts, time tracking, and earnings.
      </div>
    </div>
    <a class="wl-btn" href="${path("/app/employee/my-shifts.html")}">View all shifts</a>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:12px;">
      
      <div class="wl-card wl-panel" style="padding:14px;">
        <div style="font-size:12px; opacity:.8;">Available balance</div>
        <div id="cardBalance" style="font-size:22px; font-weight:900; margin-top:6px;">—</div>
        <div style="font-size:12px; opacity:.7; margin-top:6px;">From posted earnings</div>
      </div>

      <div class="wl-card wl-panel" style="padding:14px;">
        <div style="font-size:12px; opacity:.8;">This week</div>
        <div id="cardWeek" style="font-size:22px; font-weight:900; margin-top:6px;">—</div>
        <div style="font-size:12px; opacity:.7; margin-top:6px;">Mon → today</div>
      </div>

      <div class="wl-card wl-panel" style="padding:14px;">
        <div style="font-size:12px; opacity:.8;">Next shift</div>
        <div id="cardNextTitle" style="font-weight:900; margin-top:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">—</div>
        <div id="cardNextMeta" style="font-size:12px; opacity:.75; margin-top:6px;">—</div>
        <div id="cardNextBadge" style="margin-top:8px;"></div>
      </div>

    </div>
  </section>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center;">
      <div>
        <div style="font-weight:900;">Today</div>
        <div style="font-size:13px; opacity:.8; margin-top:4px;" id="todaySub">Loading…</div>
      </div>
      <div id="todayPill"></div>
    </div>
    <div id="todayBody" style="margin-top:12px;"></div>
  </section>

  <div class="wl-form__row" style="margin-top:12px;">
    <section class="wl-card wl-panel">
      <div style="font-weight:900;">Upcoming shifts</div>
      <div style="font-size:13px; opacity:.8; margin-top:6px;">Next 14 days</div>
      <div id="upcomingList" style="display:grid; gap:10px; margin-top:12px;"></div>
    </section>

    <section class="wl-card wl-panel">
      <div style="font-weight:900;">Earnings</div>
      <div style="font-size:13px; opacity:.8; margin-top:6px;">
        Based on the ledger (posted after clock-out or shift end).
      </div>

      <div id="earningsBox" style="margin-top:12px;">
        <div style="opacity:.85;">Loading…</div>
      </div>

      <div style="margin-top:12px;">
        <div style="font-weight:900;">Recent earnings</div>
        <div id="recentEarnings" style="display:grid; gap:10px; margin-top:10px;"></div>
      </div>
    </section>
  </div>
`;

const todaySubEl = document.querySelector("#todaySub");
const todayPillEl = document.querySelector("#todayPill");
const todayBodyEl = document.querySelector("#todayBody");
const upcomingListEl = document.querySelector("#upcomingList");
const earningsBoxEl = document.querySelector("#earningsBox");
const recentEarningsEl = document.querySelector("#recentEarnings");
const cardBalanceEl = document.querySelector("#cardBalance");
const cardWeekEl = document.querySelector("#cardWeek");
const cardNextTitleEl = document.querySelector("#cardNextTitle");
const cardNextMetaEl = document.querySelector("#cardNextMeta");
const cardNextBadgeEl = document.querySelector("#cardNextBadge");


try {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  const upcoming = await loadUpcomingAssignedShifts({ days: 14 });
  const active = await getActiveClockedInShift({ userId });
  
  renderTopCardsNextShift({ upcoming });
  
  renderToday({ upcoming, active });
  renderUpcoming(upcoming);
  

  await renderLedgerEarnings({ userId });
  
} catch (err) {
  console.error(err);
  todaySubEl.textContent = "Could not load dashboard.";
  todayPillEl.innerHTML = `<span class="wl-badge wl-badge--cancelled">Error</span>`;
  todayBodyEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err?.message || "")}</div>`;
  upcomingListEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load shifts.</div>`;
  earningsBoxEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load earnings.</div>`;
  recentEarningsEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load recent earnings.</div>`;
}

/* --------------------------
   Data
--------------------------- */

async function loadUpcomingAssignedShifts({ days }) {
  const assigns = await listMyShiftAssignments(); // expects [{ shift_id, ... }]
  const ids = (assigns || []).map((a) => a.shift_id).filter(Boolean);
  if (!ids.length) return [];

  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const { data: shifts, error } = await supabase
    .from("shifts")
    .select("*")
    .in("id", ids)
    .limit(500);

  if (error) throw error;

  return (shifts || [])
    .filter((s) => {
      const start = shiftStartMs(s);
      return Number.isFinite(start) && start <= end.getTime();
    })
    .sort((a, b) => shiftStartMs(a) - shiftStartMs(b));
}

async function getActiveClockedInShift({ userId }) {
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

 function renderTopCardsNextShift({ upcoming }) {
  const now = new Date();
  const nextShift = upcoming.find((s) => shiftStartMs(s) >= now.getTime()) || null;

  if (!nextShift) {
    cardNextTitleEl.textContent = "No upcoming shifts";
    cardNextMetaEl.textContent = "—";
    cardNextBadgeEl.innerHTML = "";
    return;
  }

  const when = formatWhenLabel(nextShift.shift_date);
  const time = `${String(nextShift.start_at || "").slice(0, 5)} → ${String(nextShift.end_at || "").slice(0, 5)}`;
  const loc = nextShift.location ? ` • ${nextShift.location}` : "";
  const needsTracking = nextShift.track_time === false ? false : true;

  cardNextTitleEl.textContent = nextShift.title || "Upcoming shift";
  cardNextMetaEl.textContent = `${when} • ${time}${loc}`;

  cardNextBadgeEl.innerHTML = needsTracking
    ? `<span class="wl-badge wl-badge--active">Tracking required</span>`
    : `<span class="wl-badge wl-badge--draft">No tracking required</span>`;
}

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
    upcomingListEl.innerHTML = `<div class="wl-alert" style="opacity:.95;">No shifts to show.</div>`;
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
          ${needsTracking ? "" : `<div style="font-size:13px; opacity:.85; margin-top:6px;">No tracking required</div>`}
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
   Earnings (Ledger-based)
--------------------------- */

async function renderLedgerEarnings({ userId }) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [weekTotal, monthTotal, allTimeTotal] = await Promise.all([
    sumLedger({ userId, from: weekStart, to: now }),
    sumLedger({ userId, from: monthStart, to: now }),
    sumLedger({ userId, from: null, to: null }),
  ]);
  
cardWeekEl.textContent = fmtMoney(weekTotal);
cardBalanceEl.textContent = fmtMoney(allTimeTotal);

  earningsBoxEl.innerHTML = `
    <div class="wl-alert">
      <div style="display:grid; gap:10px;">
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div style="opacity:.85;">This week</div>
          <div style="font-weight:900;">${escapeHtml(fmtMoney(weekTotal))}</div>
        </div>
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div style="opacity:.85;">This month</div>
          <div style="font-weight:900;">${escapeHtml(fmtMoney(monthTotal))}</div>
        </div>
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div style="opacity:.85;">All time</div>
          <div style="font-weight:900;">${escapeHtml(fmtMoney(allTimeTotal))}</div>
        </div>

        <div style="font-size:12px; opacity:.75;">
          Earnings are posted after clock-out (tracked shifts) or after shift end (no-tracking shifts).
          If a no-tracking shift ended recently, it may take a few minutes to appear.
        </div>
      </div>
    </div>
  `;

  const recent = await fetchRecentLedger({ userId, limit: 6 });

  if (!recent.length) {
    recentEarningsEl.innerHTML = `<div class="wl-alert" style="opacity:.95;">No earnings posted yet.</div>`;
    return;
  }

  recentEarningsEl.innerHTML = recent.map(renderEarningRow).join("");
}

async function sumLedger({ userId, from, to }) {
  let q = supabase
    .from("earnings")
    .select("amount, earned_at")
    .eq("employee_user_id", userId)
    .limit(1000);

  if (from) q = q.gte("earned_at", from.toISOString());
  if (to) q = q.lte("earned_at", to.toISOString());

  const { data, error } = await q;
  if (error) throw error;

  const total = (data || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);
  return total;
}

async function fetchRecentLedger({ userId, limit }) {
  const { data, error } = await supabase
    .from("earnings")
    .select("id, amount, source, minutes_paid, earned_at, shift:shifts(title, shift_date, start_at, end_at)")
    .eq("employee_user_id", userId)
    .order("earned_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

function renderEarningRow(r) {
  const s = r.shift || {};
  const title = s.title || "Shift";
  const when = s.shift_date ? formatWhenLabel(s.shift_date) : "";
  const time = s.start_at && s.end_at ? `${String(s.start_at).slice(0,5)} → ${String(s.end_at).slice(0,5)}` : "";

  const badge =
    r.source === "SCHEDULED"
      ? `<span class="wl-badge wl-badge--draft">Scheduled</span>`
      : `<span class="wl-badge wl-badge--active">Clocked</span>`;

  return `
    <div class="wl-card wl-panel" style="padding:12px;">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(title)}
          </div>
          <div style="opacity:.85; font-size:13px; margin-top:6px;">
            ${when ? `<b>${escapeHtml(when)}</b> • ` : ""}${escapeHtml(time)}
          </div>
          <div style="opacity:.8; font-size:12px; margin-top:6px;">
            Paid minutes: <b>${escapeHtml(String(r.minutes_paid ?? 0))}</b> • Earned: ${escapeHtml(
              r.earned_at ? new Date(r.earned_at).toLocaleString() : ""
            )}
          </div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
          ${badge}
          <div style="font-weight:900;">${escapeHtml(fmtMoney(Number(r.amount || 0)))}</div>
        </div>
      </div>
    </div>
  `;
}

/* --------------------------
   Shared helpers
--------------------------- */

function shiftStartMs(s) {
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
  const diff = (day + 6) % 7; // Monday
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
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

function fmtMoney(n) {
  const x = Number(n || 0);
  return `$${x.toFixed(2)}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
