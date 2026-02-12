// js/pages/employee/shift.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { getSupabase } from "../../core/supabaseClient.js";
import { path } from "../../core/config.js";

import { getSession } from "../../core/session.js";
import { getOrCreateTimesheetForShift } from "../../data/timesheets.api.js";
import {
  getOpenTimeEntry,
  clockIn,
  clockOut,
  addBreakMinutes,
} from "../../data/timeEntries.api.js";

await requireRole(["EMPLOYEE"]);

const params = new URLSearchParams(window.location.search);
const shiftId = params.get("id");

if (!shiftId) {
  window.location.replace(path("/app/employee/my-shifts.html"));
  throw new Error("Missing shift id");
}

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
content.innerHTML = `<div style="opacity:.85;">Loading shift…</div>`;

const { data: shift, error } = await supabase
  .from("shifts")
  .select("*")
  .eq("id", shiftId)
  .single();

if (error || !shift) {
  content.innerHTML = `<div class="wl-alert wl-alert--error">Shift not found.</div>`;
  throw error;
}

const status = String(shift.status || "PUBLISHED").toUpperCase();
const isCancelled = status === "CANCELLED";

const whenLabel = formatWhenLabel(shift.shift_date);
const statusBadge = renderStatusBadge(status);

const shiftBreakMinutes = Number(shift.break_minutes || 0);
const breakIsPaid = !!shift.break_is_paid;
const hourlyRate = shift.hourly_rate != null ? Number(shift.hourly_rate) : null;

// Track time flag (default true if missing)
const trackTime = shift.track_time !== false;

const breakSummary =
  shiftBreakMinutes > 0
    ? `${shiftBreakMinutes} min (${breakIsPaid ? "paid" : "unpaid"})`
    : "No break";

const endDateLabel =
  shift.end_date && String(shift.end_date) !== String(shift.shift_date)
    ? `${escapeHtml(String(shift.shift_date))} ${escapeHtml(String(shift.start_at || ""))} → ${escapeHtml(String(shift.end_date))} ${escapeHtml(String(shift.end_at || ""))}`
    : `${escapeHtml(String(shift.start_at || ""))} → ${escapeHtml(String(shift.end_at || ""))}`;

content.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
    <div style="min-width:0;">
      <h1 style="margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${escapeHtml(shift.title || "Shift details")}
      </h1>

      <div style="margin-top:8px; font-size:13px; opacity:.85;">
        <b>${escapeHtml(whenLabel)}</b>
        • ${endDateLabel}
        ${shift.location ? ` • 📍 ${escapeHtml(shift.location)}` : ""}
      </div>
    </div>

    <div style="display:flex; align-items:center; gap:10px;">
      ${statusBadge}
    </div>
  </div>

  ${
    isCancelled
      ? `
    <div class="wl-alert wl-alert--error" style="margin-top:12px;">
      <b>This shift was cancelled.</b><br/>
      <span style="opacity:.9; font-size:13px;">Clocking in is disabled.</span>
    </div>
  `
      : `
    <div class="wl-alert wl-alert--success" style="margin-top:12px;">
      <b>You’re assigned to this shift.</b><br/>
      <span style="opacity:.9; font-size:13px;">Use the timesheet section below to clock in/out.</span>
    </div>
  `
  }

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:grid; gap:10px;">
      <div><b>Start date:</b> ${escapeHtml(shift.shift_date || "")}</div>
      <div><b>End date:</b> ${escapeHtml(shift.end_date || shift.shift_date || "")}</div>
      <div><b>Time:</b> ${endDateLabel}</div>
      ${
        hourlyRate != null
          ? `<div><b>Rate:</b> ${escapeHtml(String(hourlyRate))} / hr</div>`
          : ""
      }
      <div><b>Break:</b> ${escapeHtml(breakSummary)}</div>
      <div><b>Time tracking:</b> ${trackTime ? "Required" : "Not required"}</div>
      ${shift.location ? `<div><b>Location:</b> ${escapeHtml(shift.location)}</div>` : ""}
      ${
        shift.description
          ? `<div><b>Description:</b><br/><div style="opacity:.9; margin-top:6px;">${escapeHtml(
              shift.description
            )}</div></div>`
          : ""
      }
    </div>
  </section>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <h2 style="margin:0;">Timesheet</h2>
      <span class="wl-badge wl-badge--draft" id="tsState">Loading…</span>
    </div>

    <div id="tsBody" style="margin-top:12px;">
      <div style="opacity:.85;">Preparing timesheet…</div>
    </div>

    <div id="tsMsg" style="margin-top:10px;"></div>
  </section>

  <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
    <a class="wl-btn" href="${path("/app/employee/my-shifts.html")}">← Back</a>
  </div>
`;

const tsStateEl = document.querySelector("#tsState");
const tsBodyEl = document.querySelector("#tsBody");
const tsMsgEl = document.querySelector("#tsMsg");

try {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  const timesheet = await getOrCreateTimesheetForShift({
    shiftId,
    organizationId: org.id,
  });

  let openEntry = await getOpenTimeEntry({ timesheetId: timesheet.id });
  let latestEntry = await getLatestTimeEntry({ timesheetId: timesheet.id });

  renderTimesheetUI({ timesheet, openEntry, latestEntry, isCancelled });

  async function refresh() {
    tsMsgEl.innerHTML = "";
    openEntry = await getOpenTimeEntry({ timesheetId: timesheet.id });
    latestEntry = await getLatestTimeEntry({ timesheetId: timesheet.id });
    renderTimesheetUI({ timesheet, openEntry, latestEntry, isCancelled });
  }

  function renderTimesheetUI({ timesheet, openEntry, latestEntry, isCancelled }) {
    const effectiveEntry = openEntry || latestEntry || null;

    tsStateEl.textContent = openEntry ? "Clocked in" : "Ready";
    tsStateEl.className = `wl-badge ${
      openEntry ? "wl-badge--active" : "wl-badge--draft"
    }`;

    const clockedInAt = openEntry?.clock_in
      ? new Date(openEntry.clock_in).toLocaleString()
      : null;

    const breakMins = Number(effectiveEntry?.break_minutes || 0);

    const breakKey = openEntry ? `wl_break_${openEntry.id}` : null;
    const breakState = breakKey ? safeJsonParse(localStorage.getItem(breakKey)) : null;
    const isOnBreak = !!(breakState && breakState.startedAt);
    const breakStartedLabel = isOnBreak
      ? new Date(breakState.startedAt).toLocaleTimeString()
      : null;

    // ✅ MAIN CHANGE:
    // If tracking NOT required -> show scheduled totals & pay, NOT clocked totals.
    const totals = trackTime
      ? calcTotals({
          clockIn: effectiveEntry?.clock_in,
          clockOut: effectiveEntry?.clock_out,
          breakMinutes: breakMins,
          breakIsPaid,
          hourlyRate,
        })
      : calcScheduledTotals({
          shift_date: shift.shift_date,
          end_date: shift.end_date || shift.shift_date,
          start_at: shift.start_at,
          end_at: shift.end_at,
          breakMinutes: shiftBreakMinutes,
          breakIsPaid,
          hourlyRate,
        });

    const noTrackingBanner = !trackTime
      ? `<div class="wl-alert" style="opacity:.95;">
           <b>No tracking required for this shift.</b><br/>
           <span style="opacity:.85; font-size:13px;">
             Pay is based on the scheduled shift hours. You can still clock in/out (optional).
           </span>
         </div>`
      : "";

    tsBodyEl.innerHTML = `
      <div style="display:grid; gap:10px;">

        ${noTrackingBanner}

        ${
          totals
            ? `<div class="wl-alert wl-alert--success">
                 <div><b>${trackTime ? "Total worked:" : "Scheduled hours:"}</b> ${escapeHtml(
                   totals.workedLabel
                 )}</div>
                 ${
                   totals.payLabel
                     ? `<div style="margin-top:6px;"><b>${
                         trackTime ? "Estimated pay:" : "Scheduled pay:"
                       }</b> ${escapeHtml(totals.payLabel)}</div>`
                     : ""
                 }
                 <div style="font-size:13px; opacity:.85; margin-top:6px;">
                   ${breakIsPaid ? "Pay includes break minutes." : "Pay excludes unpaid break minutes."}
                   <br/>
                   Pay calculated from: <b>${escapeHtml(totals.paidRoundedLabel)}</b>
                 </div>
               </div>`
            : ""
        }

        ${
          openEntry
            ? `<div class="wl-alert">
                 ✅ You are clocked in.<br/>
                 <span style="opacity:.85; font-size:13px;">Started: ${escapeHtml(clockedInAt)}</span><br/>
                 <span style="opacity:.85; font-size:13px;">Break minutes (logged): <b>${breakMins}</b></span>
               </div>`
            : `<div style="opacity:.9;">You are not clocked in.</div>`
        }

        ${
          openEntry
            ? `
          <section class="wl-card wl-panel" style="padding:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
              <div style="font-weight:800;">Break</div>
              ${
                isOnBreak
                  ? `<span class="wl-badge wl-badge--offered">On break</span>`
                  : `<span class="wl-badge wl-badge--draft">Ready</span>`
              }
            </div>

            <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              ${
                isOnBreak
                  ? `<div style="font-size:13px; opacity:.85;">Started at <b>${escapeHtml(
                      breakStartedLabel
                    )}</b></div>`
                  : `<input id="breakManualMins" type="number" min="1" step="1" placeholder="Add manual minutes"
                           style="max-width:220px;" />`
              }
            </div>

            <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
              ${
                isOnBreak
                  ? `<button id="breakEndBtn" class="wl-btn" type="button">End break</button>`
                  : `<button id="breakStartBtn" class="wl-btn" type="button">Start break</button>`
              }
              <button id="breakAddBtn" class="wl-btn" type="button" ${
                isOnBreak ? "disabled" : ""
              }>Add minutes</button>
            </div>

            <div id="breakMsg" style="margin-top:10px;"></div>
          </section>
        `
            : ""
        }

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${
            openEntry
              ? `<button id="clockOutBtn" class="wl-btn" type="button" ${
                  isOnBreak ? "disabled" : ""
                }>Clock out</button>`
              : `<button id="clockInBtn" class="wl-btn" type="button" ${
                  isCancelled ? "disabled" : ""
                }>Clock in</button>`
          }
        </div>

        ${
          isCancelled
            ? `<div class="wl-alert wl-alert--error" style="opacity:.95;">
                 This shift is cancelled. Clocking in is disabled.
               </div>`
            : ""
        }
      </div>
    `;

    const clockInBtn = document.querySelector("#clockInBtn");
    const clockOutBtn = document.querySelector("#clockOutBtn");

    const breakMsg = document.querySelector("#breakMsg");
    const breakStartBtn = document.querySelector("#breakStartBtn");
    const breakEndBtn = document.querySelector("#breakEndBtn");
    const breakAddBtn = document.querySelector("#breakAddBtn");
    const breakManualMins = document.querySelector("#breakManualMins");

    if (clockInBtn) {
      clockInBtn.addEventListener("click", async () => {
        if (isCancelled) return;
        try {
          setBusy(clockInBtn, true, "Clocking in…");
          tsMsgEl.innerHTML = "";
          await clockIn({ timesheetId: timesheet.id });
          tsMsgEl.innerHTML = `<div class="wl-alert wl-alert--success">Clocked in ✅</div>`;
          await refresh();
        } catch (err) {
          console.error(err);
          tsMsgEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
            err.message || "Clock in failed"
          )}</div>`;
        } finally {
          setBusy(clockInBtn, false, "Clock in");
        }
      });
    }

    if (clockOutBtn) {
      clockOutBtn.addEventListener("click", async () => {
        const ok = confirm("Clock out now?");
        if (!ok) return;

        try {
          setBusy(clockOutBtn, true, "Clocking out…");
          tsMsgEl.innerHTML = "";
          const latest = await getOpenTimeEntry({ timesheetId: timesheet.id });
          if (!latest) throw new Error("No open time entry found.");
          await clockOut({ timeEntryId: latest.id });
          localStorage.removeItem(`wl_break_${latest.id}`);
          tsMsgEl.innerHTML = `<div class="wl-alert wl-alert--success">Clocked out ✅</div>`;
          await refresh();
        } catch (err) {
          console.error(err);
          tsMsgEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
            err.message || "Clock out failed"
          )}</div>`;
        } finally {
          setBusy(clockOutBtn, false, "Clock out");
        }
      });
    }

    if (breakStartBtn && breakKey) {
      breakStartBtn.addEventListener("click", async () => {
        try {
          breakMsg.innerHTML = "";
          localStorage.setItem(breakKey, JSON.stringify({ startedAt: Date.now() }));
          breakMsg.innerHTML = `<div class="wl-alert wl-alert--success">Break started ✅</div>`;
          await refresh();
        } catch (err) {
          console.error(err);
          breakMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
            err.message || "Failed to start break"
          )}</div>`;
        }
      });
    }

    if (breakEndBtn && breakKey && openEntry) {
      breakEndBtn.addEventListener("click", async () => {
        const state = safeJsonParse(localStorage.getItem(breakKey));
        const startedAt = state?.startedAt;
        if (!startedAt) {
          breakMsg.innerHTML = `<div class="wl-alert wl-alert--error">No break is currently running.</div>`;
          return;
        }

        const diffMs = Date.now() - startedAt;
        const diffMins = Math.max(1, Math.ceil(diffMs / 60000));
        const ok = confirm(`End break and add ${diffMins} minute(s)?`);
        if (!ok) return;

        try {
          setBusy(breakEndBtn, true, "Ending…");
          breakMsg.innerHTML = `<div style="opacity:.85;">Saving break…</div>`;
          await addBreakMinutes({ timeEntryId: openEntry.id, addMinutes: diffMins });
          localStorage.removeItem(breakKey);
          breakMsg.innerHTML = `<div class="wl-alert wl-alert--success">Break saved ✅ (+${diffMins} min)</div>`;
          await refresh();
        } catch (err) {
          console.error(err);
          breakMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
            err.message || "Failed to end break"
          )}</div>`;
        } finally {
          setBusy(breakEndBtn, false, "End break");
        }
      });
    }

    if (breakAddBtn && breakManualMins && openEntry) {
      breakAddBtn.addEventListener("click", async () => {
        const mins = Number(breakManualMins.value);
        if (!Number.isFinite(mins) || mins <= 0) {
          breakMsg.innerHTML = `<div class="wl-alert wl-alert--error">Enter break minutes greater than 0.</div>`;
          return;
        }

        const ok = confirm(`Add ${Math.round(mins)} break minute(s)?`);
        if (!ok) return;

        try {
          setBusy(breakAddBtn, true, "Saving…");
          breakMsg.innerHTML = `<div style="opacity:.85;">Saving break…</div>`;
          await addBreakMinutes({ timeEntryId: openEntry.id, addMinutes: mins });
          breakManualMins.value = "";
          breakMsg.innerHTML = `<div class="wl-alert wl-alert--success">Break saved ✅</div>`;
          await refresh();
        } catch (err) {
          console.error(err);
          breakMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
            err.message || "Failed to add break"
          )}</div>`;
        } finally {
          setBusy(breakAddBtn, false, "Add minutes");
        }
      });
    }
  }
} catch (err) {
  console.error(err);
  tsStateEl.textContent = "Error";
  tsStateEl.className = "wl-badge wl-badge--cancelled";
  tsBodyEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load timesheet.</div>`;
  tsMsgEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
    err.message || ""
  )}</div>`;
}

function setBusy(btn, isBusy, label) {
  if (!btn) return;
  btn.disabled = !!isBusy;
  if (label) btn.textContent = label;
}

function safeJsonParse(s) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

async function getLatestTimeEntry({ timesheetId }) {
  if (!timesheetId) return null;

  const { data, error } = await supabase
    .from("time_entries")
    .select("id, timesheet_id, clock_in, clock_out, break_minutes, created_at")
    .eq("timesheet_id", timesheetId)
    .order("clock_in", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data && data[0]) || null;
}

function dtMs(dateStr, timeStr) {
  // dateStr: YYYY-MM-DD, timeStr: HH:MM:SS
  return new Date(`${dateStr}T${timeStr}`).getTime();
}

// When tracking is required (clocked totals)
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

  const workedLabel = `${Math.floor(totalWorkedMins / 60)}h ${totalWorkedMins % 60}m`;

  let payLabel = "";
  if (Number.isFinite(hourlyRate) && hourlyRate != null) {
    const pay = (paidMinsRounded / 60) * hourlyRate;
    payLabel = `$${pay.toFixed(2)}`;
  }

  const paidRoundedLabel = `${Math.floor(paidMinsRounded / 60)}h ${paidMinsRounded % 60}m`;

  return {
    workedLabel,
    payLabel,
    paidRoundedLabel,
  };
}

// ✅ When tracking is NOT required (scheduled totals)
function calcScheduledTotals({
  shift_date,
  end_date,
  start_at,
  end_at,
  breakMinutes,
  breakIsPaid,
  hourlyRate,
}) {
  if (!shift_date || !end_date || !start_at || !end_at) return null;

  const start = dtMs(shift_date, start_at);
  const end = dtMs(end_date, end_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const totalShiftMins = Math.max(1, Math.round((end - start) / 60000));

  const b = Math.max(0, Number(breakMinutes || 0));
  const paidMinsRaw = breakIsPaid ? totalShiftMins : Math.max(0, totalShiftMins - b);
  const paidMinsRounded = roundForPay(paidMinsRaw);

  const workedLabel = `${Math.floor(totalShiftMins / 60)}h ${totalShiftMins % 60}m`;

  let payLabel = "";
  if (Number.isFinite(hourlyRate) && hourlyRate != null) {
    const pay = (paidMinsRounded / 60) * hourlyRate;
    payLabel = `$${pay.toFixed(2)}`;
  }

  const paidRoundedLabel = `${Math.floor(paidMinsRounded / 60)}h ${paidMinsRounded % 60}m`;

  return {
    workedLabel,
    payLabel,
    paidRoundedLabel,
  };
}

// Shared pay rounding rule
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

function renderStatusBadge(status) {
  const s = String(status || "PUBLISHED").toUpperCase();
  const map = {
    PUBLISHED: { cls: "wl-badge--active", label: "Active" },
    ACTIVE: { cls: "wl-badge--active", label: "Active" },
    CANCELLED: { cls: "wl-badge--cancelled", label: "Cancelled" },
    DRAFT: { cls: "wl-badge--draft", label: "Draft" },
    OFFERED: { cls: "wl-badge--offered", label: "Offered" },
  };
  const v = map[s] || { cls: "", label: s || "Active" };
  return `<span class="wl-badge ${v.cls}">${escapeHtml(v.label)}</span>`;
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
