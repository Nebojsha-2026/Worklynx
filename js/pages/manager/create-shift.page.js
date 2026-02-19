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
          <div class="wl-subtext" style="margin-top:6px;">You can also assign later from shift details.</div>
        </div>
      </div>

      <div class="wl-form__row">
        <div>
          <label>Time tracking</label>
          <select id="trackTime">
            <option value="true" selected>Track time (clock in/out)</option>
            <option value="false">No tracking required</option>
          </select>
        </div>
        <div>
          <label>Break</label>
          <select id="breakMode">
            <option value="NONE" selected>No break</option>
            <option value="PAID">Paid break</option>
            <option value="UNPAID">Unpaid break</option>
          </select>
        </div>
      </div>

      <div class="wl-form__row">
        <div>
          <label>Break minutes</label>
          <input id="breakMinutes" type="number" min="0" step="1" value="0" disabled />
        </div>
        <div></div>
      </div>

      <!-- ── Recurring toggle ── -->
      <div class="wl-card" style="padding:16px; background:rgba(109,40,217,0.04); border-color:var(--brand-border);">
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:14px; font-weight:700;">
          <input id="isRecurring" type="checkbox" style="width:18px; height:18px; cursor:pointer;" />
          This is a recurring shift
        </label>

        <div id="recurringPanel" style="display:none; margin-top:16px;">

          <div style="font-size:13px; color:var(--muted); margin-bottom:8px; font-weight:600;">Repeat on these days</div>
          <div id="dayPicker" style="display:flex; gap:8px; flex-wrap:wrap;">
            ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => `
              <label class="wl-day-pill" data-idx="${i}" style="
                display:inline-flex; align-items:center; justify-content:center;
                width:52px; height:52px; border-radius:10px; font-size:13px; font-weight:700;
                border:1.5px solid var(--wl-border); background:var(--wl-card);
                cursor:pointer; user-select:none; transition:background .12s, border-color .12s, color .12s;
                color:var(--text);">
                <input type="checkbox" value="${i+1}" name="recurDay" style="position:absolute; opacity:0; pointer-events:none;" />
                ${d}
              </label>
            `).join("")}
          </div>
          <div id="dayPickerHint" class="wl-subtext" style="margin-top:8px;">Select at least one day.</div>

          <div class="wl-form__row" style="margin-top:14px;">
            <div>
              <label>Repeat from date</label>
              <input id="recurStart" type="date" />
            </div>
            <div>
              <label>Repeat until <span style="font-weight:400; opacity:.7;">(optional — leave blank = ongoing)</span></label>
              <input id="recurEnd" type="date" />
            </div>
          </div>

          <div id="recurPreview" style="display:none; margin-top:12px;"></div>
        </div>
      </div>

      <!-- ── Single shift date panel ── -->
      <div id="singleDatePanel">
        <div class="wl-form__row">
          <div>
            <label>Start date</label>
            <input id="startDate" type="date" />
          </div>
          <div>
            <label>Start time</label>
            <select id="startTime"></select>
          </div>
        </div>
        <div class="wl-form__row">
          <div>
            <label>End date</label>
            <input id="endDate" type="date" />
          </div>
          <div>
            <label>End time</label>
            <select id="endTime"></select>
          </div>
        </div>
      </div>

      <!-- ── Recurring: time only ── -->
      <div id="recurringTimePanel" style="display:none;">
        <div class="wl-form__row">
          <div>
            <label>Start time</label>
            <select id="recurStartTime"></select>
          </div>
          <div>
            <label>End time</label>
            <select id="recurEndTime"></select>
          </div>
        </div>
      </div>

      <div id="hint" class="wl-subtext"></div>

      <button class="wl-btn wl-btn--primary" type="submit" id="submitBtn">Create shift</button>
    </form>

    <div id="result" style="margin-top:12px;"></div>
  </section>

  <style>
    .wl-day-pill.is-selected {
      background: var(--brand-soft) !important;
      border-color: var(--brand-border) !important;
      color: var(--brand) !important;
    }
  </style>
`;

/* ── Refs ───────────────────────────────────────────────── */
const hintEl              = content.querySelector("#hint");
const resultEl            = content.querySelector("#result");
const submitBtn           = content.querySelector("#submitBtn");
const titleEl             = content.querySelector("#title");
const descEl              = content.querySelector("#description");
const locEl               = content.querySelector("#location");
const rateEl              = content.querySelector("#rate");
const employeeSelect      = content.querySelector("#employeeSelect");
const trackTimeEl         = content.querySelector("#trackTime");
const breakModeEl         = content.querySelector("#breakMode");
const breakMinutesEl      = content.querySelector("#breakMinutes");
const isRecurringEl       = content.querySelector("#isRecurring");
const recurringPanel      = content.querySelector("#recurringPanel");
const singleDatePanel     = content.querySelector("#singleDatePanel");
const recurringTimePanel  = content.querySelector("#recurringTimePanel");
const startDateEl         = content.querySelector("#startDate");
const endDateEl           = content.querySelector("#endDate");
const startTimeEl         = content.querySelector("#startTime");
const endTimeEl           = content.querySelector("#endTime");
const recurStartEl        = content.querySelector("#recurStart");
const recurEndEl          = content.querySelector("#recurEnd");
const recurStartTimeEl    = content.querySelector("#recurStartTime");
const recurEndTimeEl      = content.querySelector("#recurEndTime");
const recurPreviewEl      = content.querySelector("#recurPreview");
const dayPickerHintEl     = content.querySelector("#dayPickerHint");

/* ── Time dropdowns ─────────────────────────────────────── */
function buildTimes() {
  return Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2), m = i % 2 === 0 ? "00" : "30";
    return `${String(h).padStart(2,"0")}:${m}:00`;
  });
}
function populateSel(sel) {
  sel.innerHTML = buildTimes().map((t) =>
    `<option value="${t}">${t.slice(0,5)}</option>`).join("");
}
[startTimeEl, endTimeEl, recurStartTimeEl, recurEndTimeEl].forEach(populateSel);

/* ── Default values ─────────────────────────────────────── */
const todayStr = isoDateOf(new Date());
startDateEl.value      = todayStr;
endDateEl.value        = todayStr;
recurStartEl.value     = todayStr;
startTimeEl.value      = "09:00:00";
endTimeEl.value        = "17:00:00";
recurStartTimeEl.value = "09:00:00";
recurEndTimeEl.value   = "17:00:00";

/* ── Day picker ─────────────────────────────────────────── */
const dayPills = content.querySelectorAll(".wl-day-pill");
dayPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    const cb = pill.querySelector("input");
    cb.checked = !cb.checked;
    pill.classList.toggle("is-selected", cb.checked);
    updatePreview();
    updateHint();
  });
});

function selectedDays() {
  return [...content.querySelectorAll("input[name=recurDay]:checked")]
    .map((cb) => Number(cb.value)); // 1=Mon…7=Sun
}

/* ── Toggle recurring ───────────────────────────────────── */
isRecurringEl.addEventListener("change", () => {
  const on = isRecurringEl.checked;
  recurringPanel.style.display      = on ? "block" : "none";
  singleDatePanel.style.display     = on ? "none"  : "block";
  recurringTimePanel.style.display  = on ? "block" : "none";
  submitBtn.textContent = on ? "Create recurring shifts" : "Create shift";
  updateHint();
  updatePreview();
});

/* ── Break toggle ───────────────────────────────────────── */
breakModeEl.addEventListener("change", () => {
  const enabled = breakModeEl.value !== "NONE";
  breakMinutesEl.disabled = !enabled;
  if (!enabled) breakMinutesEl.value = "0";
  updateHint();
});

/* ── Live change listeners ──────────────────────────────── */
[startDateEl, endDateEl, startTimeEl, endTimeEl,
 recurStartEl, recurEndEl, recurStartTimeEl, recurEndTimeEl,
 trackTimeEl, breakMinutesEl].forEach((el) =>
  el.addEventListener("change", () => { updateHint(); updatePreview(); })
);

/* ── Hint ───────────────────────────────────────────────── */
function updateHint() {
  const track = trackTimeEl.value === "true" ? "Time tracking ON" : "No tracking";
  const bMode = breakModeEl.value;
  const bMins = Number(breakMinutesEl.value || 0);
  const bText = bMode === "PAID" ? `Paid break ${bMins}m`
    : bMode === "UNPAID" ? `Unpaid break ${bMins}m` : "No break";

  if (!isRecurringEl.checked) {
    const s = dtMs(startDateEl.value, startTimeEl.value);
    const e = dtMs(endDateEl.value, endTimeEl.value);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
      hintEl.textContent = ""; return;
    }
    const m = Math.floor((e - s) / 60000);
    hintEl.textContent = `Duration: ${Math.floor(m/60)}h ${m%60}m · ${bText} · ${track}`;
  } else {
    const s = dtMs("2000-01-01", recurStartTimeEl.value);
    const e = dtMs("2000-01-01", recurEndTimeEl.value);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
      hintEl.textContent = ""; return;
    }
    const m = Math.floor((e - s) / 60000);
    hintEl.textContent = `Each shift: ${Math.floor(m/60)}h ${m%60}m · ${bText} · ${track}`;
  }
}
updateHint();

/* ── Recurring preview ──────────────────────────────────── */
function updatePreview() {
  if (!isRecurringEl.checked) { recurPreviewEl.style.display = "none"; return; }
  const days    = selectedDays();
  const fromStr = recurStartEl.value;
  const toStr   = recurEndEl.value;

  if (!days.length) {
    dayPickerHintEl.textContent = "Select at least one day.";
    recurPreviewEl.style.display = "none";
    return;
  }
  dayPickerHintEl.textContent = "";

  if (!fromStr) { recurPreviewEl.style.display = "none"; return; }

  const occurrences = genOccurrences(days, fromStr, toStr, 500);

  if (!occurrences.length) {
    recurPreviewEl.style.display = "block";
    recurPreviewEl.className = "wl-alert wl-alert--error";
    recurPreviewEl.innerHTML = "No occurrences found — check your dates and selected days.";
    return;
  }

  const preview = occurrences.slice(0, 5);
  const rest    = occurrences.length - preview.length;

  recurPreviewEl.style.display = "block";
  recurPreviewEl.className = "wl-alert";
  recurPreviewEl.innerHTML = `
    <strong style="font-size:14px;">
      ${occurrences.length} shift${occurrences.length === 1 ? "" : "s"} will be created
      ${!toStr ? " (ongoing)" : ""}
    </strong>
    <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">
      ${preview.map((d) => `<span class="wl-badge wl-badge--draft">${escapeHtml(d)}</span>`).join("")}
      ${rest > 0 ? `<span class="wl-badge">+${rest} more</span>` : ""}
    </div>
  `;
}

/* ── Occurrence generator ───────────────────────────────── */
// ISO weekday: getDay() returns 0=Sun,1=Mon…6=Sat
// Our value:   1=Mon…7=Sun
function isoWeekDay(date) {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}
function genOccurrences(days, fromStr, toStr, limit) {
  const daySet   = new Set(days);
  const from     = parseLocalDate(fromStr);
  const to       = toStr ? parseLocalDate(toStr) : new Date(from.getTime() + 2 * 365 * 86400000);
  const results  = [];
  const cursor   = new Date(from);

  while (cursor <= to && results.length < limit) {
    if (daySet.has(isoWeekDay(cursor))) results.push(isoDateOf(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

/* ── Load employees ─────────────────────────────────────── */
try {
  const members = await listOrgMembers({ organizationId: org.id, roles: ["EMPLOYEE"] });
  employeeSelect.innerHTML = `<option value="" selected>(No assignment)</option>` +
    (members || []).filter((m) => m.role === "EMPLOYEE").map((m) => {
      const label = m.full_name || m.email || m.user_id || "";
      return `<option value="${escapeHtml(m.user_id)}">${escapeHtml(label)}</option>`;
    }).join("");
} catch (e) { console.warn("Could not load employees", e); }

/* ── Submit ─────────────────────────────────────────────── */
content.querySelector("#shiftForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  resultEl.innerHTML = "";

  const title          = titleEl.value.trim();
  const description    = descEl.value.trim();
  const location       = locEl.value.trim();
  const hourlyRate     = Number(rateEl.value);
  const track_time     = trackTimeEl.value === "true";
  const breakMode      = breakModeEl.value;
  const breakMinutes   = Number(breakMinutesEl.value || 0);
  const hasBreak       = breakMode !== "NONE";
  const break_is_paid  = breakMode === "PAID";
  const employeeUserId = employeeSelect.value || "";
  const isRecurring    = isRecurringEl.checked;

  if (!title)                                    return showErr("Title is required.");
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return showErr("Hourly rate must be greater than 0.");
  if (hasBreak && breakMinutes <= 0)             return showErr("Break minutes must be greater than 0 when a break is enabled.");

  /* ── Single shift ── */
  if (!isRecurring) {
    const shift_date = startDateEl.value;
    const end_date   = endDateEl.value;
    const start_at   = startTimeEl.value;
    const end_at     = endTimeEl.value;

    if (!shift_date || !end_date) return showErr("Start and end date are required.");
    if (!start_at || !end_at)     return showErr("Start and end time are required.");

    const s = dtMs(shift_date, start_at), en = dtMs(end_date, end_at);
    if (!Number.isFinite(s) || !Number.isFinite(en)) return showErr("Invalid date/time.");
    if (en <= s) return showErr("End must be after start.");

    try {
      submitBtn.disabled = true;
      resultEl.innerHTML = `<div class="wl-subtext">Creating shift…</div>`;

      const shift = await createShift({
        organization_id: org.id, title, description, location,
        hourly_rate: hourlyRate, shift_date, end_date, start_at, end_at,
        break_minutes: hasBreak ? breakMinutes : 0,
        break_is_paid: hasBreak ? break_is_paid : true,
        track_time,
      });

      if (employeeUserId) {
        await assignShiftToEmployee({ shiftId: shift.id, employeeUserId });
      }

      afterSuccess([shift], employeeUserId, false);
    } catch (err) {
      console.error(err);
      showErr(err?.message || "Failed to create shift.");
    } finally {
      submitBtn.disabled = false;
    }
    return;
  }

  /* ── Recurring ── */
  const days     = selectedDays();
  const fromStr  = recurStartEl.value;
  const toStr    = recurEndEl.value;
  const start_at = recurStartTimeEl.value;
  const end_at   = recurEndTimeEl.value;

  if (!days.length)         return showErr("Select at least one day for the recurring schedule.");
  if (!fromStr)             return showErr("Repeat start date is required.");
  if (!start_at || !end_at) return showErr("Start and end time are required.");

  const s = dtMs("2000-01-01", start_at), en = dtMs("2000-01-01", end_at);
  if (en <= s) return showErr("End time must be after start time.");

  const occurrences = genOccurrences(days, fromStr, toStr, 500);
  if (!occurrences.length) return showErr("No occurrences found. Check dates and selected days.");

  const ongoing = !toStr;
  const ok = confirm(
    `Create ${occurrences.length} shift${occurrences.length === 1 ? "" : "s"}` +
    (ongoing ? " (ongoing — no end date set)" : "") + `?`
  );
  if (!ok) return;

  try {
    submitBtn.disabled = true;
    resultEl.innerHTML = `<div class="wl-subtext">Creating ${occurrences.length} shifts…</div>`;

    const recurringGroupId = crypto.randomUUID();
    const created = [];

    for (const dateStr of occurrences) {
      const shift = await createShift({
        organization_id: org.id, title, description, location,
        hourly_rate: hourlyRate,
        shift_date: dateStr,
        end_date: dateStr,
        start_at, end_at,
        break_minutes: hasBreak ? breakMinutes : 0,
        break_is_paid: hasBreak ? break_is_paid : true,
        track_time,
        recurring_group_id: recurringGroupId,
        is_recurring: true,
      });
      if (employeeUserId) {
        await assignShiftToEmployee({ shiftId: shift.id, employeeUserId });
      }
      created.push(shift);
    }

    afterSuccess(created, employeeUserId, true);
  } catch (err) {
    console.error(err);
    showErr(err?.message || "Failed to create recurring shifts.");
  } finally {
    submitBtn.disabled = false;
  }
});

/* ── Post-success ───────────────────────────────────────── */
function afterSuccess(shifts, employeeUserId, isRecurring) {
  const first = shifts[0];
  const last  = shifts[shifts.length - 1];

  resultEl.innerHTML = `
    <div class="wl-alert wl-alert--success">
      <div style="font-weight:800; margin-bottom:6px;">
        ${isRecurring ? `${shifts.length} recurring shifts created ✅` : "Shift created ✅"}
      </div>
      <div style="font-size:13px;">
        <div><b>${escapeHtml(first.title)}</b></div>
        <div style="margin-top:4px; opacity:.9;">
          ${isRecurring
            ? `${escapeHtml(first.shift_date)} → ${escapeHtml(last.shift_date)} · ${shifts.length} shifts`
            : `${escapeHtml(first.shift_date)} · ${escapeHtml(first.start_at)} → ${escapeHtml(first.end_at)}`}
        </div>
        ${employeeUserId ? `<div style="margin-top:4px; opacity:.9;">Employee assigned to all ✅</div>` : ""}
      </div>
      <a class="wl-btn" href="${path("/app/manager/shifts.html")}" style="display:inline-block; margin-top:12px;">
        View all shifts →
      </a>
    </div>
  `;

  // Reset
  content.querySelector("#shiftForm").reset();
  startDateEl.value      = isoDateOf(new Date());
  endDateEl.value        = isoDateOf(new Date());
  recurStartEl.value     = isoDateOf(new Date());
  recurEndEl.value       = "";
  startTimeEl.value      = "09:00:00";
  endTimeEl.value        = "17:00:00";
  recurStartTimeEl.value = "09:00:00";
  recurEndTimeEl.value   = "17:00:00";
  breakMinutesEl.disabled = true;
  dayPills.forEach((p) => {
    p.classList.remove("is-selected");
    p.querySelector("input").checked = false;
  });
  isRecurringEl.checked = false;
  recurringPanel.style.display     = "none";
  singleDatePanel.style.display    = "block";
  recurringTimePanel.style.display = "none";
  recurPreviewEl.style.display     = "none";
  submitBtn.textContent = "Create shift";
  updateHint();
}

function showErr(msg) {
  resultEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(msg)}</div>`;
}

/* ── Utils ──────────────────────────────────────────────── */
function dtMs(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}`).getTime();
}
function parseLocalDate(yyyyMmDd) {
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoDateOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function escapeHtml(str) {
  return String(str)
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
