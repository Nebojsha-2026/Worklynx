// js/pages/manager/shift.page.js
import { requireRole } from "../../core/guards.js";
import { renderHeader } from "../../ui/header.js";
import { renderFooter } from "../../ui/footer.js";
import { renderSidebar } from "../../ui/sidebar.js";
import { loadOrgContext } from "../../core/orgContext.js";
import { getSupabase } from "../../core/supabaseClient.js";
import { path } from "../../core/config.js";
import { cancelShift } from "../../data/shifts.api.js";
import {
  assignShiftToEmployee,
  unassignShiftFromEmployee,
} from "../../data/assignments.api.js";
import { listOrgMembers } from "../../data/members.api.js";
import { listAssignmentsForShifts } from "../../data/shiftAssignments.api.js";
import {
  notifyShiftAssigned,
  notifyShiftCancelled,
  notifyShiftUpdated,
} from "../../data/notifications.api.js";

await requireRole(["BO", "BM", "MANAGER"]);

const params  = new URLSearchParams(window.location.search);
const shiftId = params.get("id");

if (!shiftId) {
  window.location.replace(path("/app/manager/dashboard.html"));
  throw new Error("Missing shift id");
}

const org      = await loadOrgContext();
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
main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

const content = main.querySelector("#wlContent");
content.innerHTML = `<div style="opacity:.85;">Loading shift…</div>`;

// ── Load shift ─────────────────────────────────────────────────────────────
const { data: shift, error } = await supabase
  .from("shifts")
  .select("*")
  .eq("id", shiftId)
  .single();

if (error || !shift) {
  content.innerHTML = `<div class="wl-alert wl-alert--error">Shift not found.</div>`;
  throw error;
}

// ── Date guard ─────────────────────────────────────────────────────────────
function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const today       = isoToday();
const isPast      = shift.shift_date < today;
const isCancelled = String(shift.status || "").toUpperCase() === "CANCELLED";
const canEdit     = !isPast && !isCancelled;

// ── Load employees + assignments ───────────────────────────────────────────
let employees        = [];
let employeesLoadError = null;

try {
  const members = await listOrgMembers({ organizationId: org.id, roles: ["EMPLOYEE"] });
  employees = (members || []).filter((m) => String(m.role).toUpperCase() === "EMPLOYEE");
} catch (e) {
  employeesLoadError = e;
  employees = [];
}

const labelById = new Map(
  (employees || []).map((m) => [
    m.user_id,
    (m.full_name || m.email || m.user_id || "").toString(),
  ])
);

let assignedIds = [];
try {
  const assigns = await listAssignmentsForShifts({ shiftIds: [shiftId] });
  assignedIds = (assigns || [])
    .filter((a) => a.shift_id === shiftId)
    .map((a) => a.employee_user_id);
} catch (e) {
  console.error("Failed to load assignments:", e);
  assignedIds = [];
}

// ── Build time options ─────────────────────────────────────────────────────
function buildTimeOptions(selected = "") {
  return Array.from({ length: 48 }, (_, i) => {
    const h   = Math.floor(i / 2);
    const m   = i % 2 === 0 ? "00" : "30";
    const val = `${String(h).padStart(2, "0")}:${m}:00`;
    return `<option value="${val}" ${selected && selected.slice(0, 5) === val.slice(0, 5) ? "selected" : ""}>${val.slice(0, 5)}</option>`;
  }).join("");
}

// ── Render page ────────────────────────────────────────────────────────────
const statusBadge = renderStatusBadge(shift.status);
const pastWarning = isPast
  ? `<div class="wl-alert wl-alert--error" style="margin-top:12px;">
       <b>Past shift — editing is disabled.</b>
       <div style="font-size:13px;opacity:.9;margin-top:4px;">Only today's and future shifts can be edited.</div>
     </div>`
  : "";

content.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
    <div style="min-width:0;">
      <h1 style="margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" id="shiftTitleDisplay">
        ${escapeHtml(shift.title || "Untitled shift")}
      </h1>
      <div style="margin-top:8px; font-size:13px; opacity:.85;">
        <b>${escapeHtml(shift.shift_date || "")}</b>
        · ${escapeHtml(shift.start_at?.slice(0, 5) || "")} → ${escapeHtml(shift.end_at?.slice(0, 5) || "")}
        ${shift.location ? ` · 📍 ${escapeHtml(shift.location)}` : ""}
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
      ${statusBadge}
      ${canEdit ? `<button id="editToggleBtn" class="wl-btn" type="button">✏️ Edit shift</button>` : ""}
    </div>
  </div>

  ${pastWarning}

  <!-- ── Edit form (hidden by default) ── -->
  ${canEdit ? `
  <section class="wl-card wl-panel" id="editSection" style="display:none; margin-top:12px;">
    <h2 style="margin:0 0 14px;">Edit shift</h2>
    <form id="editForm" class="wl-form">

      <label>Title</label>
      <input id="editTitle" required value="${escapeHtml(shift.title || "")}" />

      <label>Description</label>
      <textarea id="editDescription" rows="3">${escapeHtml(shift.description || "")}</textarea>

      <label>Location</label>
      <input id="editLocation" value="${escapeHtml(shift.location || "")}" />

      <div class="wl-form__row">
        <div>
          <label>Hourly rate</label>
          <input id="editRate" type="number" step="0.01" min="0" required value="${escapeHtml(String(shift.hourly_rate ?? ""))}" />
        </div>
        <div>
          <label>Time tracking</label>
          <select id="editTrackTime">
            <option value="true"  ${shift.track_time !== false ? "selected" : ""}>Track time (clock in/out)</option>
            <option value="false" ${shift.track_time === false ? "selected" : ""}>No tracking required</option>
          </select>
        </div>
      </div>

      <div class="wl-form__row">
        <div>
          <label>Start date</label>
          <input id="editStartDate" type="date" required value="${escapeHtml(shift.shift_date || "")}" min="${today}" />
        </div>
        <div>
          <label>Start time</label>
          <select id="editStartTime">${buildTimeOptions(shift.start_at || "")}</select>
        </div>
      </div>

      <div class="wl-form__row">
        <div>
          <label>End date</label>
          <input id="editEndDate" type="date" required value="${escapeHtml(shift.end_date || shift.shift_date || "")}" min="${today}" />
        </div>
        <div>
          <label>End time</label>
          <select id="editEndTime">${buildTimeOptions(shift.end_at || "")}</select>
        </div>
      </div>

      <div class="wl-form__row">
        <div>
          <label>Break mode</label>
          <select id="editBreakMode">
            <option value="NONE"   ${!shift.break_minutes ? "selected" : ""}>No break</option>
            <option value="PAID"   ${shift.break_minutes &&  shift.break_is_paid ? "selected" : ""}>Paid break</option>
            <option value="UNPAID" ${shift.break_minutes && !shift.break_is_paid ? "selected" : ""}>Unpaid break</option>
          </select>
        </div>
        <div>
          <label>Break minutes</label>
          <input id="editBreakMinutes" type="number" min="0" step="1"
            value="${escapeHtml(String(shift.break_minutes || 0))}"
            ${!shift.break_minutes ? "disabled" : ""} />
        </div>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
        <button class="wl-btn wl-btn--primary" type="submit" id="editSaveBtn">Save changes</button>
        <button class="wl-btn" type="button" id="editCancelBtn">Cancel</button>
      </div>
    </form>
    <div id="editMsg" style="margin-top:10px;"></div>
  </section>
  ` : ""}

  <!-- ── Shift details ── -->
  <section class="wl-card wl-panel" style="margin-top:12px;" id="detailsSection">
    <div style="display:grid; gap:10px;">
      <div><b>Status:</b> ${escapeHtml(String(shift.status || "ACTIVE"))}</div>
      <div><b>Date:</b> <span id="detailDate">${escapeHtml(shift.shift_date || "")}</span></div>
      <div><b>Time:</b> <span id="detailTime">${escapeHtml(shift.start_at?.slice(0,5) || "")} → ${escapeHtml(shift.end_at?.slice(0,5) || "")}</span></div>
      ${shift.location ? `<div><b>Location:</b> <span id="detailLocation">${escapeHtml(shift.location)}</span></div>` : `<div style="display:none;" id="detailLocationRow"><b>Location:</b> <span id="detailLocation"></span></div>`}
      ${shift.hourly_rate != null ? `<div><b>Rate:</b> <span id="detailRate">$${escapeHtml(String(shift.hourly_rate))}</span>/hr</div>` : ""}
      <div><b>Break:</b> <span id="detailBreak">${shift.break_minutes ? `${shift.break_minutes}min (${shift.break_is_paid ? "paid" : "unpaid"})` : "None"}</span></div>
      <div><b>Time tracking:</b> <span id="detailTracking">${shift.track_time !== false ? "Required" : "Not required"}</span></div>
      ${shift.description ? `<div><b>Description:</b><br/><div id="detailDescription" style="opacity:.9; margin-top:6px;">${escapeHtml(shift.description)}</div></div>` : ""}
    </div>
  </section>

  <!-- ── Assignments ── -->
  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
      <h2 style="margin:0;">Assigned employees</h2>
      <div style="font-size:13px; opacity:.85;">Total: <b id="assignCount">${assignedIds.length}</b></div>
    </div>
    <div id="assignedBlock" style="margin-top:10px;">${renderAssignedTable(assignedIds, labelById)}</div>
    <div id="assignedMsg" style="margin-top:10px;"></div>
  </section>

  ${employees.length ? `
  <section class="wl-card wl-panel" style="margin-top:12px;">
    <h2 style="margin:0 0 10px;">Assign employee</h2>
    <form id="assignForm" class="wl-form">
      <label>Select employee</label>
      <select id="employeeSelect" required>
        <option value="" selected disabled>Choose an employee…</option>
        ${employees.map((m) =>
          `<option value="${escapeHtml(m.user_id)}">${escapeHtml(m.full_name || m.email || m.user_id)}</option>`
        ).join("")}
      </select>
      <button class="wl-btn" type="submit">Assign</button>
    </form>
    <div id="assignMsg" style="margin-top:10px;"></div>
  </section>
  ` : `
  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div class="wl-alert wl-alert--error">
      ${escapeHtml(employeesLoadError?.message || "No employees found for this company.")}
    </div>
  </section>
  `}

  <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
    <a class="wl-btn" href="${path("/app/manager/shifts.html")}">← Back</a>
    ${!isCancelled
      ? `<button id="cancelBtn" class="wl-btn" type="button" ${isPast ? "disabled title='Cannot cancel past shifts'" : ""}>Cancel shift</button>`
      : `<button class="wl-btn" disabled>Cancelled</button>`
    }
  </div>
  <div id="actionMsg" style="margin-top:10px;"></div>
`;

// ── Edit toggle ────────────────────────────────────────────────────────────
const editToggleBtn = document.querySelector("#editToggleBtn");
const editSection   = document.querySelector("#editSection");
const editCancelBtn = document.querySelector("#editCancelBtn");

if (editToggleBtn && editSection) {
  editToggleBtn.addEventListener("click", () => {
    const open = editSection.style.display !== "none";
    editSection.style.display  = open ? "none" : "block";
    editToggleBtn.textContent  = open ? "✏️ Edit shift" : "✖ Close editor";
    if (!open) editSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

if (editCancelBtn && editSection) {
  editCancelBtn.addEventListener("click", () => {
    editSection.style.display = "none";
    if (editToggleBtn) editToggleBtn.textContent = "✏️ Edit shift";
  });
}

// ── Break mode toggle ──────────────────────────────────────────────────────
const editBreakMode    = document.querySelector("#editBreakMode");
const editBreakMinutes = document.querySelector("#editBreakMinutes");

if (editBreakMode && editBreakMinutes) {
  editBreakMode.addEventListener("change", () => {
    const on = editBreakMode.value !== "NONE";
    editBreakMinutes.disabled = !on;
    if (!on) editBreakMinutes.value = "0";
  });
}

// ── Edit form submit ───────────────────────────────────────────────────────
const editForm = document.querySelector("#editForm");
const editMsg  = document.querySelector("#editMsg");

if (editForm) {
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    editMsg.innerHTML = "";

    const newTitle       = document.querySelector("#editTitle").value.trim();
    const newDescription = document.querySelector("#editDescription").value.trim();
    const newLocation    = document.querySelector("#editLocation").value.trim();
    const newRate        = Number(document.querySelector("#editRate").value);
    const newTrackTime   = document.querySelector("#editTrackTime").value === "true";
    const newStartDate   = document.querySelector("#editStartDate").value;
    const newEndDate     = document.querySelector("#editEndDate").value;
    const newStartTime   = document.querySelector("#editStartTime").value;
    const newEndTime     = document.querySelector("#editEndTime").value;
    const newBreakMode   = document.querySelector("#editBreakMode").value;
    const newBreakMins   = Number(document.querySelector("#editBreakMinutes").value || 0);

    // Validation
    if (!newTitle)                                     return showEditErr("Title is required.");
    if (!Number.isFinite(newRate) || newRate <= 0)     return showEditErr("Hourly rate must be greater than 0.");
    if (newStartDate < today)                          return showEditErr("Start date cannot be in the past.");
    if (newEndDate < newStartDate)                     return showEditErr("End date must be on or after start date.");
    if (newBreakMode !== "NONE" && newBreakMins <= 0)  return showEditErr("Break minutes must be greater than 0 when break is enabled.");

    const startMs = new Date(`${newStartDate}T${newStartTime}`).getTime();
    const endMs   = new Date(`${newEndDate}T${newEndTime}`).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return showEditErr("End date/time must be after start date/time.");
    }

    const saveBtn = document.querySelector("#editSaveBtn");
    try {
      saveBtn.disabled    = true;
      saveBtn.textContent = "Saving…";

      const patch = {
        title:         newTitle,
        description:   newDescription || null,
        location:      newLocation    || null,
        hourly_rate:   newRate,
        track_time:    newTrackTime,
        shift_date:    newStartDate,
        end_date:      newEndDate,
        start_at:      newStartTime,
        end_at:        newEndTime,
        break_minutes: newBreakMode !== "NONE" ? newBreakMins : 0,
        break_is_paid: newBreakMode === "PAID",
      };

      const { data: updated, error: updateErr } = await supabase
        .from("shifts")
        .update(patch)
        .eq("id", shiftId)
        .select("*")
        .single();

      if (updateErr) throw updateErr;

      // ── Notify assigned employees that the shift was updated ──────────────
      for (const empId of assignedIds) {
        notifyShiftUpdated({
          employeeUserId: empId,
          orgId:          org.id,
          shiftTitle:     updated.title,
          shiftDate:      updated.shift_date,
          shiftId,
        }).catch(console.warn);
      }

      // Update detail section display
      const detailDate     = document.querySelector("#detailDate");
      const detailTime     = document.querySelector("#detailTime");
      const detailBreak    = document.querySelector("#detailBreak");
      const detailTracking = document.querySelector("#detailTracking");
      const detailLocation = document.querySelector("#detailLocation");
      const detailRate     = document.querySelector("#detailRate");
      const detailDesc     = document.querySelector("#detailDescription");

      document.querySelector("#shiftTitleDisplay").textContent = updated.title || "";
      if (detailDate)     detailDate.textContent     = updated.shift_date || "";
      if (detailTime)     detailTime.textContent     = `${(updated.start_at || "").slice(0,5)} → ${(updated.end_at || "").slice(0,5)}`;
      if (detailBreak)    detailBreak.textContent    = updated.break_minutes
        ? `${updated.break_minutes}min (${updated.break_is_paid ? "paid" : "unpaid"})` : "None";
      if (detailTracking) detailTracking.textContent = updated.track_time !== false ? "Required" : "Not required";
      if (detailLocation) detailLocation.textContent = updated.location || "";
      if (detailRate)     detailRate.textContent     = `$${updated.hourly_rate}`;
      if (detailDesc)     detailDesc.textContent     = updated.description || "";

      editMsg.innerHTML = `<div class="wl-alert wl-alert--success">Shift updated ✅</div>`;
      if (editToggleBtn) editToggleBtn.textContent = "✏️ Edit shift";
      editSection.style.display = "none";

    } catch (err) {
      console.error(err);
      showEditErr(err?.message || "Failed to save changes.");
    } finally {
      saveBtn.disabled    = false;
      saveBtn.textContent = "Save changes";
    }
  });
}

function showEditErr(msg) {
  if (editMsg) {
    editMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(msg)}</div>`;
  }
}

// ── Assignments ────────────────────────────────────────────────────────────
const assignedMsg   = document.querySelector("#assignedMsg");
const assignedBlock = document.querySelector("#assignedBlock");
const assignCountEl = document.querySelector("#assignCount");

if (assignedBlock) {
  assignedBlock.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action='unassign']");
    if (!btn) return;

    const employeeUserId = btn.getAttribute("data-employee-id");
    if (!employeeUserId) return;

    const label = labelById.get(employeeUserId) || employeeUserId;
    if (!confirm(`Unassign "${label}" from this shift?`)) return;

    try {
      assignedMsg.innerHTML = `<div style="opacity:.85;">Unassigning…</div>`;
      btn.disabled = true;

      await unassignShiftFromEmployee({ shiftId, employeeUserId });

      // ── Notify employee their shift was cancelled (unassigned) ────────────
      notifyShiftCancelled({
        employeeUserId,
        orgId:      org.id,
        shiftTitle: shift.title,
        shiftDate:  shift.shift_date,
      }).catch(console.warn);

      assignedIds = assignedIds.filter((id) => id !== employeeUserId);
      assignedBlock.innerHTML = renderAssignedTable(assignedIds, labelById);
      if (assignCountEl) assignCountEl.textContent = assignedIds.length;
      assignedMsg.innerHTML = `<div class="wl-alert wl-alert--success">Unassigned ✅</div>`;
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      assignedMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err.message || "Failed to unassign.")}</div>`;
    }
  });
}

const assignForm     = document.querySelector("#assignForm");
const employeeSelect = document.querySelector("#employeeSelect");
const assignMsg      = document.querySelector("#assignMsg");

if (assignForm && employeeSelect && assignMsg) {
  assignForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const employeeUserId = employeeSelect.value;
    if (!employeeUserId) return;

    if (assignedIds.includes(employeeUserId)) {
      assignMsg.innerHTML = `<div class="wl-alert wl-alert--error">That employee is already assigned.</div>`;
      return;
    }

    try {
      assignMsg.innerHTML = `<div style="opacity:.85;">Assigning…</div>`;
      const btn = assignForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      await assignShiftToEmployee({ shiftId, employeeUserId });

      // ── Notify employee they've been assigned ─────────────────────────────
      notifyShiftAssigned({
        employeeUserId,
        orgId:      org.id,
        shiftTitle: shift.title,
        shiftDate:  shift.shift_date,
        shiftId,
      }).catch(console.warn);

      assignedIds.push(employeeUserId);
      assignedBlock.innerHTML = renderAssignedTable(assignedIds, labelById);
      if (assignCountEl) assignCountEl.textContent = assignedIds.length;

      assignMsg.innerHTML = `<div class="wl-alert wl-alert--success">Assigned ✅</div>`;
      employeeSelect.value = "";
      if (btn) btn.disabled = false;
    } catch (err) {
      console.error(err);
      const btn = assignForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = false;
      assignMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err.message || "Failed to assign.")}</div>`;
    }
  });
}

// ── Cancel shift ───────────────────────────────────────────────────────────
const cancelBtn = document.querySelector("#cancelBtn");
const msgEl     = document.querySelector("#actionMsg");

if (cancelBtn && !isCancelled && !isPast) {
  cancelBtn.addEventListener("click", async () => {
    if (!confirm("Cancel this shift? Employees will no longer be able to work it.")) return;

    try {
      cancelBtn.disabled    = true;
      msgEl.innerHTML = `<div style="opacity:.85;">Cancelling…</div>`;

      await cancelShift({ shiftId });

      // ── Notify all assigned employees the shift is cancelled ───────────────
      for (const empId of assignedIds) {
        notifyShiftCancelled({
          employeeUserId: empId,
          orgId:          org.id,
          shiftTitle:     shift.title,
          shiftDate:      shift.shift_date,
        }).catch(console.warn);
      }

      msgEl.innerHTML = `<div class="wl-alert wl-alert--success">Shift cancelled.</div>`;
      cancelBtn.textContent = "Cancelled";
      if (editToggleBtn) {
        editToggleBtn.disabled      = true;
        editToggleBtn.style.display = "none";
      }
      if (editSection) editSection.style.display = "none";
    } catch (err) {
      console.error(err);
      cancelBtn.disabled = false;
      msgEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(err.message || "Failed to cancel shift.")}</div>`;
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function renderAssignedTable(ids, labelMap) {
  if (!ids.length) {
    return `<div style="opacity:.85;">No employees assigned yet.</div>`;
  }

  const rows = ids.map((id) => {
    const label = labelMap.get(id) || id;
    return `
      <tr>
        <td style="padding:10px 8px; border-top:1px solid var(--wl-border);">
          ${escapeHtml(label)}
          <div style="font-size:12px; opacity:.75; margin-top:2px;"><code>${escapeHtml(id)}</code></div>
        </td>
        <td style="padding:10px 8px; border-top:1px solid var(--wl-border); text-align:right; white-space:nowrap;">
          <button class="wl-btn" type="button" data-action="unassign" data-employee-id="${escapeHtml(id)}">
            Remove
          </button>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div style="overflow:auto;">
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left; padding:8px; opacity:.85; font-size:13px;">Employee</th>
            <th style="text-align:right; padding:8px; opacity:.85; font-size:13px;">Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderStatusBadge(statusRaw) {
  const s   = String(statusRaw || "PUBLISHED").toUpperCase();
  const map = {
    PUBLISHED: { cls: "wl-badge--active",    label: "Active"    },
    ACTIVE:    { cls: "wl-badge--active",    label: "Active"    },
    CANCELLED: { cls: "wl-badge--cancelled", label: "Cancelled" },
    DRAFT:     { cls: "wl-badge--draft",     label: "Draft"     },
    OFFERED:   { cls: "wl-badge--offered",   label: "Offered"   },
  };
  const v = map[s] || { cls: "", label: s };
  return `<span class="wl-badge ${v.cls}">${escapeHtml(v.label)}</span>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&",  "&amp;")
    .replaceAll("<",  "&lt;")
    .replaceAll(">",  "&gt;")
    .replaceAll('"',  "&quot;")
    .replaceAll("'",  "&#039;");
}
