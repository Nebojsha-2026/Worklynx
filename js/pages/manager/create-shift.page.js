// js/pages/manager/create-shift.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { createShift } from "../../data/shifts.api.js";

// Only BO/BM/MANAGER can create shifts
await requireRole(["BO", "BM", "MANAGER"]);

const org = await loadOrgContext();

function splitDateTime(dtLocal) {
  const [d, t] = String(dtLocal).split("T");
  return {
    date: d,
    time: t && t.length === 5 ? `${t}:00` : t,
  };
}

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

main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

main.querySelector("#wlContent").innerHTML = `
  <h1>Create shift</h1>

  <section class="wl-card wl-panel">
    <form id="shiftForm" class="wl-form">

      <label>Title</label>
      <input id="title" required placeholder="Morning shift" />

      <label>Description</label>
      <textarea id="description" rows="3" placeholder="Optional notes..."></textarea>

      <label>Location</label>
      <input id="location" placeholder="Main warehouse" />

      <label>Hourly rate</label>
      <input id="rate" type="number" step="0.01" min="0" required placeholder="e.g. 35.00" />

      <div class="wl-form__row">
        <div>
          <label>Start</label>
          <input id="startAt" type="datetime-local" required />
        </div>
        <div>
          <label>End</label>
          <input id="endAt" type="datetime-local" required />
        </div>
      </div>

      <!-- NEW: Break options (optional) -->
      <div class="wl-card wl-panel" style="padding:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div style="font-weight:800;">Break (optional)</div>
          <label style="display:flex; align-items:center; gap:10px; font-size:13px; opacity:.9;">
            <input id="hasBreak" type="checkbox" />
            Has break
          </label>
        </div>

        <div id="breakFields" style="display:none; margin-top:10px;">
          <div class="wl-form__row">
            <div>
              <label>Break minutes</label>
              <input id="breakMinutes" type="number" min="0" step="1" placeholder="e.g. 30" />
            </div>
            <div style="display:flex; align-items:flex-end;">
              <label style="display:flex; align-items:center; gap:10px; margin:0;">
                <input id="breakIsPaid" type="checkbox" />
                Break is paid
              </label>
            </div>
          </div>

          <div style="font-size:13px; opacity:.8; margin-top:6px;">
            If unpaid, break minutes are subtracted from paid time.
          </div>
        </div>
      </div>

      <button class="wl-btn" type="submit">Create shift</button>
    </form>

    <div id="result" style="margin-top:12px;"></div>
  </section>
`;

const hasBreakEl = document.querySelector("#hasBreak");
const breakFieldsEl = document.querySelector("#breakFields");
const breakMinutesEl = document.querySelector("#breakMinutes");
const breakIsPaidEl = document.querySelector("#breakIsPaid");

// default: no break
hasBreakEl.checked = false;
breakFieldsEl.style.display = "none";
breakMinutesEl.value = "";
breakIsPaidEl.checked = false;

hasBreakEl.addEventListener("change", () => {
  const on = !!hasBreakEl.checked;
  breakFieldsEl.style.display = on ? "block" : "none";
  if (!on) {
    breakMinutesEl.value = "";
    breakIsPaidEl.checked = false;
  }
});

document.querySelector("#shiftForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const resultEl = document.querySelector("#result");
  const btn = e.target.querySelector('button[type="submit"]');

  const title = document.querySelector("#title").value.trim();
  const description = document.querySelector("#description").value.trim();
  const location = document.querySelector("#location").value.trim();
  const rateRaw = document.querySelector("#rate").value;
  const startAt = document.querySelector("#startAt").value;
  const endAt = document.querySelector("#endAt").value;

  const hourlyRate = Number(rateRaw);

  if (!title) {
    resultEl.innerHTML = `<div style="color:#ffb3b3;">Title is required.</div>`;
    return;
  }
  if (!startAt) {
    resultEl.innerHTML = `<div style="color:#ffb3b3;">Start time is required.</div>`;
    return;
  }
  if (!endAt) {
    resultEl.innerHTML = `<div style="color:#ffb3b3;">End time is required.</div>`;
    return;
  }
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    resultEl.innerHTML = `<div style="color:#ffb3b3;">Hourly rate must be greater than 0.</div>`;
    return;
  }

  const start = splitDateTime(startAt);
  const end = splitDateTime(endAt);

  if (start.date !== end.date) {
    resultEl.innerHTML = `<div style="color:#ffb3b3;">Start and end must be on the same date (for now).</div>`;
    return;
  }

  const startMs = new Date(`${start.date}T${start.time}`).getTime();
  const endMs = new Date(`${end.date}T${end.time}`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    resultEl.innerHTML = `<div style="color:#ffb3b3;">Invalid date/time.</div>`;
    return;
  }
  if (endMs <= startMs) {
    resultEl.innerHTML = `<div style="color:#ffb3b3;">End time must be after start time.</div>`;
    return;
  }

  // Break payload (optional)
  let break_minutes = 0;
  let break_is_paid = false;

  if (hasBreakEl.checked) {
    const mins = Number(breakMinutesEl.value);
    if (!Number.isFinite(mins) || mins < 0) {
      resultEl.innerHTML = `<div style="color:#ffb3b3;">Break minutes must be 0 or more.</div>`;
      return;
    }
    break_minutes = Math.round(mins);
    break_is_paid = !!breakIsPaidEl.checked;

    // If minutes is 0, paid/unpaid is irrelevant; normalize to false.
    if (break_minutes === 0) break_is_paid = false;
  }

  const payload = {
    organization_id: org.id,
    title,
    description,
    location,
    hourly_rate: hourlyRate,
    shift_date: start.date,
    start_at: start.time,
    end_at: end.time,

    // Your schema already has break_minutes; keep it always present.
    break_minutes,

    // Optional flag; safe even when break_minutes = 0
    break_is_paid,
  };

  try {
    resultEl.innerHTML = `<div style="opacity:.85;">Creating shift…</div>`;
    btn.disabled = true;

    const shift = await createShift(payload);

    const breakSummary =
      (shift.break_minutes || 0) > 0
        ? `${shift.break_minutes} min (${shift.break_is_paid ? "paid" : "unpaid"})`
        : "No break";

    resultEl.innerHTML = `
      <div class="wl-card" style="padding:12px;">
        <strong>Shift created</strong><br/>
        <div style="opacity:.9; margin-top:6px;">
          <div><b>${shift.title}</b></div>
          <div style="font-size:13px; opacity:.85;">
            ${shift.shift_date} • ${shift.start_at} → ${shift.end_at}
          </div>
          <div style="font-size:13px; opacity:.85; margin-top:6px;">
            Break: <b>${breakSummary}</b>
          </div>
        </div>
      </div>
    `;

    e.target.reset();
    // restore defaults
    hasBreakEl.checked = false;
    breakFieldsEl.style.display = "none";
    breakMinutesEl.value = "";
    breakIsPaidEl.checked = false;
  } catch (err) {
    console.error(err);
    resultEl.innerHTML = `<div style="color:#ffb3b3;">${err.message || "Failed to create shift."}</div>`;
  } finally {
    btn.disabled = false;
  }
});
