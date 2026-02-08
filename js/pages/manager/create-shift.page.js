// js/pages/manager/create-shift.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { createShift } from "../../data/shifts.api.js";

// Only BO/BM/MANAGER can create shifts (you can tighten later)
await requireRole(["BO", "BM", "MANAGER"]);

const org = await loadOrgContext();

// Helpers
function splitDateTime(dtLocal) {
  // dtLocal from <input type="datetime-local"> format: YYYY-MM-DDTHH:MM
  const [d, t] = String(dtLocal).split("T");
  return {
    date: d,
    time: t && t.length === 5 ? `${t}:00` : t, // ensure HH:MM:SS
  };
}

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

main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

main.querySelector("#wlContent").innerHTML = `
  <h1>Create shift</h1>

  <section class="wl-card wl-formcard">
    <form id="shiftForm" class="wl-form">

      <label>Title</label>
      <input id="title" required placeholder="Morning shift" />

      <label>Description</label>
      <textarea id="description" rows="3" placeholder="Optional notes..."></textarea>

      <label>Location</label>
      <input id="location" placeholder="Main warehouse" />

      <label>Hourly rate</label>
      <input id="rate" type="number" step="0.01" min="0" required placeholder="e.g. 35.00" />

      <div class="wl-grid2">
        <div>
          <label>Start</label>
          <input id="startAt" type="datetime-local" required />
        </div>
        <div>
          <label>End</label>
          <input id="endAt" type="datetime-local" required />
        </div>
      </div>

      <button class="wl-btn" type="submit">Create shift</button>
    </form>

    <div id="result" style="margin-top:12px;"></div>
  </section>
`;

// Submit
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

  // Validation
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

  // For now we require same date (simple shift model)
  if (start.date !== end.date) {
    resultEl.innerHTML = `<div style="color:#ffb3b3;">Start and end must be on the same date (for now).</div>`;
    return;
  }

  // Compare start/end
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

  // Payload matches your DB schema (shift_date + time columns)
  const payload = {
    organization_id: org.id,
    title,
    description,
    location,
    hourly_rate: hourlyRate,
    shift_date: start.date,
    start_at: start.time,
    end_at: end.time,
  };

  try {
    resultEl.innerHTML = `<div style="opacity:.85;">Creating shift…</div>`;
    btn.disabled = true;

    const shift = await createShift(payload);

    // IMPORTANT: start_at/end_at are TIME values, not full timestamps
    resultEl.innerHTML = `
      <div class="wl-card" style="padding:12px;">
        <strong>Shift created</strong><br/>
        <div style="opacity:.9; margin-top:6px;">
          <div><b>${shift.title}</b></div>
          <div style="font-size:13px; opacity:.85;">
            ${shift.shift_date} • ${shift.start_at} → ${shift.end_at}
          </div>
        </div>
      </div>
    `;

    e.target.reset();
  } catch (err) {
    console.error(err);
    resultEl.innerHTML = `<div style="color:#ffb3b3;">${err.message || "Failed to create shift."}</div>`;
  } finally {
    btn.disabled = false;
  }
});
