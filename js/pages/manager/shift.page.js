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
import {
  listAssignmentsForShifts, // we’ll use this with [shiftId]
} from "../../data/shiftAssignments.api.js";

await requireRole(["BO", "BM", "MANAGER"]);

const params = new URLSearchParams(window.location.search);
const shiftId = params.get("id");

if (!shiftId) {
  window.location.replace(path("/app/manager/dashboard.html"));
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
main.querySelector("#wlSidebar").append(renderSidebar("MANAGER"));

const content = main.querySelector("#wlContent");
content.innerHTML = `<div style="opacity:.85;">Loading shift…</div>`;

/** -------------------------------------------
 * Load shift
 * ------------------------------------------*/
const { data: shift, error } = await supabase
  .from("shifts")
  .select("*")
  .eq("id", shiftId)
  .single();

if (error || !shift) {
  content.innerHTML = `<div class="wl-alert wl-alert--error">Shift not found.</div>`;
  throw error;
}

/** -------------------------------------------
 * Load employees (members) + assignments
 * ------------------------------------------*/
let employees = [];
let employeesLoadError = null;

try {
  // Employees list for dropdown + label map
  const members = await listOrgMembers({ organizationId: org.id, roles: ["EMPLOYEE"] });
  employees = (members || []).filter((m) => String(m.role).toUpperCase() === "EMPLOYEE");
} catch (e) {
  employeesLoadError = e;
  employees = [];
}

// label lookup
const labelById = new Map(
  (employees || []).map((m) => [
    m.user_id,
    (m.full_name || m.email || m.user_id || "").toString(),
  ])
);

// assignments for this shift (we reuse listAssignmentsForShifts)
let assignedIds = [];
try {
  const assigns = await listAssignmentsForShifts({ shiftIds: [shiftId] });
  assignedIds = (assigns || [])
    .filter((a) => a.shift_id === shiftId)
    .map((a) => a.employee_user_id);
} catch (e) {
  // If assignments load fails, we still render shift details + assign UI
  console.error("Failed to load assignments:", e);
  assignedIds = [];
}

/** -------------------------------------------
 * Render page
 * ------------------------------------------*/
content.innerHTML = `
  <h1>${escapeHtml(shift.title || "Untitled shift")}</h1>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:grid; gap:10px;">
      <div><b>Status:</b> ${escapeHtml(String(shift.status || "ACTIVE"))}</div>
      <div><b>Date:</b> ${escapeHtml(shift.shift_date || "")}</div>
      <div><b>Time:</b> ${escapeHtml(shift.start_at || "")} → ${escapeHtml(shift.end_at || "")}</div>
      ${shift.location ? `<div><b>Location:</b> ${escapeHtml(shift.location)}</div>` : ""}
      ${shift.hourly_rate != null ? `<div><b>Rate:</b> ${escapeHtml(String(shift.hourly_rate))} / hr</div>` : ""}
      ${shift.description ? `<div><b>Description:</b><br/>${escapeHtml(shift.description)}</div>` : ""}
    </div>
  </section>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
      <h2 style="margin:0;">Assigned employees</h2>
      <div style="font-size:13px; opacity:.85;">
        Total: <b>${assignedIds.length}</b>
      </div>
    </div>

    <div id="assignedBlock" style="margin-top:10px;">
      ${renderAssignedTable(assignedIds, labelById)}
    </div>

    <div id="assignedMsg" style="margin-top:10px;"></div>
  </section>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <h2 style="margin:0 0 10px;">Assign employee</h2>

    ${
      employees.length
        ? `
        <form id="assignForm" class="wl-form">
          <label>Select employee</label>
          <select id="employeeSelect" required>
            <option value="" selected disabled>Choose an employee…</option>
            ${employees
              .map(
                (m) =>
                  `<option value="${escapeHtml(m.user_id)}">${escapeHtml(
                    m.full_name || m.email || m.user_id
                  )}</option>`
              )
              .join("")}
          </select>

          <button class="wl-btn" type="submit">Assign</button>
        </form>
        <div id="assignMsg" style="margin-top:10px;"></div>
      `
        : `
        <div class="wl-alert wl-alert--error">
          Could not load employees.<br/>
          <span style="opacity:.9; font-size:13px;">
            ${escapeHtml(employeesLoadError?.message || "No employees found for this company.")}
          </span>
        </div>
      `
    }
  </section>

  <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
    <a class="wl-btn" href="${path("/app/manager/shifts.html")}">← Back</a>
    <button id="cancelBtn" class="wl-btn" type="button">Cancel shift</button>
  </div>

  <div id="actionMsg" style="margin-top:10px;"></div>
`;

/** -------------------------------------------
 * Wire: assigned table actions
 * ------------------------------------------*/
const assignedMsg = document.querySelector("#assignedMsg");
const assignedBlock = document.querySelector("#assignedBlock");

if (assignedBlock) {
  assignedBlock.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action='unassign']");
    if (!btn) return;

    const employeeUserId = btn.getAttribute("data-employee-id");
    if (!employeeUserId) return;

    const label = labelById.get(employeeUserId) || employeeUserId;
    const ok = confirm(`Unassign "${label}" from this shift?`);
    if (!ok) return;

    try {
      assignedMsg.innerHTML = `<div style="opacity:.85;">Unassigning…</div>`;
      btn.disabled = true;

      await unassignShiftFromEmployee({ shiftId, employeeUserId });

      // Update UI locally (no full refresh)
      assignedIds = assignedIds.filter((id) => id !== employeeUserId);
      assignedBlock.innerHTML = renderAssignedTable(assignedIds, labelById);
      assignedMsg.innerHTML = `<div class="wl-alert wl-alert--success">Unassigned ✅</div>`;
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      assignedMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
        err.message || "Failed to unassign."
      )}</div>`;
    }
  });
}

/** -------------------------------------------
 * Wire: assign dropdown
 * ------------------------------------------*/
const assignForm = document.querySelector("#assignForm");
const employeeSelect = document.querySelector("#employeeSelect");
const assignMsg = document.querySelector("#assignMsg");

if (assignForm && employeeSelect && assignMsg) {
  assignForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const employeeUserId = employeeSelect.value;
    if (!employeeUserId) return;

    // Avoid duplicate assign UI-wise
    if (assignedIds.includes(employeeUserId)) {
      assignMsg.innerHTML = `<div class="wl-alert wl-alert--error">That employee is already assigned.</div>`;
      return;
    }

    try {
      assignMsg.innerHTML = `<div style="opacity:.85;">Assigning…</div>`;
      const btn = assignForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      await assignShiftToEmployee({ shiftId, employeeUserId });

      assignedIds.push(employeeUserId);
      assignedBlock.innerHTML = renderAssignedTable(assignedIds, labelById);

      assignMsg.innerHTML = `<div class="wl-alert wl-alert--success">Assigned ✅</div>`;
      employeeSelect.value = "";
      if (btn) btn.disabled = false;
    } catch (err) {
      console.error(err);
      const btn = assignForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = false;
      assignMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
        err.message || "Failed to assign."
      )}</div>`;
    }
  });
}

/** -------------------------------------------
 * Wire: cancel shift
 * ------------------------------------------*/
const cancelBtn = document.querySelector("#cancelBtn");
const msgEl = document.querySelector("#actionMsg");

if (String(shift.status).toUpperCase() === "CANCELLED") {
  cancelBtn.disabled = true;
  cancelBtn.textContent = "Cancelled";
} else {
  cancelBtn.addEventListener("click", async () => {
    const ok = confirm("Cancel this shift? Employees will no longer be able to work it.");
    if (!ok) return;

    try {
      cancelBtn.disabled = true;
      msgEl.innerHTML = `<div style="opacity:.85;">Cancelling…</div>`;

      const updated = await cancelShift({ shiftId });

      msgEl.innerHTML = `<div class="wl-alert wl-alert--success">Shift cancelled.</div>`;
      shift.status = updated.status;
      cancelBtn.textContent = "Cancelled";
    } catch (err) {
      console.error(err);
      cancelBtn.disabled = false;
      msgEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
        err.message || "Failed to cancel shift."
      )}</div>`;
    }
  });
}

/** -------------------------------------------
 * Helpers
 * ------------------------------------------*/
function renderAssignedTable(ids, labelMap) {
  if (!ids.length) {
    return `<div style="opacity:.85;">No employees assigned yet.</div>`;
  }

  const rows = ids
    .map((id) => {
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
    })
    .join("");

  return `
    <div style="overflow:auto;">
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left; padding:8px; opacity:.85; font-size:13px;">Employee</th>
            <th style="text-align:right; padding:8px; opacity:.85; font-size:13px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
