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

const whenLabel = formatWhenLabel(shift.shift_date);
const statusBadge = renderStatusBadge(status);

// ---- Build UI shell (POLISHED) ----
content.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
    <div style="min-width:0;">
      <h1 style="margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${escapeHtml(shift.title || "Shift details")}
      </h1>

      <div style="margin-top:8px; font-size:13px; opacity:.85;">
        <b>${escapeHtml(whenLabel)}</b>
        • ${escapeHtml(shift.start_at || "")} → ${escapeHtml(shift.end_at || "")}
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
      <div><b>Date:</b> ${escapeHtml(shift.shift_date || "")}</div>
      <div><b>Time:</b> ${escapeHtml(shift.start_at || "")} → ${escapeHtml(shift.end_at || "")}</div>
      ${
        shift.hourly_rate != null
          ? `<div><b>Rate:</b> ${escapeHtml(String(shift.hourly_rate))} / hr</div>`
          : ""
      }
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

// ---- Timesheet logic (UNCHANGED) ----
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

  renderTimesheetUI({ timesheet, openEntry, isCancelled });

  async function refresh() {
    tsMsgEl.innerHTML = "";
    openEntry = await getOpenTimeEntry({ timesheetId: timesheet.id });
    renderTimesheetUI({ timesheet, openEntry, isCancelled });
  }

  function renderTimesheetUI({ timesheet, openEntry, isCancelled }) {
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
            : `<div style="opacity:.9;">You are not clocked in.</div>`
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
