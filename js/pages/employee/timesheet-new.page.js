// js/pages/employee/timesheet-new.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { getSupabase } from "../../core/supabaseClient.js";
import { path } from "../../core/config.js";
import { createTimeEntry } from "../../data/timeEntries.api.js";

await requireRole(["EMPLOYEE"]);

const params = new URLSearchParams(window.location.search);
const shiftId = params.get("shiftId");

if (!shiftId) {
  window.location.replace(path("/app/employee/my-shifts.html"));
  throw new Error("Missing shiftId");
}

const org = await loadOrgContext();
const supabase = getSupabase();

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
main.querySelector("#wlSidebar").append(renderSidebar("EMPLOYEE"));

const content = main.querySelector("#wlContent");
content.innerHTML = `<div style="opacity:.85;">Loading shift…</div>`;

// Load shift (so we can prefill)
const { data: shift, error } = await supabase
  .from("shifts")
  .select("*")
  .eq("id", shiftId)
  .single();

if (error || !shift) {
  content.innerHTML = `<div class="wl-alert wl-alert--error">Shift not found.</div>`;
  throw error;
}

// Prefill (time is stored as TIME; we'll capture as HH:MM)
const startHHMM = String(shift.start_at || "").slice(0, 5);
const endHHMM = String(shift.end_at || "").slice(0, 5);

content.innerHTML = `
  <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <div>
      <h1 style="margin:0;">Create timesheet</h1>
      <div style="margin-top:6px; opacity:.85; font-size:13px;">
        For shift: <b>${escapeHtml(shift.title || "Untitled shift")}</b>
        • ${escapeHtml(shift.shift_date)} • ${escapeHtml(shift.start_at)} → ${escapeHtml(shift.end_at)}
      </div>
    </div>

    <a class="wl-btn" href="${path(`/app/employee/shift.html?id=${encodeURIComponent(shiftId)}`)}">← Back</a>
  </div>

  <section class="wl-card wl-panel" style="margin-top:14px; max-width:780px;">
    <form id="tsForm" class="wl-form">
      <label>Date</label>
      <input id="date" type="date" required value="${escapeHtml(shift.shift_date || "")}" />

      <div class="wl-form__row">
        <div>
          <label>Start time</label>
          <input id="start" type="time" required value="${escapeHtml(startHHMM)}" />
        </div>
        <div>
          <label>End time</label>
          <input id="end" type="time" required value="${escapeHtml(endHHMM)}" />
        </div>
      </div>

      <label>Break (minutes)</label>
      <input id="break" type="number" min="0" step="1" value="0" />

      <label>Notes (optional)</label>
      <textarea id="notes" rows="3" placeholder="Anything your manager should know..."></textarea>

      <button class="wl-btn" type="submit">Submit timesheet</button>
    </form>

    <div id="msg" style="margin-top:10px;"></div>
  </section>
`;

document.querySelector("#tsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.querySelector("#msg");
  const btn = e.target.querySelector('button[type="submit"]');

  const date = document.querySelector("#date").value;
  const start = document.querySelector("#start").value;
  const end = document.querySelector("#end").value;
  const breakMin = Number(document.querySelector("#break").value || 0);
  const notes = document.querySelector("#notes").value.trim();

  if (!date || !start || !end) {
    msg.innerHTML = `<div class="wl-alert wl-alert--error">Date, start and end are required.</div>`;
    return;
  }
  if (!Number.isFinite(breakMin) || breakMin < 0) {
    msg.innerHTML = `<div class="wl-alert wl-alert--error">Break minutes must be 0 or more.</div>`;
    return;
  }

  // Compare times on the selected date
  const startMs = new Date(`${date}T${start}:00`).getTime();
  const endMs = new Date(`${date}T${end}:00`).getTime();
  if (!(Number.isFinite(startMs) && Number.isFinite(endMs)) || endMs <= startMs) {
    msg.innerHTML = `<div class="wl-alert wl-alert--error">End time must be after start time.</div>`;
    return;
  }

  const payload = {
    organization_id: shift.organization_id || org.id,
    shift_id: shiftId,

    // Common columns (adjust ONLY if your table uses different names)
    entry_date: date,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
    break_minutes: breakMin,
    notes,
  };

  try {
    btn.disabled = true;
    msg.innerHTML = `<div style="opacity:.85;">Submitting…</div>`;

    const created = await createTimeEntry(payload);

    msg.innerHTML = `
      <div class="wl-alert wl-alert--success">
        Timesheet submitted ✅
        <div style="font-size:13px; opacity:.9; margin-top:6px;">
          ${escapeHtml(created.entry_date || date)} • ${escapeHtml(created.start_time || start)} → ${escapeHtml(created.end_time || end)}
        </div>
      </div>
    `;

    // Optional: redirect back after a short delay (remove if you don’t want)
    // setTimeout(() => window.location.replace(path(`/app/employee/shift.html?id=${encodeURIComponent(shiftId)}`)), 800);
  } catch (err) {
    console.error(err);
    msg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err.message || "Failed to submit timesheet.")}</div>`;
  } finally {
    btn.disabled = false;
  }
});

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
