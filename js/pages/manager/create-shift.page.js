// js/pages/manager.create-shift.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { createShift } from "../../data/shifts.api.js";

await requireRole(["BO", "BM", "MANAGER"]);

const org = await loadOrgContext();

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

  <section class="wl-card" style="padding:16px; max-width:720px;">
    <form id="shiftForm" class="wl-form">

      <label>Title</label>
      <input id="title" required placeholder="Morning shift" />

      <label>Description</label>
      <textarea id="description" rows="3"></textarea>

      <label>Location</label>
      <input id="location" placeholder="Main warehouse" />

      <label>Hourly rate</label>
      <input id="rate" type="number" step="0.01" required />

      <label>Start</label>
      <input id="startAt" type="datetime-local" required />

      <label>End</label>
      <input id="endAt" type="datetime-local" required />

      <button class="wl-btn" type="submit">Create shift</button>
    </form>

    <div id="result" style="margin-top:12px;"></div>
  </section>
`;

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

  // Basic validation
  const hourlyRate = Number(rateRaw);

  if (!title) return (resultEl.innerHTML = `<div style="color:#ffb3b3;">Title is required.</div>`);
  if (!startAt) return (resultEl.innerHTML = `<div style="color:#ffb3b3;">Start time is required.</div>`);
  if (!endAt) return (resultEl.innerHTML = `<div style="color:#ffb3b3;">End time is required.</div>`);
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    return (resultEl.innerHTML = `<div style="color:#ffb3b3;">Hourly rate must be greater than 0.</div>`);
  }

  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return (resultEl.innerHTML = `<div style="color:#ffb3b3;">Invalid date/time.</div>`);
  }
  if (endMs <= startMs) {
    return (resultEl.innerHTML = `<div style="color:#ffb3b3;">End time must be after start time.</div>`);
  }

  const payload = {
    organization_id: org.id,
    title,
    description,
    location,
    hourly_rate: hourlyRate,
    start_at: startAt,
    end_at: endAt,
  };

  try {
    resultEl.innerHTML = `<div style="opacity:.85;">Creating shift…</div>`;
    btn.disabled = true;

    const shift = await createShift(payload);

    resultEl.innerHTML = `
      <div class="wl-card" style="padding:12px;">
        <strong>Shift created</strong><br/>
        <div style="opacity:.9; margin-top:6px;">
          <div><b>${shift.title}</b></div>
          <div style="font-size:13px; opacity:.85;">
            ${new Date(shift.start_at).toLocaleString()} → ${new Date(shift.end_at).toLocaleString()}
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
