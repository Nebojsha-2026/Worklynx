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
import { listAssignmentsForShift } from "../../data/shiftAssignments.api.js";

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

/** 1) Load shift */
const { data: shift, error } = await supabase
  .from("shifts")
  .select("*")
  .eq("id", shiftId)
  .single();

if (error || !shift) {
  content.innerHTML = `<div class="wl-alert wl-alert--error">Shift not found.</div>`;
  throw error;
}

/** 2) Load employees (for dropdown) */
let employees = [];
let employeesLoadError = null;

try {
  const members = await listOrgMembers({ organizationId: org.id, roles: ["EMPLOYEE"] });
  employees = (members || []).map((m) => ({
    user_id: m.user_id,
    label: (m.full_name || m.email || m.user_id || "").toString(),
    email: (m.email || "").toString(),
    full_name: (m.full_name || "").toString(),
  }));
} catch (e) {
  employeesLoadError = e;
  employees = [];
}

/** 3) Load assignments for this shift and build lookup */
let assignedUserIds = [];
try {
  const assigns = await listAssignmentsForShift({ shiftId });
  assignedUserIds = (assigns || []).map((a) => a.employee_user_id);
} catch (e) {
  // If this fails, we'll still render the page; table will show an error.
  assignedUserIds = [];
}

/** Map user_id -> employee record */
const employeeById = new Map(employees.map((e) => [e.user_id, e]));

/** Build assigned rows (prefer email/full_name if we have them) */
const assignedRows = assignedUserIds.map((uid) => {
  const emp = employeeById.get(uid);
  return {
    user_id: uid,
    full_name: emp?.full_name || "",
    email: emp?.email || "",
    label: emp?.label || uid,
  };
});

/** Render */
content.innerHTML = `
  <h1>${escapeHtml(shift.title || "Untitled shift")}</h1>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <div style="display:grid; gap:10px;">
      <div><b>Status:</b> ${escapeHtml(String(shift.status || "ACTIVE"))}</div>
      <div><b>Date:</b> ${escapeHtml(shift.shift_date)}</div>
      <div><b>Time:</b> ${escapeHtml(shift.start_at)} → ${escapeHtml(shift.end_at)}</div>
      ${shift.location ? `<div><b>Location:</b> ${escapeHtml(shift.location)}</div>` : ""}
      ${shift.hourly_rate != null ? `<div><b>Rate:</b> ${escapeHtml(String(shift.hourly_rate))} / hr</div>` : ""}
      ${shift.description ? `<div><b>Description:</b><br/>${escapeHtml(shift.description)}</div>` : ""}
    </div>
  </section>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <h2 style="margin:0 0 10px;">Assigned employees</h2>

    <div id="assignedMsg" style="margin-bottom:10px;"></div>

    ${
      assignedRows.length
        ? `
      <div style="overflow:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <thead>
            <tr style="text-align:left; opacity:.9;">
              <th style="padding:10px; border-bottom:1px solid var(--wl-border);">Name</th>
              <th style="padding:10px; border-bottom:1px solid var(--wl-border);">Email</th>
              <th style="padding:10px; border-bottom:1px solid var(--wl-border); width:1%; white-space:nowrap;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${assignedRows
              .map(
                (r) => `
              <tr>
                <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">
                  ${escapeHtml(r.full_name || "—")}
                </td>
                <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">
                  ${escapeHtml(r.email || r.label)}
                </td>
                <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">
                  <button class="wl-btn" type="button" data-unassign="${escapeHtml(r.user_id)}">
                    Unassign
                  </button>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
      `
        : `
      <div class="wl-alert" style="opacity:.95;">
        No employees assigned to this shift yet.
      </div>
      `
    }
  </section>

  <section class="wl-card wl-panel" style="margin-top:12px;">
    <h2 style="margin:0 0 10px;">Assign employee</h2>

    ${
      employeesLoadError
        ? `
      <div class="wl-alert wl-alert--error">
        Could not load employees.<br/>
        <span style="opacity:.9; font-size:13px;">${escapeHtml(employeesLoadError?.message || "Unknown error")}</span>
      </div>
      `
        : employees.length
        ? `
      <form id="assignForm" class="wl-form">
        <label>Select employee</label>
        <select id="employeeSelect" required>
          <option value="" selected disabled>Choose an employee…</option>
          ${employees
            .map((e) => `<option value="${escapeHtml(e.user_id)}">${escapeHtml(e.label)}</option>`)
            .join("")}
        </select>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="wl-btn" type="submit">Assign</button>
        </div>
      </form>

      <div id="assignMsg" style="margin-top:10px;"></div>
      `
        : `
      <div class="wl-alert" style="opacity:.95;">
        No employee accounts found in this company yet.
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

/** Bind Assign */
const assignForm = document.querySelector("#assignForm");
const employeeSelect = document.querySelector("#employeeSelect");
const assignMsg = document.querySelector("#assignMsg");

if (assignForm && employeeSelect && assignMsg) {
  assignForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const employeeUserId = employeeSelect.value;
    if (!employeeUserId) return;

    try {
      assignMsg.innerHTML = `<div style="opacity:.85;">Assigning…</div>`;
      await assignShiftToEmployee({ shiftId, employeeUserId });
      assignMsg.innerHTML = `<div class="wl-alert wl-alert--success">Assigned ✅ Refreshing…</div>`;

      // easiest/cleanest: reload to refresh table
      window.location.reload();
    } catch (err) {
      console.error(err);
      assignMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
        err.message || "Failed to assign."
      )}</div>`;
    }
  });
}

/** Bind Unassign buttons (table) */
const assignedMsg = document.querySelector("#assignedMsg");

document.querySelectorAll("[data-unassign]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const employeeUserId = btn.getAttribute("data-unassign");
    if (!employeeUserId) return;

    const emp = employeeById.get(employeeUserId);
    const label = emp?.label || employeeUserId;

    const ok = confirm(`Unassign "${label}" from this shift?`);
    if (!ok) return;

    try {
      btn.disabled = true;
      assignedMsg.innerHTML = `<div style="opacity:.85;">Unassigning…</div>`;
      await unassignShiftFromEmployee({ shiftId, employeeUserId });
      assignedMsg.innerHTML = `<div class="wl-alert wl-alert--success">Unassigned ✅ Refreshing…</div>`;
      window.location.reload();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      assignedMsg.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
        err.message || "Failed to unassign."
      )}</div>`;
    }
  });
});

/** Bind Cancel */
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
      await cancelShift({ shiftId });
      msgEl.innerHTML = `<div class="wl-alert wl-alert--success">Shift cancelled. Refreshing…</div>`;
      window.location.reload();
    } catch (err) {
      console.error(err);
      cancelBtn.disabled = false;
      msgEl.innerHTML = `<div class="wl-alert wl-alert--error">${escapeHtml(
        err.message || "Failed to cancel shift."
      )}</div>`;
    }
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
