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
import { getOpenTimeEntry, clockIn, clockOut } from "../../data/timeEntries.api.js";

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

// ---- Load shift ----
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

// ---- Build UI shell ----
content.innerHTML = `
  <h1>${escapeHtml(shift.title || "Shift details")}</h1>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:grid; gap:10px;">
      <div><b>Status:</b> ${escapeHtml(statusLabel(status))}</div>
      <div><b>Date:</b> ${escapeHtml(shift.shift_date || "")}</div>
      <div><b>Time:</b> ${escapeHtml(shift.start_at || "")} → ${escapeHtml(shift.end_at || "")}</div>
      ${shift.location ? `<div><b>Location:</b> ${escapeHtml(shift.location)}</div>` : ""}
      ${shift.hourly_rate != null ? `<div><b>Rate:</b> ${escapeHtml(String(shift.hourly_rate))} / hr</div>` : ""}
      ${shift.description ? `<div><b>Description:</b><br/>${escapeHtml(shift.description)}</div>` : ""}
    </div>
  </section>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
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

// ---- Timesheet logic ----
const tsStateEl = document.querySelector("#tsState");
const tsBodyEl = document.querySelector("#tsBody");
const tsMsgEl = document.querySelector("#tsMsg");

try {
  // If cancelled, we can still show the timesheet, but block new clock-ins.
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated.");

  const timesheet = await getOrCreateTimesheetForShift({
    shiftId,
    organizationId: org.id,
  });

  // Check if currently clocked in
  let openEntry = await getOpenTimeEntry({ timesheetId: timesheet.id });

  renderTimesheetUI({ timesheet, openEntry, isCancelled });

  async function refresh() {
    tsMsgEl.innerHTML = "";
    openEntry = await getOpenTimeEntry({ timesheetId: timesheet.id });
    renderTimesheetUI({ timesheet, openEntry, isCancelled });
  }

  function renderTimesheetUI({ timesheet, openEntry, isCancelled }) {
    // Status pill
    tsStateEl.textContent = openEntry ? "Clocked in" : "Ready";
    tsStateEl.className = `wl-badge ${openEntry ? "wl-badge--active" : "wl-badge--draft"}`;

    const clockedInAt = openEntry?.clock_in ? new Date(openEntry.clock_in).toLocaleString() : null;

    tsBodyEl.innerHTML = `
      <div style="display:grid; gap:10px;">
        <div style="opacity:.9;">
          <b>Timesheet status:</b> ${escapeHtml(String(timesheet.status || "OPEN"))}
        </div>

        ${
          openEntry
            ? `<div class="wl-alert">
                 ✅ You are clocked in.<br/>
                 <span style="opacity:.85; font-size:13px;">Started: ${escapeHtml(clockedInAt)}</span>
               </div>`
            : `<div style="opacity:.9;">
                 You are not clocked in.
               </div>`
        }

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${
            openEntry
              ? `<button id="clockOutBtn" class="wl-btn" type="button">Clock out</button>`
              : `<button id="clockInBtn" class="wl-btn" type="button" ${isCancelled ? "disabled" : ""}>
                   Clock in
                 </button>`
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
          tsMsgEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err.message || "Clock in failed")}</div>`;
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
          tsMsgEl.innerHTML = `<div class="wl-alert wl-alert--success">Clocked out ✅</div>`;
          await refresh();
        } catch (err) {
          console.error(err);
          tsMsgEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err.message || "Clock out failed")}</div>`;
        } finally {
          setBusy(clockOutBtn, false, "Clock out");
        }
      });
    }
  }
} catch (err) {
  console.error(err);
  tsStateEl.textContent = "Error";
  tsStateEl.className = "wl-badge wl-badge--cancelled";
  tsBodyEl.innerHTML = `<div class="wl-alert wl-alert--error">Failed to load timesheet.</div>`;
  tsMsgEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err.message || "")}</div>`;
}

// ---- Helpers ----
function setBusy(btn, isBusy, label) {
  if (!btn) return;
  btn.disabled = !!isBusy;
  if (label) btn.textContent = label;
}

function statusLabel(status) {
  const s = String(status || "").toUpperCase();
  const map = {
    PUBLISHED: "Active",
    ACTIVE: "Active",
    OFFERED: "Offered",
    DRAFT: "Draft",
    CANCELLED: "Cancelled",
  };
  return map[s] || s || "Active";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
