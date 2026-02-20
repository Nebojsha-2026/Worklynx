// js/pages/manager/create-shift.page.js
import { requireRole }          from "../../core/guards.js";
import { renderHeader }         from "../../ui/header.js";
import { renderFooter }         from "../../ui/footer.js";
import { renderSidebar }        from "../../ui/sidebar.js";
import { loadOrgContext }       from "../../core/orgContext.js";
import { createShift }          from "../../data/shifts.api.js";
import { listOrgMembers }       from "../../data/members.api.js";
import { assignShiftToEmployee} from "../../data/assignments.api.js";
import { path }                 from "../../core/config.js";
import { getSupabase }          from "../../core/supabaseClient.js";
import { getSession }           from "../../core/session.js";

await requireRole(["BO", "BM", "MANAGER"]);
const org      = await loadOrgContext();
const supabase = getSupabase();

document.body.prepend(renderHeader({ companyName: org.name, companyLogoUrl: org.company_logo_url }));
document.body.append(renderFooter({ version: "v0.1.0" }));

const main = document.querySelector("main");
main.innerHTML = `<div class="wl-shell"><div id="wlSidebar"></div><div id="wlContent"></div></div>`;
main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

const content = main.querySelector("#wlContent");
content.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
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
          <label>Assign employee <span style="font-weight:400;opacity:.7;">(optional)</span></label>
          <select id="employeeSelect"><option value="">(No assignment)</option></select>
          <div class="wl-subtext" style="margin-top:6px;">You can also assign later from shift details.</div>
        </div>
      </div>

      <div class="wl-form__row">
        <div>
          <label>Time tracking</label>
          <select id="trackTime">
            <option value="true">Track time (clock in/out)</option>
            <option value="false">No tracking required</option>
          </select>
        </div>
        <div>
          <label>Break</label>
          <select id="breakMode">
            <option value="NONE">No break</option>
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

      <!-- Recurring toggle card -->
      <div class="wl-card" style="padding:16px;background:rgba(0,180,160,0.04);border-color:var(--brand-border);">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;font-weight:700;">
          <input id="isRecurring" type="checkbox" style="width:18px;height:18px;cursor:pointer;" />
          ♻ This is a recurring shift
        </label>

        <div id="recurringPanel" style="display:none;margin-top:16px;">

          <div style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:8px;">Repeat on these days</div>
          <div id="dayPicker" style="display:flex;gap:8px;flex-wrap:wrap;">
            ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i) => `
              <label class="wl-day-pill" style="
                display:inline-flex;align-items:center;justify-content:center;
                width:52px;height:52px;border-radius:10px;font-size:13px;font-weight:700;
                border:1.5px solid var(--wl-border);background:var(--wl-card);
                cursor:pointer;user-select:none;transition:.12s;color:var(--text);position:relative;">
                <input type="checkbox" value="${i+1}" name="recurDay" style="position:absolute;opacity:0;pointer-events:none;" />
                ${d}
              </label>`).join("")}
          </div>
          <div id="dayPickerHint" class="wl-subtext" style="margin-top:8px;">Select at least one day.</div>

          <div class="wl-form__row" style="margin-top:14px;">
            <div>
              <label>Repeat from date</label>
              <input id="recurStart" type="date" />
            </div>
            <div>
              <label>Repeat until <span style="font-weight:400;color:var(--muted);">(leave blank = ongoing)</span></label>
              <input id="recurEnd" type="date" />
            </div>
          </div>

          <!-- Ongoing info banner — visible only when end date is empty -->
          <div id="ongoingBanner" style="display:none;margin-top:14px;padding:14px 16px;
            border-radius:10px;border:1.5px solid var(--brand-border);background:var(--brand-soft);">
            <div style="font-weight:700;font-size:13px;margin-bottom:6px;">♻ Ongoing recurring series</div>
            <div class="wl-subtext">
              Only the <strong>first occurrence</strong> will be created now. Each subsequent shift is generated
              automatically <strong>24 hours before it starts</strong> — visible to both managers and employees.
              Every shift in this series will show a <strong>♻ Recurring · Ongoing</strong> badge.<br/>
              When you know the end date, open <strong>Recurring Series</strong> from the shifts menu and set it there.
            </div>
          </div>

          <div id="recurPreview" style="display:none;margin-top:12px;"></div>
        </div>
      </div>

      <!-- Single shift date/time -->
      <div id="singleDatePanel">
        <div class="wl-form__row">
          <div><label>Start date</label><input id="startDate" type="date" /></div>
          <div><label>Start time</label><select id="startTime"></select></div>
        </div>
        <div class="wl-form__row">
          <div><label>End date</label><input id="endDate" type="date" /></div>
          <div><label>End time</label><select id="endTime"></select></div>
        </div>
      </div>

      <!-- Recurring: time only (date comes from the day picker) -->
      <div id="recurringTimePanel" style="display:none;">
        <div class="wl-form__row">
          <div><label>Start time</label><select id="recurStartTime"></select></div>
          <div><label>End time</label><select id="recurEndTime"></select></div>
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

/* ── Element refs ─────────────────────────────────────────── */
const hintEl             = content.querySelector("#hint");
const resultEl           = content.querySelector("#result");
const submitBtn          = content.querySelector("#submitBtn");
const titleEl            = content.querySelector("#title");
const descEl             = content.querySelector("#description");
const locEl              = content.querySelector("#location");
const rateEl             = content.querySelector("#rate");
const employeeSelect     = content.querySelector("#employeeSelect");
const trackTimeEl        = content.querySelector("#trackTime");
const breakModeEl        = content.querySelector("#breakMode");
const breakMinutesEl     = content.querySelector("#breakMinutes");
const isRecurringEl      = content.querySelector("#isRecurring");
const recurringPanel     = content.querySelector("#recurringPanel");
const singleDatePanel    = content.querySelector("#singleDatePanel");
const recurringTimePanel = content.querySelector("#recurringTimePanel");
const startDateEl        = content.querySelector("#startDate");
const endDateEl          = content.querySelector("#endDate");
const startTimeEl        = content.querySelector("#startTime");
const endTimeEl          = content.querySelector("#endTime");
const recurStartEl       = content.querySelector("#recurStart");
const recurEndEl         = content.querySelector("#recurEnd");
const recurStartTimeEl   = content.querySelector("#recurStartTime");
const recurEndTimeEl     = content.querySelector("#recurEndTime");
const recurPreviewEl     = content.querySelector("#recurPreview");
const dayPickerHintEl    = content.querySelector("#dayPickerHint");
const ongoingBannerEl    = content.querySelector("#ongoingBanner");
const dayPills           = content.querySelectorAll(".wl-day-pill");

/* ── Time dropdowns ───────────────────────────────────────── */
function buildTimes() {
  return Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2), m = i % 2 === 0 ? "00" : "30";
    return `${String(h).padStart(2,"0")}:${m}:00`;
  });
}
function populateSel(sel) {
  sel.innerHTML = buildTimes().map(t => `<option value="${t}">${t.slice(0,5)}</option>`).join("");
}
[startTimeEl, endTimeEl, recurStartTimeEl, recurEndTimeEl].forEach(populateSel);

/* ── Defaults ─────────────────────────────────────────────── */
const todayStr = isoDateOf(new Date());
startDateEl.value = endDateEl.value = recurStartEl.value = todayStr;
startTimeEl.value = endTimeEl.value = recurStartTimeEl.value = "09:00:00";
recurEndTimeEl.value = "17:00:00";

/* ── Day picker ───────────────────────────────────────────── */
dayPills.forEach(pill => {
  pill.addEventListener("click", () => {
    const cb = pill.querySelector("input");
    cb.checked = !cb.checked;
    pill.classList.toggle("is-selected", cb.checked);
    updatePreview(); updateHint();
  });
});
function selectedDays() {
  return [...content.querySelectorAll("input[name=recurDay]:checked")].map(cb => Number(cb.value));
}

/* ── Toggle recurring ─────────────────────────────────────── */
isRecurringEl.addEventListener("change", () => {
  const on = isRecurringEl.checked;
  recurringPanel.style.display     = on ? "block" : "none";
  singleDatePanel.style.display    = on ? "none"  : "block";
  recurringTimePanel.style.display = on ? "block" : "none";
  submitBtn.textContent = on ? "Create recurring shifts" : "Create shift";
  updateHint(); updatePreview();
});

/* ── Ongoing banner ───────────────────────────────────────── */
recurEndEl.addEventListener("change", () => { updateOngoingBanner(); updatePreview(); updateHint(); });
function updateOngoingBanner() {
  ongoingBannerEl.style.display = (isRecurringEl.checked && !recurEndEl.value) ? "block" : "none";
}

/* ── Break ────────────────────────────────────────────────── */
breakModeEl.addEventListener("change", () => {
  const on = breakModeEl.value !== "NONE";
  breakMinutesEl.disabled = !on;
  if (!on) breakMinutesEl.value = "0";
  updateHint();
});

/* ── Change listeners ─────────────────────────────────────── */
[startDateEl, endDateEl, startTimeEl, endTimeEl,
 recurStartEl, recurStartTimeEl, recurEndTimeEl, trackTimeEl, breakMinutesEl]
  .forEach(el => el.addEventListener("change", () => { updateHint(); updatePreview(); }));

/* ── Duration hint ────────────────────────────────────────── */
function updateHint() {
  const track = trackTimeEl.value === "true" ? "Time tracking ON" : "No tracking";
  const bMode = breakModeEl.value;
  const bMins = Number(breakMinutesEl.value || 0);
  const bText = bMode === "PAID" ? `Paid break ${bMins}m` : bMode === "UNPAID" ? `Unpaid break ${bMins}m` : "No break";

  const st = isRecurringEl.checked ? recurStartTimeEl.value : startTimeEl.value;
  const et = isRecurringEl.checked ? recurEndTimeEl.value   : endTimeEl.value;
  const sd = isRecurringEl.checked ? "2000-01-01" : startDateEl.value;
  const ed = isRecurringEl.checked ? "2000-01-01" : endDateEl.value;

  const s = dtMs(sd, st), e = dtMs(ed, et);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) { hintEl.textContent = ""; return; }
  const m = Math.floor((e - s) / 60000);
  const ongoingSuffix = (isRecurringEl.checked && !recurEndEl.value)
    ? " · next shift auto-created 24h before start" : "";
  const label = isRecurringEl.checked ? "Each shift" : "Duration";
  hintEl.textContent = `${label}: ${Math.floor(m/60)}h ${m%60}m · ${bText} · ${track}${ongoingSuffix}`;
}
updateHint();

/* ── Recurring preview ────────────────────────────────────── */
function updatePreview() {
  if (!isRecurringEl.checked) { recurPreviewEl.style.display = "none"; return; }
  const days    = selectedDays();
  const fromStr = recurStartEl.value;
  const toStr   = recurEndEl.value;
  const ongoing = !toStr;

  if (!days.length) {
    dayPickerHintEl.textContent = "Select at least one day.";
    recurPreviewEl.style.display = "none";
    updateOngoingBanner();
    return;
  }
  dayPickerHintEl.textContent = "";
  updateOngoingBanner();
  if (!fromStr) { recurPreviewEl.style.display = "none"; return; }

  if (ongoing) {
    // Just show the first date that matches
    const first = genOccurrences(days, fromStr, null, 1);
    if (!first.length) {
      recurPreviewEl.style.display = "block";
      recurPreviewEl.className = "wl-alert wl-alert--error";
      recurPreviewEl.innerHTML = "No matching date found — try adjusting the start date or selected days.";
      return;
    }
    recurPreviewEl.style.display = "block";
    recurPreviewEl.className = "wl-alert";
    recurPreviewEl.innerHTML = `
      <div style="font-size:14px;font-weight:700;margin-bottom:8px;">♻ First occurrence to be created</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
        <span class="wl-badge wl-badge--active">${escapeHtml(first[0])}</span>
        <span class="wl-subtext">then auto-generated 24h before each subsequent shift</span>
      </div>`;
    return;
  }

  // Fixed end date — show all
  const occ     = genOccurrences(days, fromStr, toStr, 500);
  if (!occ.length) {
    recurPreviewEl.style.display = "block";
    recurPreviewEl.className = "wl-alert wl-alert--error";
    recurPreviewEl.innerHTML = "No occurrences found — check dates and selected days.";
    return;
  }
  const show = occ.slice(0, 5), rest = occ.length - show.length;
  recurPreviewEl.style.display = "block";
  recurPreviewEl.className = "wl-alert";
  recurPreviewEl.innerHTML = `
    <div style="font-size:14px;font-weight:700;margin-bottom:8px;">${occ.length} shift${occ.length===1?"":"s"} will be created</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${show.map(d => `<span class="wl-badge wl-badge--draft">${escapeHtml(d)}</span>`).join("")}
      ${rest > 0 ? `<span class="wl-badge">+${rest} more</span>` : ""}
    </div>`;
}

/* ── Occurrence generator ─────────────────────────────────── */
function isoWeekDay(date) { const d = date.getDay(); return d === 0 ? 7 : d; }
function genOccurrences(days, fromStr, toStr, limit) {
  const daySet  = new Set(days);
  const from    = parseLocalDate(fromStr);
  const to      = toStr ? parseLocalDate(toStr) : new Date(from.getTime() + 14 * 86400000);
  const results = [];
  const cursor  = new Date(from);
  while (cursor <= to && results.length < limit) {
    if (daySet.has(isoWeekDay(cursor))) results.push(isoDateOf(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

/* ── Load employees ───────────────────────────────────────── */
try {
  const members = await listOrgMembers({ organizationId: org.id, roles: ["EMPLOYEE"] });
  employeeSelect.innerHTML = `<option value="">(No assignment)</option>` +
    (members||[]).filter(m => m.role === "EMPLOYEE").map(m => {
      const label = m.full_name || m.email || m.user_id || "";
      return `<option value="${escapeHtml(m.user_id)}">${escapeHtml(label)}</option>`;
    }).join("");
} catch(e) { console.warn("Could not load employees", e); }

/* ── Submit ───────────────────────────────────────────────── */
content.querySelector("#shiftForm").addEventListener("submit", async e => {
  e.preventDefault();
  resultEl.innerHTML = "";

  const title         = titleEl.value.trim();
  const description   = descEl.value.trim();
  const location      = locEl.value.trim();
  const hourlyRate    = Number(rateEl.value);
  const track_time    = trackTimeEl.value === "true";
  const breakMode     = breakModeEl.value;
  const breakMinutes  = Number(breakMinutesEl.value || 0);
  const hasBreak      = breakMode !== "NONE";
  const break_is_paid = breakMode === "PAID";
  const employeeId    = employeeSelect.value || "";
  const isRecurring   = isRecurringEl.checked;

  if (!title)                                       return showErr("Title is required.");
  if (!Number.isFinite(hourlyRate)||hourlyRate <= 0) return showErr("Hourly rate must be > 0.");
  if (hasBreak && breakMinutes <= 0)                return showErr("Break minutes must be > 0 when a break is enabled.");

  const session   = await getSession();
  const createdBy = session?.user?.id;

  /* ──────────── SINGLE SHIFT ──────────── */
  if (!isRecurring) {
    const shift_date = startDateEl.value, end_date = endDateEl.value;
    const start_at   = startTimeEl.value,  end_at   = endTimeEl.value;
    if (!shift_date || !end_date) return showErr("Start and end date are required.");
    if (!start_at   || !end_at)  return showErr("Start and end time are required.");
    const s = dtMs(shift_date, start_at), en = dtMs(end_date, end_at);
    if (!Number.isFinite(s)||!Number.isFinite(en)) return showErr("Invalid date/time.");
    if (en <= s) return showErr("End must be after start.");

    try {
      submitBtn.disabled = true;
      resultEl.innerHTML = `<div class="wl-subtext">Creating shift…</div>`;
      const shift = await createShift({
        organization_id: org.id, title, description, location,
        hourly_rate: hourlyRate, shift_date, end_date, start_at, end_at,
        break_minutes: hasBreak ? breakMinutes : 0,
        break_is_paid: hasBreak ? break_is_paid : true,
        track_time, is_recurring: false,
      });
      if (employeeId) await assignShiftToEmployee({ shiftId: shift.id, employeeUserId: employeeId });
      afterSuccess([shift], employeeId, "single");
    } catch(err) {
      console.error(err); showErr(err?.message || "Failed to create shift.");
    } finally { submitBtn.disabled = false; }
    return;
  }

  /* ──────────── RECURRING ──────────── */
  const days    = selectedDays();
  const fromStr = recurStartEl.value;
  const toStr   = recurEndEl.value;      // "" = ongoing
  const start_at = recurStartTimeEl.value;
  const end_at   = recurEndTimeEl.value;
  const ongoing  = !toStr;

  if (!days.length)          return showErr("Select at least one day.");
  if (!fromStr)              return showErr("Repeat start date is required.");
  if (!start_at || !end_at)  return showErr("Start and end time are required.");
  const s = dtMs("2000-01-01", start_at), en = dtMs("2000-01-01", end_at);
  if (en <= s) return showErr("End time must be after start time.");

  try {
    submitBtn.disabled = true;
    const seriesId = crypto.randomUUID();

    // Save the series template (used by the ticker to auto-generate future occurrences)
    const { error: serErr } = await supabase.from("recurring_series").insert({
      id:                  seriesId,
      organization_id:     org.id,
      created_by_user_id:  createdBy,
      title, description, location,
      hourly_rate:         hourlyRate,
      start_at, end_at,
      break_minutes:       hasBreak ? breakMinutes : 0,
      break_is_paid:       hasBreak ? break_is_paid : true,
      track_time,
      recur_days:          days,
      recur_end_date:      toStr || null,
      assigned_employee_id: employeeId || null,
      is_active:           true,
    });
    if (serErr) throw serErr;

    /* ── ONGOING: create only the first occurrence ── */
    if (ongoing) {
      resultEl.innerHTML = `<div class="wl-subtext">Creating first occurrence…</div>`;
      const firstDates = genOccurrences(days, fromStr, null, 1);
      if (!firstDates.length) return showErr("No matching start date found for the selected days.");

      const shift = await createShift({
        organization_id: org.id, title, description, location,
        hourly_rate: hourlyRate,
        shift_date:  firstDates[0],
        end_date:    firstDates[0],
        start_at, end_at,
        break_minutes: hasBreak ? breakMinutes : 0,
        break_is_paid: hasBreak ? break_is_paid : true,
        track_time,
        is_recurring: true,
        recur_days: days,
        recur_end_date: null,
        recurring_group_id: seriesId,
      });
      if (employeeId) await assignShiftToEmployee({ shiftId: shift.id, employeeUserId: employeeId });
      afterSuccess([shift], employeeId, "ongoing");

    } else {
      /* ── FIXED END DATE: create all occurrences now ── */
      const occ = genOccurrences(days, fromStr, toStr, 500);
      if (!occ.length) return showErr("No occurrences found. Check dates and selected days.");
      if (!confirm(`Create ${occ.length} shift${occ.length===1?"":"s"} (${fromStr} → ${toStr})?`)) {
        submitBtn.disabled = false; return;
      }
      resultEl.innerHTML = `<div class="wl-subtext">Creating ${occ.length} shifts…</div>`;
      const created = [];
      for (const dateStr of occ) {
        const shift = await createShift({
          organization_id: org.id, title, description, location,
          hourly_rate: hourlyRate, shift_date: dateStr, end_date: dateStr,
          start_at, end_at,
          break_minutes: hasBreak ? breakMinutes : 0,
          break_is_paid: hasBreak ? break_is_paid : true,
          track_time,
          is_recurring: true,
          recur_days: days,
          recur_end_date: toStr,
          recurring_group_id: seriesId,
        });
        if (employeeId) await assignShiftToEmployee({ shiftId: shift.id, employeeUserId: employeeId });
        created.push(shift);
      }
      afterSuccess(created, employeeId, "fixed");
    }

  } catch(err) {
    console.error(err); showErr(err?.message || "Failed to create recurring shifts.");
  } finally { submitBtn.disabled = false; }
});

/* ── Post-success ─────────────────────────────────────────── */
function afterSuccess(shifts, employeeId, mode) {
  const first = shifts[0], last = shifts[shifts.length - 1];

  const msgMap = {
    single:  "Shift created ✅",
    ongoing: "Ongoing recurring series started ✅",
    fixed:   `${shifts.length} recurring shifts created ✅`,
  };
  const detailMap = {
    single:  `${escapeHtml(first.shift_date)} · ${first.start_at?.slice(0,5)} → ${first.end_at?.slice(0,5)}`,
    ongoing: `First shift: <strong>${escapeHtml(first.shift_date)}</strong> · ${first.start_at?.slice(0,5)} → ${first.end_at?.slice(0,5)}<br>
              <span class="wl-subtext" style="margin-top:4px;display:block;">
                Next occurrences will appear automatically 24h before each shift starts.
                Set an end date anytime via <strong>Shifts → Recurring Series</strong>.
              </span>`,
    fixed:   `${escapeHtml(first.shift_date)} → ${escapeHtml(last.shift_date)} · ${shifts.length} shifts`,
  };

  const recurBadge = mode !== "single"
    ? `<span style="
        display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;
        background:var(--brand-soft);border:1.5px solid var(--brand-border);color:var(--brand);">
        ♻ Recurring${mode==="ongoing" ? " · Ongoing" : ""}
       </span>` : "";

  resultEl.innerHTML = `
    <div class="wl-alert wl-alert--success">
      <div style="font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        ${msgMap[mode]} ${recurBadge}
      </div>
      <div style="font-size:13px;">
        <div><strong>${escapeHtml(first.title)}</strong></div>
        <div style="margin-top:6px;">${detailMap[mode]}</div>
        ${employeeId ? `<div style="margin-top:6px;opacity:.9;">Employee assigned ✅</div>` : ""}
      </div>
      <a class="wl-btn" href="${path("/app/manager/shifts.html")}" style="display:inline-block;margin-top:14px;">
        View all shifts →
      </a>
    </div>`;

  // Reset form
  content.querySelector("#shiftForm").reset();
  startDateEl.value = endDateEl.value = recurStartEl.value = todayStr;
  recurEndEl.value  = "";
  startTimeEl.value = endTimeEl.value = recurStartTimeEl.value = "09:00:00";
  recurEndTimeEl.value = "17:00:00";
  breakMinutesEl.disabled = true;
  dayPills.forEach(p => { p.classList.remove("is-selected"); p.querySelector("input").checked = false; });
  isRecurringEl.checked = false;
  recurringPanel.style.display     = "none";
  singleDatePanel.style.display    = "block";
  recurringTimePanel.style.display = "none";
  recurPreviewEl.style.display     = "none";
  ongoingBannerEl.style.display    = "none";
  submitBtn.textContent = "Create shift";
  updateHint();
}

function showErr(msg) {
  resultEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(msg)}</div>`;
}

/* ── Utils ────────────────────────────────────────────────── */
function dtMs(dateStr, timeStr) { return new Date(`${dateStr}T${timeStr}`).getTime(); }
function parseLocalDate(s) { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); }
function isoDateOf(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function escapeHtml(str) {
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
