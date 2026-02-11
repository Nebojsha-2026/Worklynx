// js/pages/manager/create-shift.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { createShift } from "../../data/shifts.api.js";
import { listOrgMembers } from "../../data/members.api.js";
import { assignShiftToEmployee } from "../../data/assignments.api.js";
import { path } from "../../core/config.js";

await requireRole(["BO", "BM", "MANAGER"]);

const org = await loadOrgContext();

document.body.prepend(
  renderHeader({ companyName: org.name, companyLogoUrl: org.company_logo_url })
);
document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.innerHTML = `
  <div class="wl-shell">
    <div id="wlSidebar"></div>
    <div id="wlContent"></div>
  </div>
`;
main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <h1 style="margin:0;">Create shift</h1>
    <a class="wl-btn" href="${path("/app/manager/shifts.html")}">← Back to shifts</a>
  </div>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <form id="shiftForm" class="wl-form">

      <label>Title</label>
      <input id="title" required placeholder="Morning shift" />

      <label>Description</label>
      <textarea id="description" rows="3" placeholder="Optional notes..."></textarea>

      <label>Location</label>
      <input id="location" placeholder="Main warehouse" />

      <div class="wl-form__row">
        <div>
          <label>Hourly rate</label>
          <input id="rate" type="number" step="0.01" min="0" required placeholder="e.g. 35.00" />
        </div>

        <div>
          <label>Assign employee (optional)</label>
          <select id="employeeSelect">
            <option value="" selected>(No assignment)</option>
          </select>
          <div style="font-size:12px; opacity:.75; margin-top:6px;">
            You can also assign later from shift details.
          </div>
        </div>
      </div>

      <div class="wl-form__row">
        <div>
          <label>Start date</label>
          <input id="startDate" type="date" required />
        </div>
        <div>
          <label>Start time</label>
          <select id="startTime" required></select>
        </div>
      </div>

      <div class="wl-form__row">
        <div>
          <label>End date</label>
          <input id="endDate" type="date" required />
        </div>
        <div>
          <label>End time</label>
          <select id="endTime" required></select>
        </div>
      </div>

      <div class="wl-form__row">
        <div>
          <label>Break (optional)</label>
          <select id="breakMode">
            <option value="NONE" selected>No break</option>
            <option value="PAID">Paid break</option>
            <option value="UNPAID">Unpaid break</option>
          </select>
        </div>
        <div>
          <label>Break minutes</label>
          <input id="breakMinutes" type="number" min="0" step="1" value="0" disabled />
        </div>
      </div>

      <div id="hint" style="font-size:13px; opacity:.85;"></div>

      <button class="wl-btn" type="submit">Create shift</button>
    </form>

    <div id="result" style="margin-top:12px;"></div>
  </section>
`;

const hintEl = document.querySelector("#hint");
const resultEl = document.querySelector("#result");

const titleEl = document.querySelector("#title");
const descEl = document.querySelector("#description");
const locEl = document.querySelector("#location");
const rateEl = document.querySelector("#rate");

const employeeSelect = document.querySelector("#employeeSelect");

const startDateEl = document.querySelector("#startDate");
const endDateEl = document.querySelector("#endDate");
const startTimeEl = document.querySelector("#startTime");
const endTimeEl = document.querySelector("#endTime");

const breakModeEl = document.querySelector("#breakMode");
const breakMinutesEl = document.querySelector("#breakMinutes");

// Populate time dropdowns (30-min intervals)
function buildTimeOptions() {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      opts.push(`${hh}:${mm}:00`);
    }
  }
  return opts;
}
function renderTimeSelect(selectEl) {
  const times = buildTimeOptions();
  selectEl.innerHTML = times
    .map((t) => {
      const label = t.slice(0, 5); // HH:MM
      return `<option value="${t}">${label}</option>`;
    })
    .join("");
}
renderTimeSelect(startTimeEl);
renderTimeSelect(endTimeEl);

// Default dates (today)
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");
const todayStr = `${yyyy}-${mm}-${dd}`;
startDateEl.value = todayStr;
endDateEl.value = todayStr;

// Default times
startTimeEl.value = "09:00:00";
endTimeEl.value = "17:00:00";

// Break enable/disable
breakModeEl.addEventListener("change", () => {
  const mode = breakModeEl.value;
  const enabled = mode !== "NONE";
  breakMinutesEl.disabled = !enabled;
  if (!enabled) breakMinutesEl.value = "0";
  updateHint();
});
breakMinutesEl.addEventListener("input", updateHint);
startDateEl.addEventListener("change", () => {
  // keep end date aligned by default
  if (!endDateEl.value) endDateEl.value = startDateEl.value;
  updateHint();
});
endDateEl.addEventListener("change", updateHint);
startTimeEl.addEventListener("change", updateHint);
endTimeEl.addEventListener("change", updateHint);

// Load employees for assignment dropdown
try {
  const members = await listOrgMembers({ organizationId: org.id, roles: ["EMPLOYEE"] });
  const employees = (members || []).filter((m) => String(m.role).toUpperCase() === "EMPLOYEE");

  employeeSelect.innerHTML = `
    <option value="" selected>(No assignment)</option>
    ${employees
      .map((m) => {
        const label = (m.full_name || m.email || m.user_id || "").toString();
        return `<option value="${escapeHtml(m.user_id)}">${escapeHtml(label)}</option>`;
      })
      .join("")}
  `;
} catch (e) {
  // Don't block creation if employees can't load
  console.warn("Could not load employees", e);
}

function dtMs(dateStr, timeStr) {
  // dateStr: YYYY-MM-DD, timeStr: HH:MM:SS
  return new Date(`${dateStr}T${timeStr}`).getTime();
}

function updateHint() {
  hintEl.innerHTML = "";

  const sd = startDateEl.value;
  const ed = endDateEl.value;
  const st = startTimeEl.value;
  const et = endTimeEl.value;

  if (!sd || !ed || !st || !et) return;

  const start = dtMs(sd, st);
  const end = dtMs(ed, et);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;

  if (end <= start) {
    hintEl.innerHTML = `<div class="wl-alert wl-alert--error">End must be after start.</div>`;
    return;
  }

  const mins = Math.floor((end - start) / 60000);
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;

  const mode = breakModeEl.value;
  const breakMins = Number(breakMinutesEl.value || 0);

  let breakText = "No break";
  if (mode === "PAID") breakText = `Paid break: ${breakMins} min`;
  if (mode === "UNPAID") breakText = `Unpaid break: ${breakMins} min`;

  hintEl.innerHTML = `
    <div style="font-size:13px; opacity:.9;">
      Duration: <b>${hours}h ${rem}m</b> • ${escapeHtml(breakText)}
    </div>
  `;
}
updateHint();

// Submit
document.querySelector("#shiftForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');

  resultEl.innerHTML = "";
  hintEl.innerHTML = "";

  const title = titleEl.value.trim();
  const description = descEl.value.trim();
  const location = locEl.value.trim();
  const hourlyRate = Number(rateEl.value);

  const shift_date = startDateEl.value;
  const end_date = endDateEl.value;
  const start_at = startTimeEl.value;
  const end_at = endTimeEl.value;

  const breakMode = breakModeEl.value;
  const breakMinutes = Number(breakMinutesEl.value || 0);
  const break_is_paid = breakMode === "PAID";
  const hasBreak = breakMode !== "NONE";

  if (!title) return showErr("Title is required.");
  if (!shift_date) return showErr("Start date is required.");
  if (!end_date) return showErr("End date is required.");
  if (!start_at) return showErr("Start time is required.");
  if (!end_at) return showErr("End time is required.");
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return showErr("Hourly rate must be greater than 0.");

  const startMs = dtMs(shift_date, start_at);
  const endMs = dtMs(end_date, end_at);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return showErr("Invalid date/time.");
  if (endMs <= startMs) return showErr("End must be after start.");

  if (hasBreak && (!Number.isFinite(breakMinutes) || breakMinutes < 0)) {
    return showErr("Break minutes must be 0 or more.");
  }

  // Payload (requires shifts.end_date column)
  const payload = {
    organization_id: org.id,
    title,
    description,
    location,
    hourly_rate: hourlyRate,
    shift_date,
    end_date,
    start_at,
    end_at,
    // these two assume you added/kept them in shifts table
    break_minutes: hasBreak ? breakMinutes : 0,
    break_is_paid: hasBreak ? break_is_paid : true, // irrelevant if no break
  };

  try {
    btn.disabled = true;
    resultEl.innerHTML = `<div style="opacity:.85;">Creating shift…</div>`;

    const shift = await createShift(payload);

    // Optional assign immediately
    const employeeUserId = employeeSelect.value || "";
    if (employeeUserId) {
      await assignShiftToEmployee({ shiftId: shift.id, employeeUserId });
    }

    resultEl.innerHTML = `
      <div class="wl-alert wl-alert--success">
        <b>Shift created ✅</b><br/>
        <div style="opacity:.9; margin-top:6px;">
          <div><b>${escapeHtml(shift.title)}</b></div>
          <div style="font-size:13px; opacity:.85;">
            ${escapeHtml(shift.shift_date)} ${escapeHtml(shift.start_at)} → ${escapeHtml(shift.end_date)} ${escapeHtml(shift.end_at)}
          </div>
          ${employeeUserId ? `<div style="font-size:13px; opacity:.85; margin-top:6px;">Employee assigned ✅</div>` : ""}
        </div>
      </div>
    `;

    e.target.reset();

    // Restore defaults after reset
    startDateEl.value = todayStr;
    endDateEl.value = todayStr;
    startTimeEl.value = "09:00:00";
    endTimeEl.value = "17:00:00";
    breakModeEl.value = "NONE";
    breakMinutesEl.value = "0";
    breakMinutesEl.disabled = true;
    employeeSelect.value = "";

    updateHint();
  } catch (err) {
    console.error(err);
    showErr(err?.message || "Failed to create shift.");
  } finally {
    btn.disabled = false;
  }
});

function showErr(msg) {
  resultEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(msg)}</div>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
